import { useEffect, useState } from 'react'
import { collection, doc, onSnapshot, orderBy, query, updateDoc } from 'firebase/firestore'
import { db } from '../firebase'

// Pantalla dedicada para la cocina (tablet compartida). Solo muestra los
// pedidos que todavía no están listos — pendientes o en preparación — y dos
// botones grandes por pedido: "Empezar preparación" y "Preparado". En
// cuanto un pedido se marca "Preparado" pasa a status "listo" y sale de esta
// lista sola (el mesero/admin lo ve normal en su panel para entregarlo).
//
// A propósito NO reutiliza OrdersTable: la cocina no necesita ver precios,
// no factura, no cancela, no elimina — cuanto más simple la pantalla, menos
// margen de error con las manos ocupadas.

function itemsSummary(order) {
  if (!Array.isArray(order.items) || order.items.length === 0) return '—'
  return order.items.map((i) => `${i.qty}× ${i.nombre}${i.nota ? ` (${i.nota})` : ''}`)
}

function formatTime(createdAt) {
  if (!createdAt) return '—'
  const date = typeof createdAt === 'number' ? new Date(createdAt) : createdAt?.toDate?.()
  if (!date) return '—'
  return date.toLocaleTimeString('es-CR', { hour: '2-digit', minute: '2-digit' })
}

const CANAL_LABELS = {
  salon: 'Salón',
  telefono: 'Teléfono',
  'cliente-web': 'Página web',
}

function canalDe(order) {
  if (order.origen) return CANAL_LABELS[order.origen] || order.origen
  if (order.mesa) return 'Salón'
  if (order.clientAddress) return 'Página web'
  return 'Teléfono'
}

export default function CocinaView({ nombre, onLogout }) {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [busyId, setBusyId] = useState(null)

  useEffect(() => {
    // Los más viejos primero — así la cocina atiende en el orden en que
    // llegaron, no al revés.
    const q = query(collection(db, 'orders'), orderBy('createdAt', 'asc'))
    const unsub = onSnapshot(
      q,
      (snap) => {
        const todos = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
        setOrders(todos.filter((o) => o.status === 'pending' || o.status === 'preparing'))
        setLoading(false)
      },
      (err) => {
        setError(err.message)
        setLoading(false)
      }
    )
    return () => unsub()
  }, [])

  const avanzar = async (order, nuevoStatus) => {
    setBusyId(order.id)
    try {
      await updateDoc(doc(db, 'orders', order.id), { status: nuevoStatus })
    } catch (err) {
      alert('No se pudo actualizar: ' + err.message)
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="cocina-view">
      <header className="cocina-header">
        <h1>🍳 Cocina — Los Pirchas</h1>
        <div className="cocina-header__right">
          {nombre && <span className="cocina-header__nombre">{nombre}</span>}
          <button type="button" className="btn-secondary" onClick={onLogout}>
            Salir
          </button>
        </div>
      </header>

      {loading ? (
        <p className="cocina-empty">Cargando pedidos…</p>
      ) : error ? (
        <p className="cocina-empty">No se pudo leer los pedidos: {error}</p>
      ) : orders.length === 0 ? (
        <p className="cocina-empty">No hay pedidos pendientes 🎉</p>
      ) : (
        <div className="cocina-grid">
          {orders.map((order) => (
            <div key={order.id} className={`cocina-card cocina-card--${order.status}`}>
              <div className="cocina-card__top">
                <span className="cocina-card__cliente">
                  {order.mesa ? `Mesa ${order.mesa}` : order.clientName || 'Pedido telefónico'}
                </span>
                <span className="cocina-card__hora">{formatTime(order.createdAt)}</span>
              </div>
              <div className="cocina-card__canal">{canalDe(order)}</div>
              <ul className="cocina-card__items">
                {itemsSummary(order).map((linea, i) => (
                  <li key={i}>{linea}</li>
                ))}
              </ul>
              <div className="cocina-card__actions">
                {order.status === 'pending' && (
                  <button
                    type="button"
                    className="cocina-btn cocina-btn--start"
                    disabled={busyId === order.id}
                    onClick={() => avanzar(order, 'preparing')}
                  >
                    {busyId === order.id ? 'Un momento…' : '▶️ Empezar preparación'}
                  </button>
                )}
                {order.status === 'preparing' && (
                  <button
                    type="button"
                    className="cocina-btn cocina-btn--done"
                    disabled={busyId === order.id}
                    onClick={() => avanzar(order, 'listo')}
                  >
                    {busyId === order.id ? 'Un momento…' : '✅ Preparado'}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
