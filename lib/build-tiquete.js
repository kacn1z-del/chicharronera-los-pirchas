// lib/build-tiquete.js
//
// Convierte un pedido de Los Pirchas (documento de Firestore, colección "orders")
// en un comprobante electrónico listo para firmar y enviar a Hacienda.
//
// Si el pedido trae cédula del cliente -> Factura Electrónica (tipo 01).
// Si no la trae -> Tiquete Electrónico (tipo 04), el caso normal de un
// restaurante vendiendo a consumidor final.
//
// Jaffet Calderón Carvajal está en Régimen de Tributación Simplificada (RTS),
// por lo que NO se cobra IVA línea por línea en los comprobantes.

import {
  buildTiqueteXml,
  buildFacturaXml,
  calculateLineItemTotals,
  calculateInvoiceSummary,
  buildClave,
  DocumentType,
  Situation,
} from '@dojocoding/hacienda-sdk'

// ---------------------------------------------------------------------------
// TODOs: confirmar con tu contador / catálogo CABYS antes de producción.
// ---------------------------------------------------------------------------

const CODIGO_ACTIVIDAD = '561100' // Actividades de restaurantes y servicios móviles de comidas (constancia RUT dice "5610.0")
const CABYS_DEFAULT = '9611000000000' // TODO: confirmar/afinar por categoría de plato

/**
 * @param {object} order - documento de Firestore de la colección "orders"
 *   Se espera: { items: [{ nombre, precio, qty }], paymentMethod,
 *     clientCedula?, clientCedulaTipo?, clientName?, clientEmail? }
 *   Si clientCedula viene presente -> se arma Factura Electrónica (01).
 *   Si no -> Tiquete Electrónico (04).
 * @param {object} emisor - datos fijos del emisor (Los Pirchas)
 * @param {number} sequence - consecutivo del comprobante para ese tipo de documento
 */
export function buildComprobanteFromOrder(order, emisor, sequence) {
  if (!order.items || order.items.length === 0) {
    throw new Error('El pedido no tiene platos, no se puede facturar')
  }

  const esFactura = Boolean(order.clientCedula)
  const documentType = esFactura
    ? DocumentType.FACTURA_ELECTRONICA
    : DocumentType.TIQUETE_ELECTRONICO
  const tipoDocCodigo = esFactura ? '01' : '04'

  // RTS: sin IVA en las líneas. El arreglo "impuesto" queda vacío.
  const lineas = order.items.map((item, idx) => ({
    numeroLinea: idx + 1,
    codigoCabys: CABYS_DEFAULT,
    cantidad: item.qty,
    unidadMedida: 'Unid',
    detalle: item.nombre,
    precioUnitario: item.precio,
    esServicio: true,
    impuesto: [],
  }))

  const lineasCalculadas = lineas.map(calculateLineItemTotals)
  const resumen = calculateInvoiceSummary(lineasCalculadas)

  const clave = buildClave({
    date: new Date(),
    taxpayerId: emisor.cedula,
    documentType,
    sequence,
    situation: Situation.NORMAL,
  })

  // Consecutivo 20 dígitos: sucursal(3) + terminal(5) + tipo(2) + número(10).
  // Misma sucursal/terminal que el sistema anterior (001/00001), continuando
  // la numeración de Facturas Electrónicas desde 1000000053.
  const numeroConsecutivo =
    '001' + '00001' + tipoDocCodigo + String(sequence).padStart(10, '0')

  const emisorXml = {
    nombre: emisor.nombreComercial,
    identificacion: { tipo: '01', numero: emisor.cedula }, // 01 = física (Jaffet Calderón Carvajal)
    ubicacion: {
      provincia: emisor.ubicacion.provincia,
      canton: emisor.ubicacion.canton,
      distrito: emisor.ubicacion.distrito,
      otrasSenas: emisor.ubicacion.otrasSenas,
    },
    correoElectronico: emisor.correoElectronico,
  }

  const base = {
    clave,
    codigoActividadEmisor: CODIGO_ACTIVIDAD,
    numeroConsecutivo,
    fechaEmision: new Date().toISOString(),
    emisor: emisorXml,
    condicionVenta: '01', // Contado
    medioPago: [mapPaymentMethod(order.paymentMethod)],
    detalleServicio: lineasCalculadas,
    resumenFactura: resumen,
  }

  let xml
  if (esFactura) {
    base.receptor = {
      nombre: order.clientName || 'Cliente',
      identificacion: {
        tipo: order.clientCedulaTipo || '01', // 01 = física, por defecto
        numero: order.clientCedula,
      },
      correoElectronico: order.clientEmail || undefined,
    }
    xml = buildFacturaXml(base)
  } else {
    xml = buildTiqueteXml(base)
  }

  return { xml, clave, numeroConsecutivo, tipoDocCodigo }
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
