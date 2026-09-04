// api/facturar.js
//
// Función serverless de Vercel. Se dispara desde el panel admin cuando cerrás
// una mesa y querés emitir el comprobante electrónico ante Hacienda.
//
// POST /api/facturar   body: { "orderId": "..." }
//
// Todo lo sensible (llave .p12, PIN, contraseña de Hacienda, credenciales de
// Firebase) vive en variables de entorno de Vercel — nunca en este archivo ni
// en el repo. Ver la lista completa al final de este archivo.

import { initializeApp, getApps, cert } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import {
  HaciendaClient,
  HttpClient,
  signAndEncode,
  submitAndWait,
} from '@dojocoding/hacienda-sdk'
import { buildTiqueteFromOrder } from '../lib/build-tiquete.js'

// ---------------------------------------------------------------------------
// Firebase Admin (para leer/actualizar el pedido en Firestore desde el servidor)
// ---------------------------------------------------------------------------
if (!getApps().length) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON)
  initializeApp({ credential: cert(serviceAccount) })
}
const db = getFirestore()
db.settings({ preferRest: true })

// ---------------------------------------------------------------------------
// Datos fijos del emisor (Los Pirchas) — el número de cédula NO es secreto,
// pero lo dejamos en variable de entorno igual para no tener que tocar código
// si algún día cambia.
// ---------------------------------------------------------------------------
const EMISOR = {
  cedula: process.env.HACIENDA_CEDULA, // ej: "3101234567", sin guiones
  nombreComercial: 'Los Pirchas',
  correoElectronico: process.env.FACTURACION_EMAIL, // ej: facturacion@lospirchas.com
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Método no permitido' })
  }

  const { orderId } = req.body || {}
  if (!orderId) {
    return res.status(400).json({ error: 'Falta orderId' })
  }

  try {
    // 1. Leer el pedido
    const orderRef = db.collection('orders').doc(orderId)
    const orderSnap = await orderRef.get()
    if (!orderSnap.exists) {
      return res.status(404).json({ error: 'Pedido no encontrado' })
    }
    const order = orderSnap.data()

    if (order.facturaEstado === 'aceptado') {
      return res.status(409).json({ error: 'Este pedido ya fue facturado' })
    }

    // 2. Consecutivo: usamos un contador aparte en Firestore para no repetir
    // números aunque se manden varias facturas a la vez.
    const sequence = await getNextSequence()

    // 3. Armar el XML del tiquete
    const { xml, clave, numeroConsecutivo } = buildTiqueteFromOrder(
      order,
      EMISOR,
      sequence,
    )

    // 4. Firmar con la llave criptográfica (.p12 en base64 -> buffer)
    const p12Buffer = Buffer.from(process.env.HACIENDA_P12_BASE64, 'base64')
    const xmlFirmadoBase64 = await signAndEncode(
      xml,
      p12Buffer,
      process.env.HACIENDA_P12_PIN,
    )

    // 5. Autenticarse contra Hacienda y enviar
    const environment = process.env.HACIENDA_ENVIRONMENT || 'sandbox' // "sandbox" | "production"
    const client = new HaciendaClient({
      environment,
      credentials: {
        idType: '02', // jurídica
        idNumber: EMISOR.cedula,
        password: process.env.HACIENDA_PASSWORD,
      },
    })
    await client.authenticate()

    const baseUrl =
      environment === 'production'
        ? 'https://api.comprobanteselectronicos.go.cr/recepcion/v1'
        : 'https://api.comprobanteselectronicos.go.cr/recepcion-sandbox/v1'

    const httpClient = new HttpClient({
      baseUrl,
      getToken: () => client.getAccessToken(),
    })

    const resultado = await submitAndWait(
      httpClient,
      {
        clave,
        fecha: new Date().toISOString(),
        emisor: {
          tipoIdentificacion: '02',
          numeroIdentificacion: EMISOR.cedula,
        },
        comprobanteXml: xmlFirmadoBase64,
      },
      { pollIntervalMs: 3000, timeoutMs: 60000 },
    )

    // 6. Guardar el resultado en el pedido
    await orderRef.update({
      facturaClave: clave,
      facturaConsecutivo: numeroConsecutivo,
      facturaEstado: resultado.accepted ? 'aceptado' : 'rechazado',
      facturaRechazoMotivo: resultado.accepted
        ? null
        : resultado.rejectionReason || null,
      facturaFecha: new Date().toISOString(),
    })

    if (!resultado.accepted) {
      return res.status(422).json({
        error: 'Hacienda rechazó el comprobante',
        motivo: resultado.rejectionReason,
        clave,
      })
    }

    return res.status(200).json({ ok: true, clave, numeroConsecutivo })
  } catch (err) {
    console.error('Error facturando:', err)
    return res.status(500).json({ error: err.message })
  }
}

// Contador simple y atómico en Firestore para llevar el consecutivo.
async function getNextSequence() {
  const counterRef = db.collection('_meta').doc('facturacion')
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(counterRef)
    const current = snap.exists ? snap.data().tiqueteSequence || 0 : 0
    const next = current + 1
    tx.set(counterRef, { tiqueteSequence: next }, { merge: true })
    return next
  })
}

// ---------------------------------------------------------------------------
// Variables de entorno que hay que crear en Vercel (Project Settings ->
// Environment Variables) para el proyecto chicharronera-los-pirchas:
//
//   HACIENDA_CEDULA            - cédula jurídica de Los Pirchas (sin guiones)
//   HACIENDA_PASSWORD          - contraseña de tu usuario de TRIBU-CR
//   HACIENDA_P12_BASE64        - tu llave .p12 codificada en base64 (ver nota)
//   HACIENDA_P12_PIN           - PIN de 4 dígitos de esa llave
//   HACIENDA_ENVIRONMENT       - "sandbox" mientras probamos, "production" cuando ya esté listo
//   FACTURACION_EMAIL          - correo que aparece como emisor en el comprobante
//   FIREBASE_SERVICE_ACCOUNT_JSON - credenciales de servicio de Firebase (JSON completo, como string)
//
// Ninguno de estos valores va en el código ni se sube al repo.
// ---------------------------------------------------------------------------
