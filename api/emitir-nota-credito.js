// api/emitir-nota-credito.js
//
// Emite una Nota de Crédito Electrónica (tipo de documento 03) que anula
// un tiquete o factura ya aceptado por Hacienda. Es similar a facturar.js
// pero arma el documento con buildNotaCreditoXml() del SDK en lugar de
// buildTiqueteXml()/buildFacturaXml().
//
// POST /api/emitir-nota-credito
// body: {
//   "orderId": "...",        // ID del pedido original (tiquete/factura ya facturado)
//   "motivo": "..."          // Texto explicando por qué se anula (va en "razon")
// }

import { JWT } from 'google-auth-library'
import {
  buildNotaCreditoXml,
  buildClave,
  DocumentType,
  Situation,
  calculateLineItemTotals,
  calculateInvoiceSummary,
  signAndEncode,
} from '@dojocoding/hacienda-sdk'

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

const CODIGO_ACTIVIDAD = '5610.0'
const CABYS_DEFAULT = '6331000000000'
const SUCURSAL = '001'
const TERMINAL = '00001'
const CODIGO_TIPO_NOTA_CREDITO = '03'

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
    throw new Error('Falta HACIENDA_AUTH_USER')
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
    throw new Error(`Token request failed: ${respuesta.status} — ${texto || respuesta.statusText}`)
  }

  const datos = await respuesta.json()
  tokenCacheado = datos.access_token
  tokenCacheadoExpira = ahora + (Number(datos.expires_in || 280) - 30) * 1000
  return tokenCacheado
}

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
    throw new Error(`Hacienda rechazó el envío (${envioRes.status}): ${texto}`)
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
        // Mantener motivo genérico
      }
      return { accepted: false, rejectionReason: motivo }
    }
  }

  throw new Error('Hacienda no respondió a tiempo (timeout 60s) — clave: ' + clave)
}

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

async function setDocument(client, path, data) {
  await client.request({
    url: `${FIRESTORE_BASE}/${path}`,
    method: 'PATCH',
    data: { fields: toFirestoreFields(data) },
  })
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

async function generarSiguienteSecuencia(client, tipo) {
  const key = tipo === 'tiquete' ? 'notaCreditoTiqueteSequence' : 'notaCreditoFacturaSequence'
  const defaultStart = 10000

  const meta = (await getDocument(client, '_meta/facturacion')) || {}
  const sequence = (meta[key] ?? defaultStart) + 1
  await patchDocument(client, '_meta/facturacion', { [key]: sequence })
  return sequence
}

function limpio(valor) {
  return String(valor || '').trim()
}

function soloDigitos(valor) {
  return String(valor || '').replace(/[^0-9]/g, '')
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Método no permitido' })
  }

  const { orderId, motivo } = req.body || {}
  if (!orderId) {
    return res.status(400).json({ error: 'Falta orderId' })
  }

  if (!motivo || !String(motivo).trim()) {
    return res.status(400).json({ error: 'Falta motivo (razón de la anulación)' })
  }

  try {
    const client = getAuthClient()

    const order = await getDocument(client, `orders/${orderId}`)
    if (!order) {
      return res.status(404).json({ error: 'Pedido no encontrado' })
    }

    if (order.facturaEstado !== 'aceptado') {
      return res.status(409).json({
        error: 'Este pedido no puede ser anulado (no fue facturado o fue rechazado)',
      })
    }

    const facturaClave = order.facturaClave
    const facturaConsecutivo = order.facturaConsecutivo
    const facturaTipo = order.facturaTipo || (order.clientCedula ? 'factura' : 'tiquete')

    if (!facturaClave || !facturaConsecutivo) {
      return res.status(400).json({
        error: 'El pedido no tiene datos de factura (clave/consecutivo)',
      })
    }

    const secuencia = await generarSiguienteSecuencia(client, facturaTipo)

    const lineas = (order.items || []).map((item, idx) => ({
      numeroLinea: idx + 1,
      codigoCabys: CABYS_DEFAULT,
      cantidad: item.qty,
      unidadMedida: 'Unid',
      detalle: item.nombre,
      precioUnitario: item.precio,
      esServicio: true,
      impuesto: [{ codigo: '01', codigoTarifaIVA: '01', tarifa: 0 }],
    }))

    if (order.envioExpress > 0) {
      lineas.push({
        numeroLinea: lineas.length + 1,
        codigoCabys: CABYS_DEFAULT,
        cantidad: 1,
        unidadMedida: 'Unid',
        detalle: 'Servicio de entrega express',
        precioUnitario: order.envioExpress,
        esServicio: true,
        impuesto: [{ codigo: '01', codigoTarifaIVA: '01', tarifa: 0 }],
      })
    }

    const lineasCalculadas = lineas.map(calculateLineItemTotals)
    const resumen = calculateInvoiceSummary(lineasCalculadas)

    const totalLineas = lineasCalculadas.reduce((sum, l) => sum + l.montoTotalLinea, 0)
    resumen.totalServGravados = 0
    resumen.totalServExentos = 0
    resumen.totalServExonerado = 0
    resumen.totalServNoSujeto = totalLineas
    resumen.totalGravado = 0
    resumen.totalExento = 0
    resumen.totalExonerado = 0
    resumen.totalNoSujeto = totalLineas
    resumen.totalVenta = totalLineas
    resumen.totalVentaNeta = totalLineas
    resumen.totalDesgloseImpuesto = [{ codigo: '01', codigoTarifaIVA: '01', totalMontoImpuesto: 0 }]
    resumen.totalImpuesto = 0
    resumen.totalComprobante = totalLineas

    resumen.medioPago = [
      {
        tipoMedioPago: mapPaymentMethod(order.paymentMethod),
        totalMedioPago: totalLineas,
      },
    ]

    const clave = buildClave({
      date: new Date(),
      taxpayerId: EMISOR.cedula,
      documentType: DocumentType.NOTA_CREDITO_ELECTRONICA,
      sequence: secuencia,
      situation: Situation.NORMAL,
    })

    const numeroConsecutivo = SUCURSAL + TERMINAL + CODIGO_TIPO_NOTA_CREDITO + String(secuencia).padStart(10, '0')

    const emisorXml = {
      nombre: EMISOR.nombreComercial,
      identificacion: { tipo: '01', numero: EMISOR.cedula },
      ubicacion: {
        provincia: EMISOR.ubicacion.provincia,
        canton: EMISOR.ubicacion.canton,
        distrito: EMISOR.ubicacion.distrito,
        otrasSenas: EMISOR.ubicacion.otrasSenas,
      },
      correoElectronico: EMISOR.correoElectronico,
    }

    const esFactura = facturaTipo === 'factura'
    const tipoDocOriginal = esFactura ? '01' : '04'

    const documento = {
      clave,
      codigoActividadEmisor: CODIGO_ACTIVIDAD,
      proveedorSistemas: EMISOR.cedula,
      numeroConsecutivo,
      fechaEmision: new Date().toISOString(),
      emisor: emisorXml,
      condicionVenta: '01',
      detalleServicio: lineasCalculadas,
      resumenFactura: resumen,
      ...(esFactura && order.clientCedula && {
        receptor: {
          nombre: order.clientName || 'Cliente',
          identificacion: {
            tipo: order.clientCedulaTipo || '01',
            numero: order.clientCedula,
          },
          correoElectronico: order.clientEmail || undefined,
        },
      }),
      informacionReferencia: [
        {
          tipoDoc: tipoDocOriginal,
          numero: soloDigitos(facturaClave),
          fechaEmision: order.facturaFecha || new Date().toISOString(),
          codigo: '01',
          razon: limpio(motivo).slice(0, 180) || 'Anulación del comprobante',
        },
      ],
    }

    const xml = buildNotaCreditoXml(documento)

    const p12Buffer = Buffer.from(process.env.HACIENDA_P12_BASE64, 'base64')
    const xmlFirmadoBase64 = await signAndEncode(
      xml,
      p12Buffer,
      process.env.HACIENDA_P12_PIN,
    )

    const environment = process.env.HACIENDA_ENVIRONMENT || 'sandbox'
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

    const notaCredito = {
      clave,
      numeroConsecutivo,
      tipo: 'notaCredito',
      claveReferenciada: soloDigitos(facturaClave),
      ordenReferenciada: orderId,
      estado: resultado.accepted ? 'aceptado' : resultado.accepted === false ? 'rechazado' : 'pendiente',
      motivoRechazo: resultado.accepted === false ? resultado.rejectionReason : null,
      motivo,
      fecha: new Date().toISOString(),
      emisorNombre: EMISOR.nombreComercial,
      receptorNombre: order.clientName || null,
      receptorCedula: order.clientCedula || null,
      total: totalLineas,
      lineas,
      xmlFirmadoBase64,
      ambiente: environment,
    }

    await setDocument(client, `notasCredito/${clave}`, notaCredito)

    await patchDocument(client, `orders/${orderId}`, {
      notaCreditoClave: clave,
      notaCreditoConsecutivo: numeroConsecutivo,
      notaCreditoFecha: new Date().toISOString(),
      notaCreditoEstado: resultado.accepted ? 'aceptado' : 'rechazado',
    })

    return res.status(200).json({
      ok: true,
      clave,
      numeroConsecutivo,
      claveReferenciada: soloDigitos(facturaClave),
      aceptado: resultado.accepted,
      pendiente: resultado.pending === true,
      motivoRechazo: resultado.accepted === false ? resultado.rejectionReason : null,
      mensajePendiente: resultado.pending === true
        ? 'Hacienda no confirmó a tiempo, pero la nota de crédito SÍ fue recibida.'
        : null,
      ambiente: environment,
    })
  } catch (err) {
    console.error('Error al emitir nota de crédito:', err)
    return res.status(500).json({
      error: err.message || 'No se pudo emitir la nota de crédito',
    })
  }
}

function mapPaymentMethod(metodo) {
  switch (metodo) {
    case 'efectivo':
      return '01'
    case 'sinpe':
      return '04'
    case 'tarjeta':
      return '02'
    default:
      return '01'
  }
}
