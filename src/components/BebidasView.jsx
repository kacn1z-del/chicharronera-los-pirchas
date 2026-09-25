import { useEffect, useState } from 'react'
import { collection, doc, onSnapshot, orderBy, query, updateDoc } from 'firebase/firestore'
import { db } from '../firebase'
import { asegurarNumeroPedido, formatNumeroPedido } from '../lib/pedidoNumero'
import { esCategoriaBebida, normalizarTexto } from '../lib/categoriasBebida'

// Pantalla hermana de CocinaView, pero para bebidas: solo muestra las
// RONDAS de pedido que todavía tienen alguna bebida pendiente de preparar.
//
// Por qué "rondas" y no "pedidos" enteros: cuando una mesa ya había pedido
// algo y el mesero le agrega más después, ese "algo más" llega como una
// ronda nueva dentro del mismo pedido (ver meseros/index.html ->
// sendOrder/calcularRondaNueva) — así bebidas ve solo lo nuevo, sin que se
// le vuelva a mezclar lo que ya había preparado antes. El admin
// (OrdersTable) sigue viendo/cobrando el pedido completo, porque ahí se usa
// order.items (el total acumulado de todas las rondas).
//
// IMPORTANTE: cada ronda lleva su PROPIO estado "bebidaIniciada" (si ya se
// tocó Empezar preparación PARA LA BEBIDA de esa ronda) — separado de
// "comidaIniciada" (el mismo campo en CocinaView). Antes había un solo
// campo "iniciada" compartido entre las dos pantallas, y cuando un plato de
// comida y uno de bebida venían en la MISMA ronda (pedidos juntos), tocar
// Empezar en una pantalla contagiaba el botón de la otra — parecía que
// cocina marcaba algo y bebidas cambiaba solo. order.status se sigue
// actualizando (para que el admin vea el pedido como "en preparación"),
// pero ya no decide qué botón mostrar en cada tarjeta.
//
// Un pedido que nunca pasó por ese flujo (llegó de la página web, de un
// pedido telefónico, o es de antes de este cambio) no tiene el campo
// "rondas" — se lo trata como una única ronda implícita usando
// comidaLista/bebidaLista/iniciada a nivel del pedido completo, igual que
// antes.
//
// A propósito NO reutiliza OrdersTable ni CocinaView: esta pantalla no
// necesita ver precios, no factura, no cancela, no elimina — cuanto más
// simple, menos margen de error con las manos ocupadas.

function esBebidaItem(item, nombresBebida) {
  if (item.categoria) return esCategoriaBebida(item.categoria)
  return nombresBebida.has(normalizarTexto(item.nombre))
}

function rondasDe(order) {
  if (Array.isArray(order.rondas) && order.rondas.length > 0) return order.rondas
  return [{
    id: 'unica',
    items: order.items || [],
    comidaLista: !!order.comidaLista,
    bebidaLista: !!order.bebidaLista,
    comidaIniciada: order.status !== 'pending',
    bebidaIniciada: order.status !== 'pending',
    creadaEn: order.createdAt,
  }]
}

// Convierte un timestamp de Firestore, un número (Date.now()), o nada, a
// milisegundos comparables — para poder ordenar rondas y pedidos por la
// misma línea de tiempo sin importar de dónde salió cada uno.
function aMillis(valor) {
  if (!valor) return 0
  if (typeof valor === 'number') return valor
  if (typeof valor.toMillis === 'function') return valor.toMillis()
  if (typeof valor.toDate === 'function') return valor.toDate().getTime()
  return 0
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
        if (esCategoriaBebida(item.categoria)) {
          bebidas.add(normalizarTexto(item.nombre))
        }
      })
      setNombresBebida(bebidas)
    })
    return () => unsubMenu()
  }, [])

  useEffect(() => {
    const q = query(collection(db, 'orders'), orderBy('createdAt', 'asc'))
    const unsub = onSnapshot(
      q,
      (snap) => {
        const todos = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
        setAllOrders(todos)
        setLoading(false)

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

  // Una "tarjeta" por cada ronda con bebida pendiente — no una por pedido.
  // Se ordenan por el momento en que se creó CADA RONDA (no la hora del
  // pedido original), para que una ronda agregada después a una mesa que
  // ya tenía pedido se coloque al final de la cola, donde le corresponde
  // por orden de llegada — no se cuela en el lugar del pedido original.
  const tarjetas = allOrders
    .filter((o) => o.status === 'pending' || o.status === 'preparing')
    .flatMap((order) =>
      rondasDe(order)
        .filter((r) => !r.bebidaLista && r.items.some((i) => esBebidaItem(i, nombresBebida)))
        .map((ronda) => ({ order, ronda, esRondaExtra: rondasDe(order).length > 1 && ronda.id !== rondasDe(order)[0].id }))
    )
    .sort((a, b) => aMillis(a.ronda.creadaEn ?? a.order.createdAt) - aMillis(b.ronda.creadaEn ?? b.order.createdAt))

  // Marca SOLO la bebida de esta ronda como iniciada — no toca la comida de
  // la misma ronda (eso lo maneja CocinaView por su cuenta) ni las demás
  // rondas del pedido.
  const empezar = async (order, ronda) => {
    setBusyId(ronda.id)
    try {
      const rondas = rondasDe(order).map((r) => (r.id === ronda.id ? { ...r, bebidaIniciada: true } : r))
      await updateDoc(doc(db, 'orders', order.id), { rondas, status: 'preparing' })
    } catch (err) {
      alert('No se pudo actualizar: ' + err.message)
    } finally {
      setBusyId(null)
    }
  }

  const marcarPreparado = async (order, ronda) => {
    setBusyId(ronda.id)
    try {
      const rondas = rondasDe(order).map((r) =>
        r.id === ronda.id ? { ...r, bebidaLista: true } : r
      )
      const todoListo = rondas.every((r) => {
        const tieneComida = r.items.some((i) => !esBebidaItem(i, nombresBebida))
        const tieneBebida = r.items.some((i) => esBebidaItem(i, nombresBebida))
        return (!tieneComida || r.comidaLista) && (!tieneBebida || r.bebidaLista)
      })
      const payload = { rondas }
      if (!Array.isArray(order.rondas) || order.rondas.length === 0) payload.bebidaLista = true
      if (todoListo) payload.status = 'listo'
      await updateDoc(doc(db, 'orders', order.id), payload)
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
      ) : tarjetas.length === 0 ? (
        <p className="cocina-empty">No hay pedidos pendientes 🎉</p>
      ) : (
        <div className="cocina-grid">
          {tarjetas.map(({ order, ronda, esRondaExtra }) => (
            <div key={`${order.id}-${ronda.id}`} className={`cocina-card cocina-card--${ronda.bebidaIniciada ? 'preparing' : 'pending'}`}>
              <div className="cocina-card__top">
                <span className="cocina-card__cliente">
                  {esRondaExtra && '🔄 '}
                  {order.mesa ? `Mesa ${order.mesa}` : order.clientName || 'Pedido telefónico'}
                  {order.numeroPedido && (
                    <span className="cocina-card__numero"> · {formatNumeroPedido(order.numeroPedido)}</span>
                  )}
                </span>
                <span className="cocina-card__hora">{formatTime(order.createdAt)}</span>
              </div>
              {esRondaExtra && <div className="cocina-card__canal">Agregado a un pedido ya en curso</div>}
              <div className="cocina-card__canal">{canalDe(order)}</div>
              <ul className="cocina-card__items">
                {ronda.items
                  .filter((i) => esBebidaItem(i, nombresBebida))
                  .map((i, idx) => (
                    <li key={idx}>{`${i.qty}× ${i.nombre}${i.nota ? ` (${i.nota})` : ''}`}</li>
                  ))}
              </ul>
              {order.notes && <div className="cocina-card__notas">📝 {order.notes}</div>}
              <div className="cocina-card__actions">
                {!ronda.bebidaIniciada ? (
                  <button
                    type="button"
                    className="cocina-btn cocina-btn--start"
                    disabled={busyId === ronda.id}
                    onClick={() => empezar(order, ronda)}
                  >
                    {busyId === ronda.id ? 'Un momento…' : '▶️ Empezar preparación'}
                  </button>
                ) : (
                  <button
                    type="button"
                    className="cocina-btn cocina-btn--done"
                    disabled={busyId === ronda.id}
                    onClick={() => marcarPreparado(order, ronda)}
                  >
                    {busyId === ronda.id ? 'Un momento…' : '✅ Preparado'}
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
