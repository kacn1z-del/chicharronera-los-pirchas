import { useEffect, useState } from 'react'
import { collection, doc, onSnapshot, orderBy, query, updateDoc } from 'firebase/firestore'
import { db } from '../firebase'
import { asegurarNumeroPedido, formatNumeroPedido } from '../lib/pedidoNumero'
import { CATEGORIAS_BEBIDA, normalizarTexto } from '../lib/categoriasBebida'

// Pantalla dedicada para la cocina (tablet compartida). Solo muestra los
// pedidos que todavía tienen comida pendiente de preparar — y dos botones
// grandes por pedido: "Empezar preparación" y "Preparado". En cuanto se
// marca "Preparado" acá, se guarda comidaLista: true; el pedido en general
// (status) recién pasa a "listo" cuando también la bebida está lista (si el
// pedido tenía bebida) — ver BebidasView, la pantalla hermana de esta.
//
// A propósito NO reutiliza OrdersTable: la cocina no necesita ver precios,
// no factura, no cancela, no elimina — cuanto más simple la pantalla, menos
// margen de error con las manos ocupadas.

function tieneComida(order, nombresBebida) {
  return (order.items || []).some((i) => !nombresBebida.has(normalizarTexto(i.nombre)))
}

function tieneBebida(order, nombresBebida) {
  return (order.items || []).some((i) => nombresBebida.has(normalizarTexto(i.nombre)))
}

function itemsComida(order, nombresBebida) {
  return (order.items || [])
    .filter((i) => !nombresBebida.has(normalizarTexto(i.nombre)))
    .map((i) => `${i.qty}× ${i.nombre}${i.nota ? ` (${i.nota})` : ''}`)
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
  const [allOrders, setAllOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [busyId, setBusyId] = useState(null)
  const [nombresBebida, setNombresBebida] = useState(new Set())

  useEffect(() => {
    // Se arma un set con los nombres (normalizados) de todo lo que esté en
    // una categoría de bebidas, para poder separarlos del resto del pedido
    // sin tener que guardar la categoría dentro del pedido mismo.
    const unsubMenu = onSnapshot(collection(db, 'Menu'), (snap) => {
      const bebidas = new Set()
      snap.docs.forEach((d) => {
        const item = d.data()
        if (CATEGORIAS_BEBIDA.includes(normalizarTexto(item.categoria))) {
          bebidas.add(normalizarTexto(item.nombre))
        }
      })
      setNombresBebida(bebidas)
    })
    return () => unsubMenu()
  }, [])

  useEffect(() => {
    // Los más viejos primero — así la cocina atiende en el orden en que
    // llegaron, no al revés.
    const q = query(collection(db, 'orders'), orderBy('createdAt', 'asc'))
    const unsub = onSnapshot(
      q,
      (snap) => {
        const todos = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
        setAllOrders(todos)
        setLoading(false)

        // Antes el número de pedido solo se asignaba al imprimir en el
        // admin (a veces bien después de que cocina ya lo preparó). Acá se
        // le asigna apenas cocina lo ve por primera vez, para que llegue
        // numerado — asegurarNumeroPedido no hace nada si el pedido ya
        // tiene número, así que es seguro llamarlo en cada snapshot.
        todos
          .filter((o) => (o.status === 'pending' || o.status === 'preparing') && !o.numeroPedido)
          .forEach((o) => {
            asegurarNumeroPedido(o).catch((err) => console.error('No se pudo numerar el pedido:', err))
          })
      },
      (err) => {
        setError(err.message)
        setLoading(false)
      }
    )
    return () => unsub()
  }, [])

  // Solo pedidos activos, que tengan algo de comida, y que esa comida
  // todavía no esté marcada lista — un pedido de solo bebidas nunca aparece
  // acá (le corresponde 100% a BebidasView).
  const orders = allOrders.filter(
    (o) =>
      (o.status === 'pending' || o.status === 'preparing') &&
      tieneComida(o, nombresBebida) &&
      !o.comidaLista
  )

  const empezar = async (order) => {
    setBusyId(order.id)
    try {
      await updateDoc(doc(db, 'orders', order.id), { status: 'preparing' })
    } catch (err) {
      alert('No se pudo actualizar: ' + err.message)
    } finally {
      setBusyId(null)
    }
  }

  const marcarPreparado = async (order) => {
    setBusyId(order.id)
    try {
      // La bebida "cuenta como lista" si el pedido no tenía bebida para
      // empezar, o si BebidasView ya la marcó. Solo ahí el pedido completo
      // pasa a "listo" (lo que hace que salga de cocina Y de bebidas, y
      // que el mesero/admin ya lo vea listo para entregar).
      const bebidaOk = !tieneBebida(order, nombresBebida) || order.bebidaLista
      await updateDoc(doc(db, 'orders', order.id), {
        comidaLista: true,
        ...(bebidaOk ? { status: 'listo' } : {}),
      })
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
                  {order.numeroPedido && (
                    <span className="cocina-card__numero"> · {formatNumeroPedido(order.numeroPedido)}</span>
                  )}
                </span>
                <span className="cocina-card__hora">{formatTime(order.createdAt)}</span>
              </div>
              <div className="cocina-card__canal">{canalDe(order)}</div>
              <ul className="cocina-card__items">
                {itemsComida(order, nombresBebida).map((linea, i) => (
                  <li key={i}>{linea}</li>
                ))}
              </ul>
              <div className="cocina-card__actions">
                {order.status === 'pending' && (
                  <button
                    type="button"
                    className="cocina-btn cocina-btn--start"
                    disabled={busyId === order.id}
                    onClick={() => empezar(order)}
                  >
                    {busyId === order.id ? 'Un momento…' : '▶️ Empezar preparación'}
                  </button>
                )}
                {order.status === 'preparing' && (
                  <button
                    type="button"
                    className="cocina-btn cocina-btn--done"
                    disabled={busyId === order.id}
                    onClick={() => marcarPreparado(order)}
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
