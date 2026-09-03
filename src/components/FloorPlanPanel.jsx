import { useEffect, useState } from 'react'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { db } from '../firebase'

// Misma distribución física del salón que usa la app de meseros (los-pirchas-meseros):
// agrupada por secciones (fila de arriba con 3 grupos + columna a la derecha,
// dos filas de mesas centrales, fila de Llevar/Express abajo). Todas las mesas
// se dibujan como cuadros del mismo tamaño.
const FLOOR_GROUPS = [
  {
    row: 'top',
    clusters: [
      ['1', '2', '3', '4', '5'],
      ['6', '7', '8', '9', '10'],
      ['11', '12', '13', '14', '15'],
    ],
    rightCluster: ['16', '17', '18', '19'],
  },
  { row: 'mid', clusters: [['21', '23', '25', '27']] },
  { row: 'mid', clusters: [['22', '24', '26', '28']] },
  { row: 'bottom', clusters: [['Llevar 1', 'Llevar 2', 'Express 1', 'Express 2', 'Express 3']] },
]

const fmt = (v) => `₡${Number(v ?? 0).toLocaleString('es-CR')}`

export default function FloorPlanPanel() {
  const [openOrders, setOpenOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [selectedMesa, setSelectedMesa] = useState(null)
  const [fullscreen, setFullscreen] = useState(false)

  useEffect(() => {
    // Si el mesero sale de pantalla completa con Esc o un gesto del sistema,
    // sincronizamos el estado del botón (relevante en navegadores/tablets que
    // sí soportan la Fullscreen API; en iPhone/Safari este evento simplemente
    // no llega, pero el modo "pantalla completa" dentro de la app sigue
    // funcionando igual porque no depende de esta API).
    const onFsChange = () => {
      if (!document.fullscreenElement) setFullscreen(false)
    }
    document.addEventListener('fullscreenchange', onFsChange)
    return () => document.removeEventListener('fullscreenchange', onFsChange)
  }, [])

  function toggleFullscreen() {
    const next = !fullscreen
    setFullscreen(next)
    const el = document.documentElement
    if (next) {
      const req = el.requestFullscreen || el.webkitRequestFullscreen || el.msRequestFullscreen
      if (req) req.call(el).catch(() => {})
    } else if (document.fullscreenElement) {
      const exit = document.exitFullscreen || document.webkitExitFullscreen || document.msExitFullscreen
      if (exit) exit.call(document).catch(() => {})
    }
  }

  useEffect(() => {
    const q = query(collection(db, 'orders'), where('mesaAbierta', '==', true))
    const unsub = onSnapshot(
      q,
      (snapshot) => {
        setOpenOrders(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })))
        setLoading(false)
      },
      (err) => {
        console.error(err)
        setError(err.message)
        setLoading(false)
      }
    )
    return () => unsub()
  }, [])

  const findOpenOrder = (mesa) => openOrders.find((o) => o.mesa === mesa) || null
  const selectedOrder = selectedMesa ? findOpenOrder(selectedMesa) : null

  const mesaButton = (mesa) => {
    const order = findOpenOrder(mesa)
    const busy = !!order
    const isTakeout = Number.isNaN(Number(mesa))
    const label = isTakeout ? mesa.toUpperCase() : mesa
    return (
      <button
        key={mesa}
        type="button"
        className={`fp-item ${busy ? 'busy' : ''}`}
        onClick={() => (busy ? setSelectedMesa(mesa) : null)}
      >
        {label}
        {busy && (
          <small className="mono">
            {`${(order.items || []).reduce((s, i) => s + i.qty, 0)} art · ${fmt(order.total)}`}
          </small>
        )}
      </button>
    )
  }

  const cluster = (mesas, extraClass = '', key) => (
    <div key={key} className={`fp-cluster ${extraClass}`}>
      {mesas.map(mesaButton)}
    </div>
  )

  if (loading) {
    return <div className="panel panel--empty">Cargando distribución del salón…</div>
  }

  if (error) {
    return (
      <div className="panel panel--empty">
        <p>No se pudo leer la colección "orders".</p>
        <p className="panel__hint mono">{error}</p>
      </div>
    )
  }

  return (
    <div className={`panel floor-plan-panel ${fullscreen ? 'fp-fullscreen' : ''}`}>
      <div className="fp-legend">
        <span><i className="free" />Libre</span>
        <span><i className="busy" />Ocupada</span>
        <button type="button" className="fp-fullscreen-btn" onClick={toggleFullscreen}>
          {fullscreen ? '✕ Salir de pantalla completa' : '⛶ Pantalla completa'}
        </button>
      </div>
      <div className="floor-plan-wrap">
        <div className="floor-plan">
          {FLOOR_GROUPS.map((group, idx) =>
            group.rightCluster ? (
              <div key={idx} className={`fp-row fp-row--${group.row}`}>
                <div className="fp-row fp-row--inner">
                  {group.clusters.map((c, i) => cluster(c, '', i))}
                </div>
                {cluster(group.rightCluster, 'fp-cluster--col fp-cluster--right')}
              </div>
            ) : (
              <div key={idx} className={`fp-row fp-row--${group.row}`}>
                {group.clusters.map((c, i) => cluster(c, '', i))}
              </div>
            )
          )}
        </div>
      </div>

      {selectedOrder && (
        <div className="fp-detail-overlay" onClick={() => setSelectedMesa(null)}>
          <div className="fp-detail" onClick={(e) => e.stopPropagation()}>
            <div className="fp-detail__head">
              <h3>Mesa {selectedMesa}</h3>
              <button type="button" className="fp-detail__close" onClick={() => setSelectedMesa(null)}>
                ✕
              </button>
            </div>
            {selectedOrder.mesero && (
              <p className="fp-detail__meta mono">Mesero: {selectedOrder.mesero}</p>
            )}
            <ul className="fp-detail__items">
              {(selectedOrder.items || []).map((it, idx) => (
                <li key={idx}>
                  <span>{it.qty}× {it.nombre}{it.nota ? ` (${it.nota})` : ''}</span>
                  <span className="mono">{fmt(it.precio * it.qty)}</span>
                </li>
              ))}
            </ul>
            {selectedOrder.notes && <p className="fp-detail__notes">Notas: {selectedOrder.notes}</p>}
            <div className="fp-detail__total">
              <span>Total</span>
              <span className="mono">{fmt(selectedOrder.total)}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
