// api/facturar.js
//
// Función serverless de Vercel. Se dispara desde el panel admin cuando cerrás
// una mesa y querés emitir el comprobante electrónico ante Hacienda.
//
// Usa la API REST de Firestore directamente (no firebase-admin) por
// simplicidad en el entorno serverless de Vercel.
//
// POST /api/facturar   body: { "orderId": "..." }

import { JWT } from 'google-auth-library'
import { signAndEncode, DocumentType } from '@dojocoding/hacienda-sdk'
import { buildComprobanteFromOrder } from '../lib/build-tiquete.js'
import { enviarCorreoFactura } from '../lib/enviar-correo.js'

const PROJECT_ID = 'acosta-food'
// El proyecto usa una base de datos con ID personalizado "default" (sin
// paréntesis) — no la especial reservada "(default)" que usan otros proyectos.
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

// --- Autenticación directa contra el IDP de Hacienda ---
//
// Desde la migración a TRIBU-CR (octubre 2025), el usuario que Hacienda
// genera para conectar sistemas tiene el formato
// "cpf-01-XXXX-XXXX@prod.comprobanteselectronicos.go.cr" (se consigue en
// ovitribucr.hacienda.go.cr → Mi perfil → Contraseña). El SDK todavía arma
// el usuario a su manera internamente y no coincide con ese formato nuevo,
// así que pedimos el token nosotros mismos, con el usuario exacto que
// Hacienda espera (HACIENDA_AUTH_USER), en vez de dejar que la librería lo
// arme sola a partir de la cédula.
let tokenCacheado = null
let tokenCacheadoExpira = 0

async function obtenerAccessToken(environment) {
  const ahora = Date.now()
  if (tokenCacheado && ahora < tokenCacheadoExpira) return tokenCacheado

  const realm = environment === 'production' ? 'rut' : 'rut-stag'
  const clientId = environment === 'production' ? 'api-prod' : 'api-stag'
  const username = process.env.HACIENDA_AUTH_USER
  const password = process.env.HACIENDA_PASSWORD

  if (!username) {
    throw new Error(
      'Falta la variable HACIENDA_AUTH_USER con el usuario completo (ej: cpf-01-1343-0120@prod.comprobanteselectronicos.go.cr)'
    )
  }

  const body = new URLSearchParams({
    grant_type: 'password',
    client_id: clientId,
    username,
    password,
  })

  const respuesta = await fetch(
    `https://idp.comprobanteselectronicos.go.cr/auth/realms/${realm}/protocol/openid-connect/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    }
  )

  if (!respuesta.ok) {
    const texto = await respuesta.text().catch(() => '')
    throw new Error(`Token request failed with status ${respuesta.status} — ${texto || respuesta.statusText}`)
  }

  const datos = await respuesta.json()
  tokenCacheado = datos.access_token
  tokenCacheadoExpira = ahora + (Number(datos.expires_in || 280) - 30) * 1000
  return tokenCacheado
}

// Envío y sondeo del comprobante hablando directo con la API pública de
// Hacienda (v4.4), sin pasar por HttpClient/submitAndWait del SDK. Se usa
// como respaldo si esas utilidades del SDK fallan por un desajuste interno
// de versión.
async function enviarYEsperarDirecto({ baseUrl, environment, clave, comprobanteXml }) {
  const token = await obtenerAccessToken(environment)

  const envioRes = await fetch(`${baseUrl}/recepcion`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      clave,
      fecha: new Date().toISOString(),
      emisor: { tipoIdentificacion: '01', numeroIdentificacion: EMISOR.cedula },
      comprobanteXml,
    }),
  })

  if (envioRes.status !== 201 && envioRes.status !== 202) {
    const texto = await envioRes.text().catch(() => '')
    throw new Error(`Hacienda rechazó el envío (status ${envioRes.status}): ${texto}`)
  }

  const limite = Date.now() + 60000
  while (Date.now() < limite) {
    await new Promise((r) => setTimeout(r, 3000))
    const tokenVigente = await obtenerAccessToken(environment)
    const consultaRes = await fetch(`${baseUrl}/recepcion/${clave}`, {
      headers: { Authorization: `Bearer ${tokenVigente}` },
    })
    if (!consultaRes.ok) continue
    const estado = await consultaRes.json()
    const indEstado = estado['ind-estado']
    if (indEstado === 'aceptado') {
      return { accepted: true }
    }
    if (indEstado === 'rechazado') {
      let motivo = 'Rechazado por Hacienda'
      try {
        const xmlRespuesta = Buffer.from(estado['respuesta-xml'], 'base64').toString('utf-8')
        const match = xmlRespuesta.match(/<DetalleMensaje>([^<]*)<\/DetalleMensaje>/i)
        if (match) motivo = match[1]
      } catch {
        // Si no se puede leer el detalle, se deja el motivo genérico.
      }
      return { accepted: false, rejectionReason: motivo }
    }
    // Si sigue "recibido" o "procesando", seguimos esperando.
  }

  throw new Error('Hacienda no respondió a tiempo (timeout de 60s) — revisá el estado más tarde con la clave: ' + clave)
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
    // Arranca bien por encima de cualquier número ya usado a mano en Tico
    // Factura (la prueba con Pets Mania usó el consecutivo 53) para no
    // volver a chocar con Hacienda por duplicado.
    const defaultStart = esFactura ? 1000000100 : 0

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
    try {
      await obtenerAccessToken(environment)
    } catch (authErr) {
      throw new Error(
        `DIAG auth falló. usuario="${process.env.HACIENDA_AUTH_USER || '(sin definir)'}" — ${authErr.message}`
      )
    }

    const baseUrl =
      environment === 'production'
        ? 'https://api.comprobanteselectronicos.go.cr/recepcion/v1'
        : 'https://api.comprobanteselectronicos.go.cr/recepcion-sandbox/v1'

    const resultado = await enviarYEsperarDirecto({
      baseUrl,
      environment,
      clave,
      comprobanteXml: xmlFirmadoBase64,
    })

    // 6. Guardar el resultado en el pedido
    await patchDocument(client, `orders/${orderId}`, {
      facturaClave: clave,
      facturaConsecutivo: numeroConsecutivo,
      facturaTipo: esFactura ? 'factura' : 'tiquete',
      facturaEstado: resultado.accepted ? 'aceptado' : 'rechazado',
      facturaRechazoMotivo: resultado.accepted ? null : resultado.rejectionReason || null,
      facturaFecha: new Date().toISOString(),
      // Se guarda el XML firmado para poder reenviarlo por correo más tarde
      // sin tener que volver a firmar ni volver a hablar con Hacienda
      // (ver api/reenviar-correo.js).
      facturaXmlBase64: resultado.accepted ? xmlFirmadoBase64 : null,
    })

    if (!resultado.accepted) {
      return res.status(422).json({
        error: 'Hacienda rechazó el comprobante',
        motivo: resultado.rejectionReason,
        clave,
      })
    }

    // 7. Mandar el comprobante por correo al cliente, si tiene correo.
    // (lógica compartida con api/reenviar-correo.js — ver lib/enviar-correo.js)
    let correo = { enviado: false }
    try {
      correo = await enviarCorreoFactura({ order, clave, numeroConsecutivo, xmlFirmadoBase64, esFactura })
    } catch (mailErr) {
      console.error('No se pudo enviar el correo de la factura:', mailErr)
      correo = { enviado: false, motivo: mailErr.message }
    }
    await patchDocument(client, `orders/${orderId}`, {
      facturaCorreoEnviado: correo.enviado,
      // Se guarda también el motivo del fallo (si lo hubo) para que el
      // admin lo pueda mostrar sin tener que ir a buscar los logs de Vercel.
      facturaCorreoMotivo: correo.enviado ? null : (correo.motivo || null),
    })

    return res.status(200).json({
      ok: true,
      clave,
      numeroConsecutivo,
      correoEnviado: correo.enviado,
      correoMotivo: correo.enviado ? undefined : correo.motivo,
    })
  } catch (err) {
    console.error('Error facturando:', err)
    return res.status(500).json({ error: err.message })
  }
}

