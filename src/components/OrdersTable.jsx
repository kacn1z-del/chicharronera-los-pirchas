import { useEffect, useState } from 'react'
import { collection, deleteDoc, doc, onSnapshot, orderBy, query, updateDoc } from 'firebase/firestore'
import { db, writeAndContinue } from '../firebase'

const STATUS_LABELS = {
  pending: { label: 'Pendiente', tone: 'amber' },
  preparing: { label: 'Preparando', tone: 'blue' },
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

function whatsappLink(order) {
  const phone = (order.clientPhone || '').replace(/[^\d]/g, '')
  const message = encodeURIComponent(
    `Hola ${order.clientName || ''}, tu pedido #${order.id.slice(0, 6)} en la chicharronera Los Pirchas está: ${
      statusInfo(order.status).label
    }.`
  )
  if (!phone) return null
  return `https://wa.me/${phone}?text=${message}`
}

function itemsSummary(order) {
  if (!Array.isArray(order.items) || order.items.length === 0) return '—'
  return order.items.map((i) => `${i.qty}× ${i.nombre}${i.nota ? ` (${i.nota})` : ''}`).join(', ')
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

function printReceipt(order) {
  const itemsHtml = (order.items || [])
    .map(
      (item) =>
        `<div class="row"><span>${item.qty} × ${item.nombre}</span><span>${formatColones(
          item.precio * item.qty
        )}</span></div>`
    )
    .join('')

  const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="UTF-8" />
<title>Recibo — Los Pirchas</title>
<style>
  body { font-family: -apple-system, sans-serif; color: #241c15; padding: 24px; max-width: 360px; margin: 0 auto; }
  .center { text-align: center; }
  h1 { font-size: 18px; margin: 8px 0 2px; }
  .sub { font-size: 11px; color: #8f7c68; margin-bottom: 14px; }
  .meta { font-size: 12px; color: #6b5843; margin: 2px 0; }
  .items { margin: 16px 0; padding: 12px 0; border-top: 1px dashed #c9c0b3; border-bottom: 1px dashed #c9c0b3; }
  .row { display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 6px; }
  .total { display: flex; justify-content: space-between; font-weight: 700; font-size: 15px; margin-bottom: 4px; }
  .payment { font-size: 11px; color: #8f7c68; text-align: center; margin-top: 4px; }
</style>
</head>
<body>
  <div class="center">
    <h1>Los Pirchas</h1>
    <p class="sub">Restaurante y Chicharronera</p>
  </div>
  <p class="meta center">Pedido #${order.id.slice(0, 6)} · ${formatTime(order.createdAt)}</p>
  <p class="meta center">${order.clientName || order.mesa || ''}${order.clientPhone ? ' · ' + order.clientPhone : ''}</p>
  ${order.clientAddress ? `<p class="meta center">${order.clientAddress}</p>` : ''}
  <div class="items">${itemsHtml}</div>
  <div class="total"><span>Total</span><span>${formatColones(order.total)}</span></div>
  <p class="payment">Pago: ${order.paymentMethod || '—'}</p>
  <script>window.onload = () => { window.print(); };<\/script>
</body>
</html>`

  const printWindow = window.open('', '_blank')
  if (!printWindow) return
  printWindow.document.open()
  printWindow.document.write(html)
  printWindow.document.close()
}

export default function OrdersTable({ onConnectionChange }) {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [busyId, setBusyId] = useState(null)
  const [facturandoId, setFacturandoId] = useState(null)

  useEffect(() => {
    const q = query(collection(db, 'orders'), orderBy('createdAt', 'desc'))
    const unsub = onSnapshot(
      q,
      (snapshot) => {
        setOrders(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })))
        setLoading(false)
        onConnectionChange?.(true)
      },
      (err) => {
        console.error(err)
        setError(err.message)
        setLoading(false)
        onConnectionChange?.(false)
      }
    )
    return () => unsub()
  }, [onConnectionChange])

  const setStatus = async (orderId, newStatus) => {
    setBusyId(orderId)
    try {
      await writeAndContinue(updateDoc(doc(db, 'orders', orderId), { status: newStatus }))
    } catch (err) {
      console.error(err)
      alert('No se pudo actualizar el pedido: ' + err.message)
    } finally {
      setBusyId(null)
    }
  }

  const removeOrder = async (order) => {
    const label = order.clientName || order.mesa || order.id.slice(0, 6)
    if (!window.confirm(`¿Eliminar el pedido de "${label}"? Esto no se puede deshacer.`)) return
    setBusyId(order.id)
    try {
      await writeAndContinue(deleteDoc(doc(db, 'orders', order.id)))
    } catch (err) {
      console.error(err)
      alert('No se pudo eliminar el pedido: ' + err.message)
    } finally {
      setBusyId(null)
    }
  }

  const facturarOrder = async (order) => {
    if (order.facturaEstado === 'aceptado') return
    if (!window.confirm(`¿Emitir comprobante electrónico para este pedido?`)) return
    setFacturandoId(order.id)
    try {
      const res = await fetch('/api/facturar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: order.id }),
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error + (data.motivo ? `: ${data.motivo}` : ''))
      }
      alert(`Comprobante aceptado por Hacienda.\nClave: ${data.clave}`)
    } catch (err) {
      console.error(err)
      alert('No se pudo facturar el pedido: ' + err.message)
    } finally {
      setFacturandoId(null)
    }
  }

  if (loading) {
    return <div className="panel panel--empty">Cargando pedidos…</div>
  }

  if (error) {
    return (
      <div className="panel panel--empty">
        <p>No se pudo leer la colección "orders".</p>
        <p className="panel__hint mono">{error}</p>
      </div>
    )
  }

  if (orders.length === 0) {
    return (
      <div className="panel panel--empty">
        <p>Todavía no hay pedidos en Firestore.</p>
        <p className="panel__hint">
          En cuanto se cree un documento en la colección <span className="mono">orders</span>, va a aparecer
          aquí automáticamente.
        </p>
      </div>
    )
  }

  return (
    <div className="panel">
      <table className="orders-table">
        <colgroup>
          <col className="col-cliente" />
          <col className="col-mesa" />
          <col className="col-restaurante" />
          <col className="col-pedido" />
          <col className="col-estado" />
          <col className="col-canal" />
          <col className="col-hora" />
          <col className="col-contacto" />
          <col className="col-acciones" />
        </colgroup>
        <thead>
          <tr>
            <th>Cliente</th>
            <th>Mesa</th>
            <th>Restaurante</th>
            <th>Pedido</th>
            <th>Estado</th>
            <th>Canal</th>
            <th>Hora</th>
            <th>Contacto</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((order) => {
            const status = statusInfo(order.status)
            const origen = origenInfo(order)
            const link = whatsappLink(order)
            const factura = order.facturaEstado ? FACTURA_LABELS[order.facturaEstado] : null
            return (
              <tr key={order.id}>
                <td data-label="Cliente">
                  {order.clientName || order.clientId || '—'}
                  {order.mesero && <div className="order-sub mono">Mesero: {order.mesero}</div>}
                </td>
                <td data-label="Mesa">{order.mesa ? order.mesa : '—'}</td>
                <td data-label="Restaurante">{order.restaurantName || order.restaurantId || '—'}</td>
                <td className="order-items" data-label="Pedido">{itemsSummary(order)}</td>
                <td data-label="Estado">
                  <span className={`badge badge--${status.tone}`}>{status.label}</span>
                  {factura && (
                    <div className="order-sub">
                      <span className={`badge badge--${factura.tone}`}>{factura.label}</span>
                    </div>
                  )}
                  {order.cierreId && (
                    <div className="order-sub">
                      <span className="badge badge--gray">En caja cerrada</span>
                    </div>
                  )}
                </td>
                <td data-label="Canal">
                  <span className={`badge badge--${origen.tone}`}>{origen.label}</span>
                </td>
                <td className="mono" data-label="Hora">{formatTime(order.createdAt)}</td>
                <td data-label="Contacto">
                  {order.mesa ? (
                    <span className="badge badge--gray">{serviceLabel(order)}</span>
                  ) : link ? (
                    <a className="wa-button" href={link} target="_blank" rel="noreferrer">
                      Notificar
                    </a>
                  ) : (
                    <span className="wa-button wa-button--disabled">Sin teléfono</span>
                  )}
                </td>
                <td data-label="Acciones">
                  <div className="order-actions">
                    {order.status !== 'preparing' && (
                      <button
                        type="button"
                        className="action-btn action-btn--blue"
                        disabled={busyId === order.id}
                        onClick={() => setStatus(order.id, 'preparing')}
                      >
                        Preparando
                      </button>
                    )}
                    {order.status !== 'delivered' && (
                      <button
                        type="button"
                        className="action-btn action-btn--green"
                        disabled={busyId === order.id}
                        onClick={() => setStatus(order.id, 'delivered')}
                      >
                        Entregado
                      </button>
                    )}
                    {order.status !== 'cancelled' && (
                      <button
                        type="button"
                        className="action-btn action-btn--amber"
                        disabled={busyId === order.id}
                        onClick={() => setStatus(order.id, 'cancelled')}
                      >
                        Cancelar
                      </button>
                    )}
                    <button
                      type="button"
                      className="action-btn action-btn--purple"
                      disabled={facturandoId === order.id || order.facturaEstado === 'aceptado'}
                      onClick={() => facturarOrder(order)}
                    >
                      {facturandoId === order.id
                        ? 'Facturando…'
                        : order.facturaEstado === 'aceptado'
                        ? 'Facturado ✔️'
                        : 'Facturar'}
                    </button>
                    <button
                      type="button"
                      className="action-btn action-btn--blue"
                      onClick={() => printReceipt(order)}
                    >
                      🖨️ Imprimir
                    </button>
                    <button
                      type="button"
                      className="action-btn action-btn--red"
                      disabled={busyId === order.id}
                      onClick={() => removeOrder(order)}
                    >
                      Eliminar
                    </button>
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
