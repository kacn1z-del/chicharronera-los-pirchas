import { useEffect, useState } from 'react'
import { collection, deleteDoc, doc, onSnapshot, orderBy, query, updateDoc } from 'firebase/firestore'
import { db } from '../firebase'

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
      await updateDoc(doc(db, 'orders', orderId), { status: newStatus })
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
      await deleteDoc(doc(db, 'orders', order.id))
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
            <th>Hora</th>
            <th>Contacto</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((order) => {
            const status = statusInfo(order.status)
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
