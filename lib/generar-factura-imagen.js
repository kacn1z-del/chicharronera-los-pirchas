// lib/generar-factura-imagen.js
//
// Genera la factura/tiquete de Los Pirchas como imagen (JPEG), superponiendo
// los datos del pedido sobre la plantilla de diseño con marca (fondo fijo en
// /public/receipt/plantilla-factura.png).
//
// Coordenadas calibradas a mano contra esa plantilla en su resolución
// original (2481x3508 px = A4 a 300dpi). Si en algún momento se reemplaza el
// archivo de plantilla por un diseño distinto, estas coordenadas hay que
// volver a calibrarlas.
//
// LÍMITE ACTUAL: la tabla de la plantilla tiene espacio impreso para 5
// líneas de producto. Si un pedido trae más de 5 líneas distintas, las
// que sobren no se dibujan (se recortan). Si esto empieza a pasar seguido,
// avisame y ajustamos (por ejemplo agrupando ítems repetidos en una sola
// línea, o reduciendo el tamaño de letra para que quepan más).

const sharp = require('sharp')
const path = require('path')

const ANCHO_ORIGINAL = 2481
const ALTO_ORIGINAL = 3508

const PLANTILLA_PATH = path.join(process.cwd(), 'public', 'receipt', 'plantilla-factura.png')

function escapeXml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function formatColones(value) {
  return `₡${Number(value ?? 0).toLocaleString('es-CR')}`
}

const PAGO_LABELS = {
  efectivo: 'Efectivo',
  sinpe: 'SINPE Móvil',
  tarjeta: 'Tarjeta',
}

// Coordenadas de cada campo dinámico (x, y = línea base del texto @300dpi)
const COORDS = {
  cliente:   { x: 520,  y: 1272, size: 42 },
  direccion: { x: 540,  y: 1370, size: 42 },
  fecha:     { x: 500,  y: 1476, size: 42 },
  telefono:  { x: 1670, y: 1272, size: 42 },
  correo:    { x: 1670, y: 1370, size: 42 },

  tabla: {
    filas_y: [1735, 1830, 1925, 2020, 2113], // máximo 5 líneas — ver nota arriba
    cant_x: 310,
    desc_x: 500,
    precio_x: 1650,
    total_x: 2100,
    size: 36,
  },

  total_monto: { x: 2065, y: 2275, size: 56 },
  medio_pago:  { x: 1860, y: 2432, size: 40 },

  // La plantilla ya trae impreso "Tiquete electrónico" como arte fijo. Se
  // tapa con un rectángulo del color de fondo y se escribe encima el
  // título correcto (factura o tiquete, según el pedido).
  titulo_mask: { x: 695, y: 2688, w: 430, h: 56 },
  titulo_tipo: { x: 705, y: 2730, size: 44 },

  consecutivo: { x: 960,  y: 2798, size: 38 },
  clave:       { x: 840,  y: 2856, size: 30 },
  resolucion:  { x: 1350, y: 2940, size: 34 },

  qr: { x: 250, y: 2670, w: 360, h: 360 },
}

const COLOR_FONDO = '#f7f3ee'
const FONT_FAMILY = "'Poppins', 'Helvetica Neue', Arial, sans-serif"

function buildOverlaySvg({ order, clave, numeroConsecutivo, esFactura }) {
  const c = COORDS
  const tipoTexto = esFactura ? 'Factura electrónica' : 'Tiquete electrónico'
  const pagoLabel = PAGO_LABELS[order.paymentMethod] || order.paymentMethod || ''
  const clienteNombre = order.clientName || (order.mesa ? `Mesa ${order.mesa}` : 'Consumidor final')
  const fecha = new Date().toLocaleDateString('es-CR', { day: '2-digit', month: '2-digit', year: 'numeric' })

  let filasSvg = ''
  const items = (order.items || []).slice(0, c.tabla.filas_y.length)
  items.forEach((item, i) => {
    const y = c.tabla.filas_y[i]
    filasSvg += `
      <text x="${c.tabla.cant_x}" y="${y}" font-size="${c.tabla.size}" font-family="${FONT_FAMILY}" text-anchor="middle" fill="#1a1a1a">${item.qty}</text>
      <text x="${c.tabla.desc_x}" y="${y}" font-size="${c.tabla.size}" font-family="${FONT_FAMILY}" fill="#1a1a1a">${escapeXml(item.nombre)}</text>
      <text x="${c.tabla.precio_x}" y="${y}" font-size="${c.tabla.size}" font-family="${FONT_FAMILY}" text-anchor="middle" fill="#1a1a1a">${formatColones(item.precio)}</text>
      <text x="${c.tabla.total_x}" y="${y}" font-size="${c.tabla.size}" font-family="${FONT_FAMILY}" text-anchor="middle" fill="#1a1a1a">${formatColones(item.precio * item.qty)}</text>
    `
  })

  return `
  <svg width="${ANCHO_ORIGINAL}" height="${ALTO_ORIGINAL}" xmlns="http://www.w3.org/2000/svg">
    <rect x="${c.titulo_mask.x}" y="${c.titulo_mask.y}" width="${c.titulo_mask.w}" height="${c.titulo_mask.h}" fill="${COLOR_FONDO}" />

    <text x="${c.cliente.x}" y="${c.cliente.y}" font-size="${c.cliente.size}" font-family="${FONT_FAMILY}" fill="#1a1a1a">${escapeXml(clienteNombre)}</text>
    <text x="${c.direccion.x}" y="${c.direccion.y}" font-size="${c.direccion.size}" font-family="${FONT_FAMILY}" fill="#1a1a1a">${escapeXml(order.direccion || '')}</text>
    <text x="${c.fecha.x}" y="${c.fecha.y}" font-size="${c.fecha.size}" font-family="${FONT_FAMILY}" fill="#1a1a1a">${fecha}</text>
    <text x="${c.telefono.x}" y="${c.telefono.y}" font-size="${c.telefono.size}" font-family="${FONT_FAMILY}" fill="#1a1a1a">${escapeXml(order.clientPhone || '')}</text>
    <text x="${c.correo.x}" y="${c.correo.y}" font-size="${c.correo.size}" font-family="${FONT_FAMILY}" fill="#1a1a1a">${escapeXml(order.clientEmail || '')}</text>

    ${filasSvg}

    <text x="${c.total_monto.x}" y="${c.total_monto.y}" font-size="${c.total_monto.size}" font-family="${FONT_FAMILY}" font-weight="bold" text-anchor="middle" fill="#1a1a1a">${formatColones(order.total)}</text>
    <text x="${c.medio_pago.x}" y="${c.medio_pago.y}" font-size="${c.medio_pago.size}" font-family="${FONT_FAMILY}" fill="#1a1a1a">${pagoLabel}</text>

    <text x="${c.titulo_tipo.x}" y="${c.titulo_tipo.y}" font-size="${c.titulo_tipo.size}" font-family="${FONT_FAMILY}" font-weight="bold" fill="#1a1a1a">${tipoTexto}</text>
    <text x="${c.consecutivo.x}" y="${c.consecutivo.y}" font-size="${c.consecutivo.size}" font-family="${FONT_FAMILY}" fill="#1a1a1a">${escapeXml(numeroConsecutivo)}</text>
    <text x="${c.clave.x}" y="${c.clave.y}" font-size="${c.clave.size}" font-family="${FONT_FAMILY}" fill="#1a1a1a">${escapeXml(clave)}</text>
    <text x="${c.resolucion.x}" y="${c.resolucion.y}" font-size="${c.resolucion.size}" font-family="${FONT_FAMILY}" fill="#1a1a1a">MH-DGT-RES-0027-2024</text>
  </svg>`
}

/**
 * Genera la imagen final de la factura/tiquete con los datos del pedido.
 *
 * @param {object} opts
 * @param {object} opts.order              - pedido: { items, total, clientName, clientEmail, clientPhone, direccion, paymentMethod, mesa }
 * @param {string} opts.clave               - clave numérica de Hacienda
 * @param {string} opts.numeroConsecutivo
 * @param {boolean} opts.esFactura
 * @param {Buffer} opts.qrPngBuffer          - PNG del QR ya generado (con la librería "qrcode")
 * @param {number} [opts.anchoSalida=1600]   - ancho final en px (se reduce para que el adjunto de correo no sea pesado)
 * @returns {Promise<Buffer>} JPEG final
 */
async function generarFacturaImagen({ order, clave, numeroConsecutivo, esFactura, qrPngBuffer, anchoSalida = 1600 }) {
  const overlaySvg = buildOverlaySvg({ order, clave, numeroConsecutivo, esFactura })

  const qrResized = await sharp(qrPngBuffer)
    .resize(COORDS.qr.w, COORDS.qr.h)
    .toBuffer()

  const composFullRes = await sharp(PLANTILLA_PATH)
    .composite([
      { input: qrResized, left: COORDS.qr.x, top: COORDS.qr.y },
      { input: Buffer.from(overlaySvg), left: 0, top: 0 },
    ])
    .png()
    .toBuffer()

  // Se reduce a un ancho razonable para correo (por defecto 1600px, sigue
  // viéndose nítido en pantalla) y se pasa a JPEG para que el adjunto pese
  // pocos cientos de KB en vez de varios MB.
  const final = await sharp(composFullRes)
    .resize({ width: anchoSalida })
    .jpeg({ quality: 92 })
    .toBuffer()

  return final
}

module.exports = { generarFacturaImagen, COORDS }
