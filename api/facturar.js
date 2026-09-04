// api/facturar.js
//
// Función serverless de Vercel. Se dispara desde el panel admin cuando cerrás
// una mesa y querés emitir el comprobante electrónico ante Hacienda.
//
// Usa la API REST de Firestore directamente (no firebase-admin) porque el
// proyecto usa una base de datos con ID personalizado "default" (sin
// paréntesis) — distinto del especial "(default)" que usan las librerías
// por defecto si no se les indica lo contrario.
//
// POST /api/facturar   body: { "orderId": "..." }

import { JWT } from 'google-auth-library'
import {
  HaciendaClient,
  HttpClient,
  signAndEncode,
  submitAndWait,
  DocumentType,
} from '@dojocoding/hacienda-sdk'
import { buildComprobanteFromOrder } from '../lib/build-tiquete.js'

const PROJECT_ID = 'acosta-food'
const FIRESTORE_BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/default/documents`

const EMISOR = {
  cedula: process.env.HACIENDA_CEDULA,
  nombreComercial: 'Los Pirchas',
  correoElectronico: process.env.FACTURACION_EMAIL,
  ubicacion: {
    provincia: '1',
    canton: '12',
    distrito: '01',
    otrasSenas: 'Barrio María Auxiliadora, diagonal a la panadería Don Tino, edificio nuevo',
  },
}

let authClient = null
function getAuthClient() {
  if (!authClient) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON)
    authClient = new JWT({
      email: serviceAccount.client_email,
      key: serviceAccount.private_key,
      scopes: ['https://www.googleapis.com/auth/datastore'],
    })
  }
  return authClient
}

// --- Conversión entre valores planos de JS y el formato tipado de Firestore REST ---

function fromFirestoreValue(value) {
  if (value == null) return null
  if ('stringValue' in value) return value.stringValue
  if ('integerValue' in value) return Number(value.integerValue)
  if ('doubleValue' in value) return value.doubleValue
  if ('booleanValue' in value) return value.booleanValue
  if ('nullValue' in value) return null
  if ('timestampValue' in value) return value.timestampValue
  if ('mapValue' in value) return fromFirestoreFields(value.mapValue.fields || {})
  if ('arrayValue' in value) return (value.arrayValue.values || []).map(fromFirestoreValue)
  return null
}

function fromFirestoreFields(fields) {
  const out = {}
  for (const key of Object.keys(fields || {})) {
    out[key] = fromFirestoreValue(fields[key])
  }
  return out
}

function toFirestoreValue(value) {
  if (value === null || value === undefined) return { nullValue: null }
  if (typeof value === 'string') return { stringValue: value }
  if (typeof value === 'boolean') return { booleanValue: value }
  if (typeof value === 'number') {
    return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value }
  }
  if (Array.isArray(value)) {
    return { arrayValue: { values: value.map(toFirestoreValue) } }
  }
  if (typeof value === 'object') {
    const fields = {}
    for (const key of Object.keys(value)) {
      fields[key] = toFirestoreValue(value[key])
    }
    return { mapValue: { fields } }
  }
  return { nullValue: null }
}

function toFirestoreFields(obj) {
  const fields = {}
  for (const key of Object.keys(obj)) {
    fields[key] = toFirestoreValue(obj[key])
  }
  return fields
}

// --- Operaciones de Firestore vía REST ---

async function getDocument(client, path) {
  try {
    const res = await client.request({ url: `${FIRESTORE_BASE}/${path}` })
    return fromFirestoreFields(res.data.fields || {})
  } catch (err) {
    const status = err.response?.status
    const body = err.response?.data
    console.error(`getDocument(${path}) fallo — status: ${status}`, JSON.stringify(body))
    if (status === 404) return null
    throw err
  }
}

async function patchDocument(client, path, partialFields) {
  const fieldPaths = Object.keys(partialFields)
  const mask = fieldPaths.map((f) => `updateMask.fieldPaths=${encodeURIComponent(f)}`).join('&')
  await client.request({
    url: `${FIRESTORE_BASE}/${path}?${mask}`,
    method: 'PATCH',
    data: { fields: toFirestoreFields(partialFields) },
  })
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
    const client = getAuthClient()

    // 1. Leer el pedido
    const order = await getDocument(client, `orders/${orderId}`)
    if (!order) {
      return res.status(404).json({ error: 'Pedido no encontrado' })
    }

    if (order.facturaEstado === 'aceptado') {
      return res.status(409).json({ error: 'Este pedido ya fue facturado' })
    }

    // 2. Consecutivo (lectura + escritura simple; volumen bajo, sin necesidad
    // de transacción atómica de Firestore).
    const esFactura = Boolean(order.clientCedula)
    const documentType = esFactura
      ? DocumentType.FACTURA_ELECTRONICA
      : DocumentType.TIQUETE_ELECTRONICO
    const key = esFactura ? 'facturaSequence' : 'tiqueteSequence'
    const defaultStart = esFactura ? 1000000052 : 0

    const meta = (await getDocument(client, '_meta/facturacion')) || {}
    const sequence = (meta[key] ?? defaultStart) + 1
    await patchDocument(client, '_meta/facturacion', { [key]: sequence })

    // 3. Armar el XML del comprobante
    const { xml, clave, numeroConsecutivo } = buildComprobanteFromOrder(
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
    const environment = process.env.HACIENDA_ENVIRONMENT || 'sandbox'
    const haciendaClient = new HaciendaClient({
      environment,
      credentials: {
        idType: '01',
        idNumber: process.env.HACIENDA_AUTH_USER || EMISOR.cedula,
        password: process.env.HACIENDA_PASSWORD,
      },
    })
    await haciendaClient.authenticate()

    const baseUrl =
      environment === 'production'
        ? 'https://api.comprobanteselectronicos.go.cr/recepcion/v1'
        : 'https://api.comprobanteselectronicos.go.cr/recepcion-sandbox/v1'

    const httpClient = new HttpClient({
      baseUrl,
      getToken: () => haciendaClient.getAccessToken(),
    })

    const resultado = await submitAndWait(
      httpClient,
      {
        clave,
        fecha: new Date().toISOString(),
        emisor: {
          tipoIdentificacion: '01',
          numeroIdentificacion: EMISOR.cedula,
        },
        comprobanteXml: xmlFirmadoBase64,
      },
      { pollIntervalMs: 3000, timeoutMs: 60000 },
    )

    // 6. Guardar el resultado en el pedido
    await patchDocument(client, `orders/${orderId}`, {
      facturaClave: clave,
      facturaConsecutivo: numeroConsecutivo,
      facturaTipo: esFactura ? 'factura' : 'tiquete',
      facturaEstado: resultado.accepted ? 'aceptado' : 'rechazado',
      facturaRechazoMotivo: resultado.accepted ? null : resultado.rejectionReason || null,
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
