import { useEffect, useState } from 'react'
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore'
import { db } from '../firebase'

const STATUS_LABELS = {
  pending: { label: 'Pendiente', tone: 'amber' },
  preparing: { label: 'Preparando', tone: 'blue' },
  on_the_way: { label: 'En camino', tone: 'green' },
  delivered: { label: 'Entregado', tone: 'gray' },
  cancelled: { label: 'Cancelado', tone: 'red' },
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
        <thead>
          <tr>
            <th>Cliente</th>
            <th>Mesa</th>
            <th>Restaurante</th>
            <th>Pedido</th>
            <th>Estado</th>
            <th>Hora</th>
            <th>Contacto</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((order) => {
            const status = statusInfo(order.status)
            const link = whatsappLink(order)
            return (
              <tr key={order.id}>
                <td>
                  {order.clientName || order.clientId || '—'}
                  {order.mesero && <div className="order-sub mono">Mesero: {order.mesero}</div>}
                </td>
                <td>{order.mesa ? order.mesa : '—'}</td>
                <td>{order.restaurantName || order.restaurantId || '—'}</td>
                <td className="order-items">{itemsSummary(order)}</td>
                <td>
                  <span className={`badge badge--${status.tone}`}>{status.label}</span>
                </td>
                <td className="mono">{formatTime(order.createdAt)}</td>
                <td>
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
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

