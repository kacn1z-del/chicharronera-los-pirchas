// lib/generar-factura-imagen.js
//
// Genera la factura/tiquete de Los Pirchas como imagen (JPEG), superponiendo
// los datos del pedido sobre la plantilla de diseño con marca (fondo fijo en
// lib/assets/plantilla-factura.png — junto a este archivo, no en /public,
// para que Vercel la empaquete siempre con la función serverless).
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

import sharp from 'sharp'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

// Equivalente a __dirname en ES modules (que no lo trae de fábrica).
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const ANCHO_ORIGINAL = 2481
const ALTO_ORIGINAL = 3508

// La plantilla vive junto a este archivo (no en /public) para que Vercel la
// empaquete siempre con la función serverless. Referenciada con __dirname
// (ruta que el "bundler" de Vercel sí rastrea en el build) en vez de
// process.cwd() (ruta en tiempo de ejecución que a veces NO detecta y deja
// el archivo afuera del paquete).
const PLANTILLA_PATH = path.join(__dirname, 'assets', 'plantilla-factura.png')
const LOGO_QR_PATH = path.join(__dirname, 'assets', 'logo-qr.png')
const FONTS_DIR = path.join(__dirname, 'assets', 'fonts')

// FIX DE FUENTES EN VERCEL: el servidor no trae ninguna tipografía
// instalada, así que sin esto el texto del SVG no se dibuja (aunque en
// local sí se vea bien, porque la máquina de desarrollo sí tiene fuentes
// del sistema). Se le arma a fontconfig (el sistema que usa por debajo el
// motor que dibuja el SVG) un archivo de configuración con la ruta
// ABSOLUTA a nuestra carpeta de fuentes — así encuentra "Poppins" pase lo
// que pase con las fuentes del servidor. Se escribe en /tmp porque es la
// única carpeta con permiso de escritura en el servidor de Vercel.
if (!process.env.FONTCONFIG_FILE) {
  const fontsConfContent = `<?xml version="1.0"?>
<!DOCTYPE fontconfig SYSTEM "fonts.dtd">
<fontconfig>
  <dir>${FONTS_DIR}</dir>
  <cachedir>/tmp/fontconfig-cache</cachedir>
</fontconfig>`
  const fontsConfPath = '/tmp/fonts.conf'
  try {
    fs.mkdirSync('/tmp/fontconfig-cache', { recursive: true })
    fs.writeFileSync(fontsConfPath, fontsConfContent)
    process.env.FONTCONFIG_FILE = fontsConfPath
  } catch {
    // Si /tmp no se puede escribir por algún motivo, seguimos sin esto —
    // peor es nada, pero no rompe el resto de la función.
  }
}

// El servidor de Vercel no trae ninguna tipografía instalada, así que el
// texto de un SVG normal no se dibuja ahí (aunque en local sí se vea bien,
// porque la máquina de desarrollo sí tiene fuentes). Para que funcione
// siempre, se incrusta la fuente directamente adentro del SVG como base64
// — así no depende de lo que tenga instalado el servidor.
let FONT_FACE_CSS = null
function getFontFaceCss() {
  if (!FONT_FACE_CSS) {
    const regularB64 = fs.readFileSync(path.join(__dirname, 'assets', 'fonts', 'Poppins-Regular.ttf')).toString('base64')
    const boldB64 = fs.readFileSync(path.join(__dirname, 'assets', 'fonts', 'Poppins-Bold.ttf')).toString('base64')
    FONT_FACE_CSS = `
      <style>
        @font-face {
          font-family: 'Poppins';
          font-weight: 400;
          src: url(data:font/truetype;charset=utf-8;base64,${regularB64}) format('truetype');
        }
        @font-face {
          font-family: 'Poppins';
          font-weight: 700;
          src: url(data:font/truetype;charset=utf-8;base64,${boldB64}) format('truetype');
        }
      </style>
    `
  }
  return FONT_FACE_CSS
}

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

  // La plantilla también trae impresa la URL del panel interno
  // (admin.lospirchas.com) junto al ícono del globo — no corresponde
  // mostrarle esa dirección al cliente en su factura, así que se tapa y se
  // pone un texto de marca en su lugar.
  url_mask: { x: 800, y: 3018, w: 750, h: 58 },
  url_texto: { x: 810, y: 3062, size: 40 },

  consecutivo: { x: 960,  y: 2798, size: 38 },
  clave:       { x: 840,  y: 2856, size: 30 },
  resolucion:  { x: 1350, y: 2940, size: 34 },

  qr: { x: 250, y: 2670, w: 360, h: 360 },
}

const COLOR_FONDO = '#f7f3ee'
const FONT_FAMILY = "'Poppins', 'DejaVu Sans'"

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
    ${getFontFaceCss()}
    <rect x="${c.titulo_mask.x}" y="${c.titulo_mask.y}" width="${c.titulo_mask.w}" height="${c.titulo_mask.h}" fill="${COLOR_FONDO}" />
    <rect x="${c.url_mask.x}" y="${c.url_mask.y}" width="${c.url_mask.w}" height="${c.url_mask.h}" fill="${COLOR_FONDO}" />
    <text x="${c.url_texto.x}" y="${c.url_texto.y}" font-size="${c.url_texto.size}" font-family="${FONT_FAMILY}" fill="#1a1a1a">https://www.lospirchas.com</text>

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
export async function generarFacturaImagen({ order, clave, numeroConsecutivo, esFactura, qrPngBuffer, anchoSalida = 1600 }) {
  const overlaySvg = buildOverlaySvg({ order, clave, numeroConsecutivo, esFactura })

  // El logo va centrado, a un tamaño que no tape más del ~28% del QR (con
  // nivel de corrección de errores "H" el QR sigue leyendo bien aunque el
  // centro esté tapado). qrPngBuffer debe venir generado con
  // errorCorrectionLevel: 'H' — ver lib/enviar-correo.js.
  const qrBase = sharp(qrPngBuffer).resize(COORDS.qr.w, COORDS.qr.h)
  const logoSize = Math.round(COORDS.qr.w * 0.30)
  const logoResized = await sharp(LOGO_QR_PATH).resize(logoSize, logoSize).toBuffer()
  const logoOffset = Math.round((COORDS.qr.w - logoSize) / 2)

  const qrConLogo = await qrBase
    .composite([{ input: logoResized, left: logoOffset, top: logoOffset }])
    .png()
    .toBuffer()

  const composFullRes = await sharp(PLANTILLA_PATH)
    .composite([
      { input: qrConLogo, left: COORDS.qr.x, top: COORDS.qr.y },
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

export { COORDS }
