// api/reenviar-correo.js
//
// Endpoint para el botón "reenviar por correo" del admin, junto al botón de
// WhatsApp en OrdersTable.jsx. Reenvía el mismo comprobante (imagen con
// marca + XML) que ya se mandó automático al facturar — no vuelve a facturar
// ni a hablar con Hacienda, solo reutiliza lo que ya se guardó en el pedido.
//
// POST /api/reenviar-correo   body: { "orderId": "..." }

import { JWT } from 'google-auth-library'
import { enviarCorreoFactura } from '../lib/enviar-correo.js'

const PROJECT_ID = 'acosta-food'
const FIRESTORE_BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/default/documents`

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

// --- Mismas conversiones Firestore REST <-> JS que en api/facturar.js ---

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

async function getDocument(client, path) {
  try {
    const res = await client.request({ url: `${FIRESTORE_BASE}/${path}` })
    return fromFirestoreFields(res.data.fields || {})
  } catch (err) {
    const status = err.response?.status
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

    const order = await getDocument(client, `orders/${orderId}`)
    if (!order) {
      return res.status(404).json({ error: 'Pedido no encontrado' })
    }

    if (order.facturaEstado !== 'aceptado') {
      return res.status(409).json({ error: 'Este pedido todavía no tiene un comprobante aceptado por Hacienda' })
    }

    if (!order.facturaXmlBase64) {
      return res.status(409).json({
        error: 'Este pedido no tiene el XML guardado (se facturó antes de este cambio) — no se puede reenviar automáticamente.',
      })
    }

    if (!order.clientEmail) {
      return res.status(400).json({ error: 'El pedido no tiene correo de cliente cargado' })
    }

    const esFactura = order.facturaTipo === 'factura'

    const correo = await enviarCorreoFactura({
      order,
      clave: order.facturaClave,
      numeroConsecutivo: order.facturaConsecutivo,
      xmlFirmadoBase64: order.facturaXmlBase64,
      esFactura,
    })

    await patchDocument(client, `orders/${orderId}`, {
      facturaCorreoEnviado: correo.enviado,
      facturaCorreoMotivo: correo.enviado ? null : (correo.motivo || null),
    })

    if (!correo.enviado) {
      return res.status(502).json({ error: 'No se pudo reenviar el correo', motivo: correo.motivo })
    }

    return res.status(200).json({ ok: true })
  } catch (err) {
    console.error('Error reenviando correo:', err)
    return res.status(500).json({ error: err.message })
  }
}
