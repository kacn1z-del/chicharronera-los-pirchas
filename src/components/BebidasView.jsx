import { useEffect, useState } from 'react'
import { collection, doc, onSnapshot, orderBy, query, updateDoc } from 'firebase/firestore'
import { db } from '../firebase'
import { asegurarNumeroPedido, formatNumeroPedido } from '../lib/pedidoNumero'
import { CATEGORIAS_BEBIDA, normalizarTexto } from '../lib/categoriasBebida'

// Pantalla hermana de CocinaView, pero para bebidas: solo muestra los
// pedidos que todavía tienen alguna bebida pendiente de preparar. Al marcar
// "Preparado" acá se guarda bebidaLista: true; el pedido en general
// (status) recién pasa a "listo" cuando también la comida está lista (si el
// pedido tenía comida) — ver CocinaView.
//
// A propósito NO reutiliza OrdersTable ni CocinaView: esta pantalla no
// necesita ver precios, no factura, no cancela, no elimina — cuanto más
// simple, menos margen de error con las manos ocupadas.

// Desde ahora cada ítem del pedido trae su propia categoría guardada al
// momento de pedirlo (ver CartContext.jsx / Checkout.jsx del cliente,
// PhoneOrderPanel.jsx y meseros/index.html) — eso es lo confiable, porque
// no cambia aunque el nombre o la categoría del plato se editen después en
// el menú. Para pedidos viejos que se hayan quedado sin ese campo, se cae
// al cruce por nombre contra el menú actual como respaldo.
function esBebidaItem(item, nombresBebida) {
  if (item.categoria) return CATEGORIAS_BEBIDA.includes(normalizarTexto(item.categoria))
  return nombresBebida.has(normalizarTexto(item.nombre))
}

function tieneComida(order, nombresBebida) {
  return (order.items || []).some((i) => !esBebidaItem(i, nombresBebida))
}

function tieneBebida(order, nombresBebida) {
  return (order.items || []).some((i) => esBebidaItem(i, nombresBebida))
}

function itemsBebida(order, nombresBebida) {
  return (order.items || [])
    .filter((i) => esBebidaItem(i, nombresBebida))
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

export default function BebidasView({ nombre, onLogout }) {
  const [allOrders, setAllOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [busyId, setBusyId] = useState(null)
  const [nombresBebida, setNombresBebida] = useState(new Set())

  useEffect(() => {
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
    // Los más viejos primero — así se atiende en el orden en que llegaron.
    const q = query(collection(db, 'orders'), orderBy('createdAt', 'asc'))
    const unsub = onSnapshot(
      q,
      (snap) => {
        const todos = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
        setAllOrders(todos)
        setLoading(false)

        // Mismo mecanismo que en CocinaView: numera el pedido apenas
        // alguna de las dos pantallas lo ve, si todavía no tiene número.
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

  // Solo pedidos activos, que tengan alguna bebida, y que esa bebida
  // todavía no esté marcada lista — un pedido de solo comida nunca aparece
  // acá (le corresponde 100% a CocinaView).
  const orders = allOrders.filter(
    (o) =>
      (o.status === 'pending' || o.status === 'preparing') &&
      tieneBebida(o, nombresBebida) &&
      !o.bebidaLista
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
      // La comida "cuenta como lista" si el pedido no tenía comida para
      // empezar, o si CocinaView ya la marcó. Solo ahí el pedido completo
      // pasa a "listo".
      const comidaOk = !tieneComida(order, nombresBebida) || order.comidaLista
      await updateDoc(doc(db, 'orders', order.id), {
        bebidaLista: true,
        ...(comidaOk ? { status: 'listo' } : {}),
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
        <h1>🍹 Bebidas — Los Pirchas</h1>
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
                {itemsBebida(order, nombresBebida).map((linea, i) => (
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
