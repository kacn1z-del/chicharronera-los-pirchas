// lib/enviar-correo.js
//
// Envío del comprobante por correo al cliente. Extraído de api/facturar.js
// para poder reutilizarlo también desde api/reenviar-correo.js (botón manual
// de "reenviar por correo" en el admin) sin duplicar código.
//
// Ahora el correo lleva la factura como IMAGEN adjunta (el diseño con marca
// completo: logo, hamburguesa, cerdo, QR, etc. generado con
// lib/generar-factura-imagen.js) en vez del HTML anterior más simple.

const nodemailer = require('nodemailer')
const QRCode = require('qrcode')
const { generarFacturaImagen } = require('./generar-factura-imagen.js')

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

/**
 * Arma la imagen de la factura y la manda por correo al cliente, adjunta
 * junto con el XML del comprobante.
 *
 * @param {object} opts
 * @param {object} opts.order               - pedido completo
 * @param {string} opts.clave
 * @param {string} opts.numeroConsecutivo
 * @param {string} opts.xmlFirmadoBase64     - XML firmado, en base64 (se adjunta también)
 * @param {boolean} opts.esFactura
 * @returns {Promise<{enviado: boolean, motivo?: string}>}
 */
async function enviarCorreoFactura({ order, clave, numeroConsecutivo, xmlFirmadoBase64, esFactura }) {
  if (!order.clientEmail) return { enviado: false, motivo: 'El pedido no tiene correo de cliente' }
  if (!process.env.EMAIL_SMTP_USER || !process.env.EMAIL_SMTP_PASSWORD) {
    return { enviado: false, motivo: 'Faltan EMAIL_SMTP_USER / EMAIL_SMTP_PASSWORD' }
  }

  const tipoTexto = esFactura ? 'Factura electrónica' : 'Tiquete electrónico'
  const xmlBuffer = Buffer.from(xmlFirmadoBase64, 'base64')

  const qrPngBuffer = await QRCode.toBuffer(clave, { width: 480, margin: 1 })

  const imagenFacturaBuffer = await generarFacturaImagen({
    order,
    clave,
    numeroConsecutivo,
    esFactura,
    qrPngBuffer,
  })

  await getTransportadorCorreo().sendMail({
    from: `"Los Pirchas" <${process.env.EMAIL_SMTP_USER}>`,
    to: order.clientEmail,
    subject: `${tipoTexto} — Los Pirchas — ${numeroConsecutivo}`,
    text:
      `Gracias por su compra en Los Pirchas.\n\n` +
      `${tipoTexto}\n` +
      `Consecutivo: ${numeroConsecutivo}\n` +
      `Clave numérica: ${clave}\n\n` +
      `Adjuntamos el comprobante (imagen) y el XML electrónico, ya aceptado por el Ministerio de Hacienda.`,
    html:
      `<p>Gracias por su compra en Los Pirchas.</p>` +
      `<p>Adjuntamos el comprobante. Consecutivo: ${numeroConsecutivo}</p>`,
    attachments: [
      {
        filename: `factura-${numeroConsecutivo}.jpg`,
        content: imagenFacturaBuffer,
        contentType: 'image/jpeg',
        cid: 'factura-imagen',
      },
      {
        filename: `${clave}.xml`,
        content: xmlBuffer,
        contentType: 'application/xml',
      },
    ],
  })

  return { enviado: true }
}

module.exports = { enviarCorreoFactura, getTransportadorCorreo }

