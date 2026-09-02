// lib/build-tiquete.js
//
// Convierte un pedido de Los Pirchas (documento de Firestore, colección "orders")
// en un Tiquete Electrónico (tipo 04) listo para firmar y enviar a Hacienda.
//
// Usamos Tiquete Electrónico (no Factura Electrónica) porque es el comprobante
// correcto para ventas a consumidor final sin pedir su cédula — que es el caso
// normal de un restaurante. Si en algún pedido el cliente sí da su cédula y pide
// factura formal, ese caso se arma aparte más adelante (tipo 01).

import {
  buildTiqueteXml,
  calculateLineItemTotals,
  calculateInvoiceSummary,
  buildClave,
  DocumentType,
  Situation,
} from '@dojocoding/hacienda-sdk'

// ---------------------------------------------------------------------------
// TODOs que hay que completar con datos reales de Los Pirchas antes de emitir
// en producción. Sacalos de tu inscripción en TRIBU-CR / el catálogo CABYS.
// ---------------------------------------------------------------------------

// Código de actividad económica de Los Pirchas ante Hacienda (6 dígitos).
// Lo ves en tu inscripción en TRIBU-CR. El de "restaurantes" suele ser 561101,
// pero hay que confirmar cuál te asignó Hacienda a vos específicamente.
const CODIGO_ACTIVIDAD = '561101' // TODO: confirmar

// Código CABYS por defecto para platos de restaurante (venta de comida
// preparada para consumo). Esto es una aproximación — lo ideal es tener un
// CABYS específico por categoría de plato (comida, bebida alcohólica, bebida
// sin alcohol pueden llevar códigos distintos). Por ahora usamos uno solo
// para todo, y lo afinamos con vos después.
const CABYS_DEFAULT = '9611000000000' // TODO: confirmar/afinar por categoría

// Todos los platos de Los Pirchas lo tratamos con IVA general (13%). Si algún
// producto lleva una tarifa distinta (ej. bebidas exoneradas, canasta básica),
// hay que separarlo — avisame cuando sepamos que aplica.
const TARIFA_IVA = 13
const CODIGO_TARIFA_IVA = '08' // "08" = tarifa general 13% en el catálogo de Hacienda

/**
 * @param {object} order - documento de Firestore de la colección "orders"
 *   Se espera: { items: [{ nombre, precio, qty }], total, restaurantName }
 * @param {object} emisor - datos fijos del emisor (Los Pirchas)
 *   { cedula, nombreComercial, correoElectronico }
 * @param {number} sequence - consecutivo del comprobante (ver nota abajo)
 */
export function buildTiqueteFromOrder(order, emisor, sequence) {
  if (!order.items || order.items.length === 0) {
    throw new Error('El pedido no tiene platos, no se puede facturar')
  }

  const lineas = order.items.map((item, idx) => ({
    numeroLinea: idx + 1,
    codigoCabys: CABYS_DEFAULT,
    cantidad: item.qty,
    unidadMedida: 'Unid',
    detalle: item.nombre,
    precioUnitario: item.precio,
    esServicio: true,
    impuesto: [
      {
        codigo: '01', // IVA
        codigoTarifa: CODIGO_TARIFA_IVA,
        tarifa: TARIFA_IVA,
      },
    ],
  }))

  const lineasCalculadas = lineas.map(calculateLineItemTotals)
  const resumen = calculateInvoiceSummary(lineasCalculadas)

  const clave = buildClave({
    date: new Date(),
    taxpayerId: emisor.cedula,
    documentType: DocumentType.TIQUETE_ELECTRONICO,
    sequence,
    situation: Situation.NORMAL,
  })

  // El consecutivo de 20 dígitos sigue un formato fijo: sucursal(3) +
  // terminal(5) + tipo de documento(2) + número(10). Usamos sucursal 001 y
  // terminal 00001 (un solo punto de venta por ahora).
  const numeroConsecutivo =
    '001' + '00001' + '04' + String(sequence).padStart(10, '0')

  const tiquete = {
    clave,
    codigoActividad: CODIGO_ACTIVIDAD,
    numeroConsecutivo,
    fechaEmision: new Date().toISOString(),
    emisor: {
      nombre: emisor.nombreComercial,
      identificacion: { tipo: '02', numero: emisor.cedula }, // 02 = jurídica
      correoElectronico: emisor.correoElectronico,
    },
    // El Tiquete Electrónico no requiere datos del receptor (consumidor final).
    condicionVenta: '01', // Contado
    medioPago: [mapPaymentMethod(order.paymentMethod)],
    detalleServicio: lineasCalculadas,
    resumenFactura: resumen,
  }

  const xml = buildTiqueteXml(tiquete)
  return { xml, clave, numeroConsecutivo }
}

// Traduce el método de pago que ya guardamos en el pedido (efectivo, sinpe,
// tarjeta) al código que espera Hacienda.
function mapPaymentMethod(metodo) {
  switch (metodo) {
    case 'efectivo':
      return '01'
    case 'sinpe':
      return '04' // transferencia/depósito bancario
    case 'tarjeta':
      return '02'
    default:
      return '01'
  }
}
