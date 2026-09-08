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
import nodemailer from 'nodemailer'
import QRCode from 'qrcode'
import { buildComprobanteFromOrder } from '../lib/build-tiquete.js'

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

// --- Envío del comprobante por correo al cliente ---
//
// Solo aplica cuando el pedido trae un correo del cliente (order.clientEmail)
// — los tiquetes a consumidor final normalmente no lo traen, y no es
// obligatorio enviarlos por correo. Usa el mismo Gmail que ya aparece como
// remitente en el XML (lospirchas24.facturas@gmail.com), vía un "App
// Password" de Google (variables EMAIL_SMTP_USER / EMAIL_SMTP_PASSWORD).
let transportadorCorreo = null
function getTransportadorCorreo() {
  if (!transportadorCorreo) {
    transportadorCorreo = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_SMTP_USER,
        pass: process.env.EMAIL_SMTP_PASSWORD,
      },
    })
  }
  return transportadorCorreo
}

function formatColones(value) {
  return `₡${Number(value ?? 0).toLocaleString('es-CR')}`
}

const PAGO_LABELS = {
  efectivo: 'Efectivo',
  sinpe: 'SINPE Móvil',
  tarjeta: 'Tarjeta',
}

// Plantilla del correo con el diseño de marca de Los Pirchas (usa las
// ilustraciones en /public/receipt/, subidas al sitio para que el correo
// las pueda cargar como imágenes normales).
function buildFacturaEmailHtml({ order, clave, numeroConsecutivo, esFactura, qrDataUrl }) {
  const tipoTexto = esFactura ? 'FACTURA ELECTRÓNICA' : 'TIQUETE ELECTRÓNICO'
  const base = 'https://admin.lospirchas.com'
  const fecha = new Date().toLocaleString('es-CR', {
    day: 'numeric',
    month: 'numeric',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })

  const filasHtml = (order.items || [])
    .map(
      (item) => `
      <tr>
        <td style="padding:8px 6px;border-bottom:1px solid #e6dcc8;text-align:center;">${item.qty}</td>
        <td style="padding:8px 6px;border-bottom:1px solid #e6dcc8;">${item.nombre}</td>
        <td style="padding:8px 6px;border-bottom:1px solid #e6dcc8;text-align:right;">${formatColones(item.precio)}</td>
        <td style="padding:8px 6px;border-bottom:1px solid #e6dcc8;text-align:right;">${formatColones(item.precio * item.qty)}</td>
      </tr>`
    )
    .join('')

  const pagoLabel = PAGO_LABELS[order.paymentMethod] || order.paymentMethod || '—'
  const clienteLinea1 = order.clientName || order.mesa ? `Mesa ${order.mesa}` : 'Pedido telefónico'
  const clienteLinea2 = order.clientPhone || ''

  return `<!doctype html>
<html>
<body style="margin:0;padding:24px 12px;background:#e8dfcf;font-family:Georgia,'Times New Roman',serif;color:#241a10;">
  <table role="presentation" width="100%" style="max-width:520px;margin:0 auto;background:#f6efe3;border:6px solid #d9711f;border-radius:6px;">
    <tr>
      <td style="padding:22px 26px 6px;">

        <table role="presentation" width="100%">
          <tr>
            <td width="70"><img src="${base}/receipt/burger.jpg" width="64" style="border-radius:6px;display:block;" alt="" /></td>
            <td align="center">
              <img src="${base}/receipt/emblem.jpg" width="150" style="display:block;margin:0 auto;" alt="Los Pirchas" />
            </td>
            <td width="70"></td>
          </tr>
        </table>

        <h1 style="text-align:center;font-size:22px;letter-spacing:1px;margin:14px 0 18px;">🔥 ${tipoTexto} 🔥</h1>

        <table role="presentation" width="100%" style="font-size:13px;line-height:1.5;margin-bottom:14px;">
          <tr>
            <td style="vertical-align:top;">
              <strong>Los Pirchas</strong><br/>
              Restaurante y Chicharronera<br/>
              San Luis, Acosta<br/>
              ${fecha}
            </td>
            <td style="vertical-align:top;text-align:right;">
              ${clienteLinea1}<br/>
              ${clienteLinea2}
            </td>
          </tr>
        </table>

        <table role="presentation" width="100%" style="border-collapse:collapse;font-size:13px;">
          <thead>
            <tr style="background:#241a10;color:#fff;">
              <th style="padding:8px 6px;text-align:center;">Cant.</th>
              <th style="padding:8px 6px;text-align:left;">Descripción</th>
              <th style="padding:8px 6px;text-align:right;">Precio Unit.</th>
              <th style="padding:8px 6px;text-align:right;">Total</th>
            </tr>
          </thead>
          <tbody>${filasHtml}</tbody>
        </table>

        <table role="presentation" width="100%" style="margin-top:18px;">
          <tr>
            <td style="vertical-align:middle;font-style:italic;font-size:17px;color:#6b4a2b;">
              ¡Gracias por<br/>su preferencia!
            </td>
            <td align="right">
              <table role="presentation" style="margin-left:auto;">
                <tr>
                  <td style="background:#241a10;color:#fff;font-weight:bold;padding:10px 18px;border-radius:4px;font-size:15px;">
                    TOTAL&nbsp;&nbsp;${formatColones(order.total)}
                  </td>
                </tr>
              </table>
              <p style="font-size:12.5px;margin:8px 0 0;">💲 Pago: ${pagoLabel}</p>
            </td>
          </tr>
        </table>

        <hr style="border:none;border-top:1px solid #d9c9a8;margin:18px 0;" />

        <table role="presentation" width="100%">
          <tr>
            <td width="100" style="vertical-align:top;">
              <img src="${qrDataUrl}" width="92" style="display:block;" alt="QR" />
            </td>
            <td style="vertical-align:top;font-size:11px;line-height:1.6;color:#4a3a28;">
              <strong>${esFactura ? 'Factura electrónica' : 'Tiquete electrónico'}</strong><br/>
              Consecutivo: ${numeroConsecutivo}<br/>
              Clave: <span style="word-break:break-all;">${clave}</span><br/>
              Autorizada mediante resolución N.° MH-DGT-RES-0027-2024<br/>
              🌐 ${base}/ &nbsp; 📅 ${fecha}
            </td>
          </tr>
        </table>

        <p style="text-align:right;font-style:italic;font-size:16px;color:#d9711f;margin:14px 0 4px;">Los Pirchas</p>
      </td>
    </tr>
  </table>
</body>
</html>`
}

async function enviarCorreoFactura({ order, clave, numeroConsecutivo, xmlFirmadoBase64, esFactura }) {
  if (!order.clientEmail) return { enviado: false, motivo: 'El pedido no tiene correo de cliente' }
  if (!process.env.EMAIL_SMTP_USER || !process.env.EMAIL_SMTP_PASSWORD) {
    return { enviado: false, motivo: 'Faltan EMAIL_SMTP_USER / EMAIL_SMTP_PASSWORD' }
  }

  const tipoTexto = esFactura ? 'Factura electrónica' : 'Tiquete electrónico'
  const xmlBuffer = Buffer.from(xmlFirmadoBase64, 'base64')
  const qrDataUrl = await QRCode.toDataURL(clave, { width: 240, margin: 1 })
  const html = buildFacturaEmailHtml({ order, clave, numeroConsecutivo, esFactura, qrDataUrl })

  await getTransportadorCorreo().sendMail({
    from: `"Los Pirchas" <${process.env.EMAIL_SMTP_USER}>`,
    to: order.clientEmail,
    subject: `${tipoTexto} — Los Pirchas — ${numeroConsecutivo}`,
    text:
      `Gracias por su compra en Los Pirchas.\n\n` +
      `${tipoTexto}\n` +
      `Consecutivo: ${numeroConsecutivo}\n` +
      `Clave numérica: ${clave}\n\n` +
      `Adjuntamos el comprobante electrónico en formato XML, ya aceptado por el Ministerio de Hacienda.`,
    html,
    attachments: [
      {
        filename: `${clave}.xml`,
        content: xmlBuffer,
        contentType: 'application/xml',
      },
    ],
  })

  return { enviado: true }
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
    })

    if (!resultado.accepted) {
      return res.status(422).json({
        error: 'Hacienda rechazó el comprobante',
        motivo: resultado.rejectionReason,
        clave,
      })
    }

    // 7. Mandar el comprobante por correo al cliente, si tiene correo.
    let correo = { enviado: false }
    try {
      correo = await enviarCorreoFactura({ order, clave, numeroConsecutivo, xmlFirmadoBase64, esFactura })
    } catch (mailErr) {
      console.error('No se pudo enviar el correo de la factura:', mailErr)
      correo = { enviado: false, motivo: mailErr.message }
    }
    await patchDocument(client, `orders/${orderId}`, {
      facturaCorreoEnviado: correo.enviado,
    })

    return res.status(200).json({ ok: true, clave, numeroConsecutivo, correoEnviado: correo.enviado })
  } catch (err) {
    console.error('Error facturando:', err)
    return res.status(500).json({ error: err.message })
  }
}
