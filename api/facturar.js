// api/facturar.js
//
// Función serverless de Vercel. Se dispara desde el panel admin cuando cerrás
// una mesa y querés emitir el comprobante electrónico ante Hacienda.
//
// POST /api/facturar   body: { "orderId": "..." }
//
// Emite Factura Electrónica (01) si el pedido trae cédula del cliente,
// o Tiquete Electrónico (04) si no. Misma sucursal/terminal (001/00001)
// que el sistema de facturación anterior del restaurante, continuando su
// numeración de Facturas Electrónicas desde 1000000053 (la última emitida
// por ese sistema fue 1000000052). Los Tiquetes Electrónicos arrancan en 1
// porque ese sistema anterior no los emitía.
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
  DocumentType,
} from '@dojocoding/hacienda-sdk'
import { buildComprobanteFromOrder } from '../lib/build-tiquete.js'

if (!getApps().length) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON)
  initializeApp({ credential: cert(serviceAccount) })
}
const db = getFirestore()

const EMISOR = {
  cedula: process.env.HACIENDA_CEDULA, // ej: "3101234567", sin guiones
  nombreComercial: 'Los Pirchas',
  correoElectronico: process.env.FACTURACION_EMAIL,
  ubicacion: {
    provincia: '1', // San José
    canton: '12', // Acosta
    distrito: '01', // San Ignacio
    otrasSenas: 'Costa Rica', // TODO: poner las señas exactas del local
  },
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
    const orderRef = db.collection('orders').doc(orderId)
    const orderSnap = await orderRef.get()
    if (!orderSnap.exists) {
      return res.status(404).json({ error: 'Pedido no encontrado' })
    }
    const order = orderSnap.data()

    if (order.facturaEstado === 'aceptado') {
      return res.status(409).json({ error: 'Este pedido ya fue facturado' })
    }

    const esFactura = Boolean(order.clientCedula)
    const documentType = esFactura
      ? DocumentType.FACTURA_ELECTRONICA
      : DocumentType.TIQUETE_ELECTRONICO

    const sequence = await getNextSequence(documentType)

    const { xml, clave, numeroConsecutivo } = buildComprobanteFromOrder(
      order,
      EMISOR,
      sequence,
    )

    const p12Buffer = Buffer.from(process.env.HACIENDA_P12_BASE64, 'base64')
    const xmlFirmadoBase64 = await signAndEncode(
      xml,
      p12Buffer,
      process.env.HACIENDA_P12_PIN,
    )

    const environment = process.env.HACIENDA_ENVIRONMENT || 'sandbox'
    const client = new HaciendaClient({
      environment,
      credentials: {
        idType: '02',
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

    await orderRef.update({
      facturaClave: clave,
      facturaConsecutivo: numeroConsecutivo,
      facturaTipo: esFactura ? 'factura' : 'tiquete',
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

// Contador atómico en Firestore, separado por tipo de documento. La primera
// vez que se facture una Factura Electrónica (01), arranca en 1000000053
// para continuar la numeración del sistema anterior del restaurante (última
// emitida: 1000000052). Los Tiquetes Electrónicos (04) arrancan en 1.
async function getNextSequence(documentType) {
  const counterRef = db.collection('_meta').doc('facturacion')
  const key =
    documentType === DocumentType.FACTURA_ELECTRONICA
      ? 'facturaSequence'
      : 'tiqueteSequence'
  const defaultStart =
    documentType === DocumentType.FACTURA_ELECTRONICA ? 1000000052 : 0

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(counterRef)
    const data = snap.exists ? snap.data() : {}
    const current = data[key] ?? defaultStart
    const next = current + 1
    tx.set(counterRef, { [key]: next }, { merge: true })
    return next
  })
}

// ---------------------------------------------------------------------------
// Variables de entorno en Vercel (Project Settings -> Environment Variables):
//
//   HACIENDA_CEDULA, HACIENDA_PASSWORD, HACIENDA_P12_BASE64, HACIENDA_P12_PIN,
//   HACIENDA_ENVIRONMENT, FACTURACION_EMAIL, FIREBASE_SERVICE_ACCOUNT_JSON
// ---------------------------------------------------------------------------
