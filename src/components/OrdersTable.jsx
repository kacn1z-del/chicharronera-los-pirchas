import { useEffect, useState } from 'react'
import { collection, deleteDoc, doc, onSnapshot, orderBy, query, updateDoc, writeBatch } from 'firebase/firestore'
import { db, writeAndContinue } from '../firebase'
import { asegurarNumeroPedido, formatNumeroPedido } from '../lib/pedidoNumero'

const STATUS_LABELS = {
  pending_approval: { label: 'Pendiente de aprobación', tone: 'red' },
  pending: { label: 'Pendiente', tone: 'amber' },
  preparing: { label: 'Preparando', tone: 'blue' },
  listo: { label: 'Listo en cocina', tone: 'green' },
  on_the_way: { label: 'En camino', tone: 'green' },
  delivered: { label: 'Entregado', tone: 'gray' },
  cancelled: { label: 'Cancelado', tone: 'red' },
}

const FACTURA_LABELS = {
  aceptado: { label: 'Facturado', tone: 'green' },
  rechazado: { label: 'Rechazado', tone: 'red' },
}

const ORIGEN_LABELS = {
  salon: { label: 'Salón', tone: 'green' },
  telefono: { label: 'Teléfono', tone: 'blue' },
  'cliente-web': { label: 'Página web', tone: 'amber' },
}

// Umbral por defecto para avisar stock bajo cuando el producto de inventario
// no tiene un "minimo" propio configurado.
const UMBRAL_DEFECTO = 5

export function orderOrigen(order) {
  if (order.origen) return order.origen
  // Pedidos creados antes de que existiera el campo "origen": lo inferimos.
  if (order.mesa) return 'salon'
  if (order.clientAddress) return 'cliente-web'
  return 'telefono'
}

function origenInfo(order) {
  return ORIGEN_LABELS[orderOrigen(order)] ?? { label: 'Desconocido', tone: 'gray' }
}

function statusInfo(status) {
  return STATUS_LABELS[status] ?? { label: status || 'Sin estado', tone: 'gray' }
}

function formatTime(createdAt) {
  if (!createdAt) return '—'
  const date = typeof createdAt === 'number' ? new Date(createdAt) : createdAt?.toDate?.()
  if (!date) return '—'
  return date.toLocaleTimeString('es-CR', { hour: '2-digit', minute: '2-digit' })
}

// Normaliza un teléfono de Costa Rica al formato que necesita wa.me:
// código de país (506) + los 8 dígitos, sin espacios ni guiones. Sin el
// código de país, WhatsApp intenta adivinar el país del número y a veces
// arma un número inválido/recortado (el bug que reportó el cliente).
function normalizeCrPhone(raw) {
  let phone = (raw || '').replace(/[^\d]/g, '')
  if (!phone) return null
  // Ya viene con código de país (506 + 8 dígitos = 11 en total).
  if (phone.length === 11 && phone.startsWith('506')) return phone
  // Caso normal: 8 dígitos locales -> le anteponemos 506.
  if (phone.length === 8) return `506${phone}`
  // Algunos capturan con un 0 pegado adelante por error (08888-1234).
  if (phone.length === 9 && phone.startsWith('0')) return `506${phone.slice(1)}`
  // Cualquier otro largo es un número mal cargado — mejor no armar un
  // link roto que abra el chat de otra persona; se oculta el botón.
  return null
}

function whatsappLink(order) {
  const phone = normalizeCrPhone(order.clientPhone)
  if (!phone) return null
  const message = encodeURIComponent(
    `Hola ${order.clientName || ''}, tu pedido #${order.id.slice(0, 6)} en la chicharronera Los Pirchas está: ${
      statusInfo(order.status).label
    }.`
  )
  return `https://wa.me/${phone}?text=${message}`
}

// Enlace de WhatsApp para mandarle al cliente los datos del comprobante ya
// aceptado (clave, consecutivo, total) — se usa una vez facturado, junto al
// correo automático.
function whatsappFacturaLink(order) {
  const phone = normalizeCrPhone(order.clientPhone)
  if (!phone || !order.facturaClave) return null
  const tipoTexto = order.facturaTipo === 'factura' ? 'Factura electrónica' : 'Tiquete electrónico'
  const message = encodeURIComponent(
    `Hola ${order.clientName || ''}, aquí tenés el comprobante de tu pedido en Los Pirchas.\n\n` +
      `${tipoTexto}\n` +
      `Consecutivo: ${order.facturaConsecutivo}\n` +
      `Clave: ${order.facturaClave}\n` +
      `Total: ${formatColones(order.total)}`
  )
  return `https://wa.me/${phone}?text=${message}`
}

function itemsSummary(order) {
  if (!Array.isArray(order.items) || order.items.length === 0) return '—'
  return order.items.map((i) => `${i.qty}× ${i.nombre}${i.nota ? ` (${i.nota})` : ''}`).join(', ')
}

// Mostrar desglose de pagos (simple o dividido)
function paymentBreakdown(order) {
  if (!order.paymentMethod) return '—'

  if (order.paymentMethod === 'dividido' && order.payments) {
    return order.payments.map((p, i) => (
      <div key={i} style={{ fontSize: '11px', marginBottom: '4px' }}>
        <strong>{p.persona}</strong>: {formatColones(p.monto)}
        <div style={{ fontSize: '10px', color: 'var(--ink-400)' }}>
          {p.metodo === 'efectivo' && '💵'}
          {p.metodo === 'tarjeta' && '💳'}
          {p.metodo === 'sinpe' && '📱'} {p.metodo}
        </div>
      </div>
    ))
  }

  if (order.paymentMethod === 'mixto' && order.montos) {
    return (
      <div style={{ fontSize: '11px' }}>
        {order.montos.efectivo > 0 && <div>💵 Efectivo: {formatColones(order.montos.efectivo)}</div>}
        {order.montos.tarjeta > 0 && <div>💳 Tarjeta: {formatColones(order.montos.tarjeta)}</div>}
        {order.montos.sinpe > 0 && <div>📱 SINPE: {formatColones(order.montos.sinpe)}</div>}
      </div>
    )
  }

  const icons = {
    efectivo: '💵',
    tarjeta: '💳',
    sinpe: '📱',
  }

  return (
    <div style={{ fontSize: '12px' }}>
      {icons[order.paymentMethod] || '💰'} {order.paymentMethod}
    </div>
  )
}

function serviceLabel(order) {
  if (order.tipo === 'salon') return 'En mesa'
  if (order.tipo === 'llevar') return 'Para llevar'
  if (order.tipo === 'express') return 'Express'
  return null
}

function formatColones(value) {
  return `₡${Number(value ?? 0).toLocaleString('es-CR')}`
}

async function printReceipt(order) {
  try {
    const numeroPedido = await Promise.race([
      asegurarNumeroPedido(order),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Tardó demasiado (10s) — revisá tu conexión o los permisos de Firestore.')), 10000)),
    ])
    const itemsHtml = (order.items || [])
      .map(
        (item) =>
          `<tr><td>${item.qty} × ${item.nombre}</td><td class="price">${formatColones(
            item.precio * item.qty
          )}</td></tr>`
      )
      .join('')
    // Mismo criterio que en la factura electrónica (lib/build-tiquete.js):
    // el cargo de envío express se desglosa como su propia línea, en vez de
    // quedar escondido dentro del total.
    const expressHtml =
      order.envioExpress > 0
        ? `<tr><td>1 × Servicio de entrega express</td><td class="price">${formatColones(order.envioExpress)}</td></tr>`
        : ''

    // Si ya está facturado ante Hacienda, el recibo incluye los datos del
    // comprobante electrónico (clave, consecutivo, resolución) — igual que
    // trae cualquier factura o tiquete electrónico oficial.
    const facturado = order.facturaEstado === 'aceptado' && order.facturaClave
    const facturaHtml = facturado
      ? `
  <div class="factura">
    <p class="meta center"><strong>${order.facturaTipo === 'factura' ? 'Factura' : 'Tiquete'} electrónico</strong></p>
    <p class="meta center">Consecutivo: ${order.facturaConsecutivo || '—'}</p>
    <p class="clave">Clave: ${order.facturaClave}</p>
    <p class="meta center">Autorizada mediante resolución N.° MH-DGT-RES-0027-2024</p>
  </div>`
      : ''

    const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="UTF-8" />
<title>Recibo — Los Pirchas</title>
<style>
  @page { size: 58mm auto; margin: 0; }
  * { box-sizing: border-box; }
  /* 48mm y pegado al borde izquierdo (margin: 0, no "0 auto"): aunque el
     rollo mida 58mm, el cabezal de la mayoría de impresoras térmicas de
     este tamaño solo imprime de verdad unos 46-48mm de ancho, y esa área
     imprimible arranca desde el borde izquierdo del rollo — no está
     centrada. Con "margin: 0 auto" el bloque quedaba centrado dentro de
     los 58mm declarados, así que se corría hacia la derecha y el borde
     derecho (los precios) se cortaba. Pegándolo a la izquierda entra
     completo dentro del área que la impresora sí imprime. */
  /* 42mm en vez de 48mm: el cabezal de esta impresora en particular
     imprime un área real más angosta que 48mm dentro del rollo de 58mm —
     con 48mm el lado derecho (los precios, alineados a la derecha) se
     seguía cortando en el papel físico, aunque en la vista previa del
     celular se viera completo. */
  body { font-family: -apple-system, Arial, sans-serif; color: #000; padding: 3mm 1mm 3mm 1mm; width: 42mm; margin: 0; }
  .center { text-align: center; }
  .logo { width: 100%; display: block; margin: 0 auto 4px; }
  .sub { font-size: 10px; margin-bottom: 8px; }
  .meta { font-size: 10px; margin: 2px 0; }
  .items { margin: 8px 0; padding: 6px 0; border-top: 1px dashed #000; border-bottom: 1px dashed #000; }
  /* Tabla en vez de flexbox: algunos motores de impresión térmica (vía
     AirPrint) no soportan bien CSS Flexbox y simplemente descartan la
     columna de precio sin avisar. Las tablas HTML las soporta prácticamente
     cualquier motor de impresión, por viejo o limitado que sea. */
  .items table, .total table { width: 100%; border-collapse: collapse; }
  .items td { font-size: 11px; padding: 0 0 3px; vertical-align: top; }
  .total td { font-weight: 700; font-size: 13px; padding: 0; }
  td.price { text-align: right; white-space: nowrap; padding-left: 4px; }
  .payment { font-size: 10px; text-align: center; margin-top: 3px; }
  .factura { margin-top: 8px; padding-top: 6px; border-top: 1px dashed #000; }
  .clave { font-size: 8px; text-align: center; word-break: break-all; margin: 2px 0; }
  .gracias { display: flex; align-items: center; justify-content: center; gap: 6px; margin: 10px 0 6px; }
  .gracias img { width: 15mm; height: auto; }
  .gracias span { font-size: 11px; font-style: italic; }
  .iconrow { width: 100%; display: block; margin-top: 6px; }
</style>
</head>
<body>
  <div class="center">
    <img class="logo" src="/receipt/ticket-logo.jpg" alt="Los Pirchas" />
    <p class="sub">Restaurante y Chicharronera</p>
  </div>
  <p class="meta center">${formatNumeroPedido(numeroPedido)} · ${formatTime(order.createdAt)}</p>
  <p class="meta center">${order.clientName || order.mesa || ''}${order.clientPhone ? ' · ' + order.clientPhone : ''}</p>
  ${order.clientAddress ? `<p class="meta center">${order.clientAddress}</p>` : ''}
  <div class="items"><table><tbody>${itemsHtml}${expressHtml}</tbody></table></div>
  <div class="total"><table><tr><td>Total</td><td class="price">${formatColones(order.total)}</td></tr></table></div>
  <p class="payment">Pago: ${order.paymentMethod || '—'}</p>
  ${facturaHtml}
  <div class="gracias">
    <img src="/receipt/ticket-burger.jpg" alt="" />
    <span>¡Gracias por su preferencia!</span>
    <img src="/receipt/ticket-fries.jpg" alt="" />
  </div>
  <img class="iconrow" src="/receipt/ticket-iconrow.png" alt="" />
</body>
</html>`

    // En vez de abrir una ventana nueva (bloqueada o restringida de formas
    // impredecibles por Safari/Chrome en el celular), se imprime desde un
    // iframe invisible dentro de la misma página — no depende de popups.
    const iframeAnterior = document.getElementById('recibo-print-frame')
    if (iframeAnterior) iframeAnterior.remove()

    const iframe = document.createElement('iframe')
    iframe.id = 'recibo-print-frame'
    iframe.style.position = 'fixed'
    iframe.style.right = '0'
    iframe.style.bottom = '0'
    iframe.style.width = '0'
    iframe.style.height = '0'
    iframe.style.border = '0'
    iframe.onload = async () => {
      try {
        // El iframe ya cargó su HTML, pero las imágenes (logo, hamburguesa,
        // papas) siguen bajando por su cuenta en ese momento — si se
        // imprime de una, salen en blanco. Esperamos a que todas terminen
        // (o a que pasen 1.5s como máximo, por si alguna falla) antes de
        // disparar la impresión.
        const imgs = Array.from(iframe.contentDocument?.images || [])
        const esperaImagenes = Promise.all(
          imgs.map((img) =>
            img.complete
              ? Promise.resolve()
              : new Promise((resolve) => {
                  img.addEventListener('load', resolve, { once: true })
                  img.addEventListener('error', resolve, { once: true })
                })
          )
        )
        await Promise.race([esperaImagenes, new Promise((resolve) => setTimeout(resolve, 1500))])

        iframe.contentWindow.focus()
        iframe.contentWindow.print()
      } catch (printErr) {
        console.error('Error al imprimir:', printErr)
        alert('No se pudo abrir el diálogo de impresión: ' + printErr.message)
      }
    }
    document.body.appendChild(iframe)
    iframe.srcdoc = html
  } catch (err) {
    console.error('Error al preparar recibo:', err)
    alert('Error al preparar recibo: ' + err.message)
  }
}

export function OrdersTable() {
  const [orders, setOrders] = useState([])
  const [filterMesa, setFilterMesa] = useState('')

  useEffect(() => {
    const q = query(collection(db, 'ordenes'), orderBy('createdAt', 'desc'))
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }))
      setOrders(docs)
    })
    return () => unsubscribe()
  }, [])

  const filtered = filterMesa ? orders.filter((o) => String(o.mesa).includes(filterMesa)) : orders

  const handleStatusChange = async (orderId, newStatus) => {
    try {
      const orderRef = doc(db, 'ordenes', orderId)
      await updateDoc(orderRef, { status: newStatus })
    } catch (err) {
      alert('Error: ' + err.message)
    }
  }

  const handlePaymentMethodChange = async (orderId, newMethod) => {
    try {
      const orderRef = doc(db, 'ordenes', orderId)
      await updateDoc(orderRef, { paymentMethod: newMethod })
    } catch (err) {
      alert('Error: ' + err.message)
    }
  }

  const handleFacturaStateChange = async (orderId, newState) => {
    try {
      const orderRef = doc(db, 'ordenes', orderId)
      await updateDoc(orderRef, { facturaEstado: newState })
    } catch (err) {
      alert('Error: ' + err.message)
    }
  }

  const handleDeleteOrder = async (orderId) => {
    if (!confirm('¿Eliminara esta orden?')) return
    try {
      await deleteDoc(doc(db, 'ordenes', orderId))
    } catch (err) {
      alert('Error: ' + err.message)
    }
  }

  return (
    <>
      <h1>Órdenes</h1>
      <div className="search-filters">
        <input
          type="search"
          placeholder="Mesa"
          value={filterMesa}
          onChange={(e) => setFilterMesa(e.target.value)}
          className="input-field"
        />
      </div>

      <table className="orders-table" role="presentation">
        <colgroup>
          <col className="col-id" />
          <col className="col-mesa" />
          <col className="col-cliente" />
          <col className="col-pagos" />
          <col className="col-items" />
          <col className="col-total" />
          <col className="col-status" />
          <col className="col-acciones" />
        </colgroup>

        <thead>
          <tr>
            <th scope="col">Nº Pedido</th>
            <th scope="col">Mesa</th>
            <th scope="col">Cliente</th>
            <th scope="col">Pagos</th>
            <th scope="col">Items</th>
            <th scope="col">Total</th>
            <th scope="col">Estado</th>
            <th scope="col">Acciones</th>
          </tr>
        </thead>

        <tbody>
          {filtered.map((order) => (
            <tr key={order.id} className={`status-${order.status}`}>
              <td data-label="Nº">
                <a href={`#/ordenes/${order.id}`} className="link-destacado">
                  #{order.id.slice(0, 6).toUpperCase()}
                </a>
              </td>

              <td data-label="Mesa">{order.mesa || '—'}</td>

              <td data-label="Cliente">{order.clientName || '—'}</td>

              <td data-label="Pagos" style={{ fontSize: '11px' }}>
                {paymentBreakdown(order)}
              </td>

              <td data-label="Items">
                <details className="items-details">
                  <summary>{order.items?.length || 0} item(s)</summary>
                  <ul>
                    {(order.items || []).map((item, i) => (
                      <li key={i}>
                        {item.qty}× {item.nombre}
                        {item.nota ? ` (${item.nota})` : ''}
                      </li>
                    ))}
                  </ul>
                </details>
              </td>

              <td data-label="Total" className="precio-cell">
                {formatColones(order.total)}
              </td>

              <td data-label="Estado">
                <select
                  value={order.status || 'pending'}
                  onChange={(e) => handleStatusChange(order.id, e.target.value)}
                  className={`badge badge--${statusInfo(order.status).tone}`}
                >
                  {Object.entries(STATUS_LABELS).map(([key, { label }]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </select>
              </td>

              <td data-label="Acciones" className="actions-cell">
                <button className="btn-icon" onClick={() => printReceipt(order)} title="Imprimir recibo">
                  🖨️
                </button>
                <button className="btn-icon" onClick={() => handleDeleteOrder(order.id)} title="Eliminar">
                  🗑️
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {filtered.length === 0 && (
        <div className="empty-state">
          <p>No hay órdenes que mostrar.</p>
        </div>
      )}
    </>
  )
}
