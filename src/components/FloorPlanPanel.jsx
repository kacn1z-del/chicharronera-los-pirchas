import { useEffect, useState } from 'react'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { db } from '../firebase'

// Misma distribución física del salón que usa la app de meseros (los-pirchas-meseros),
// calcada de la foto del sistema POS del cliente: 3 grupos arriba (1-5 / 6-10 / 11-15),
// columna vertical a la derecha (16-19), mesas centrales escalonadas
// (21,23,25,27 arriba / 22,24,26,28 abajo) y la fila de Llevar/Express abajo.
const FLOORPLAN = {
  '1':  { left: 2,    top: 3,  width: 6,   height: 11 },
  '2':  { left: 9.5,  top: 3,  width: 6,   height: 11 },
  '3':  { left: 17,   top: 3,  width: 6,   height: 11 },
  '4':  { left: 24.5, top: 3,  width: 6,   height: 11 },
  '5':  { left: 32,   top: 3,  width: 6,   height: 11 },
  '6':  { left: 43,   top: 3,  width: 6,   height: 11 },
  '7':  { left: 50.5, top: 3,  width: 6,   height: 11 },
  '8':  { left: 58,   top: 3,  width: 6,   height: 11 },
  '9':  { left: 65.5, top: 3,  width: 6,   height: 11 },
  '10': { left: 73,   top: 3,  width: 6,   height: 11 },
  '11': { left: 81,   top: 3,  width: 3,   height: 11, small: true },
  '12': { left: 84.6, top: 3,  width: 3,   height: 11, small: true },
  '13': { left: 88.2, top: 3,  width: 3,   height: 11, small: true },
  '14': { left: 91.8, top: 3,  width: 3,   height: 11, small: true },
  '15': { left: 95.4, top: 3,  width: 3,   height: 11, small: true },
  '16': { left: 94,   top: 17, width: 5,   height: 9 },
  '17': { left: 94,   top: 28, width: 5,   height: 9 },
  '18': { left: 94,   top: 39, width: 5,   height: 9 },
  '19': { left: 94,   top: 50, width: 5,   height: 9 },
  '21': { left: 2,    top: 27, width: 15,  height: 15, big: true },
  '23': { left: 30,   top: 29, width: 12,  height: 13 },
  '25': { left: 52,   top: 29, width: 12,  height: 13 },
  '27': { left: 74,   top: 29, width: 12,  height: 13 },
  '22': { left: 17,   top: 48, width: 12,  height: 13 },
  '24': { left: 41,   top: 48, width: 12,  height: 13 },
  '26': { left: 63,   top: 48, width: 12,  height: 13 },
  '28': { left: 85,   top: 48, width: 10,  height: 13, small: true },
  'Llevar 1':  { left: 2,  top: 84, width: 18, height: 12, bottom: true },
  'Llevar 2':  { left: 22, top: 84, width: 18, height: 12, bottom: true },
  'Express 1': { left: 42, top: 84, width: 18, height: 12, bottom: true },
  'Express 2': { left: 62, top: 84, width: 18, height: 12, bottom: true },
  'Express 3': { left: 82, top: 84, width: 16, height: 12, bottom: true },
}

const fmt = (v) => `₡${Number(v ?? 0).toLocaleString('es-CR')}`

function sizeClassFor(cfg) {
  if (cfg.big) return 'fp-big'
  if (cfg.bottom) return 'fp-bottom'
  if (cfg.small) return 'fp-small'
  return 'fp-normal'
}

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
          {Object.entries(FLOORPLAN).map(([mesa, cfg]) => {
            const order = findOpenOrder(mesa)
            const busy = !!order
            const label = cfg.bottom ? mesa.toUpperCase() : mesa
            return (
              <button
                key={mesa}
                type="button"
                className={`fp-item ${sizeClassFor(cfg)} ${busy ? 'busy' : ''}`}
                style={{
                  left: `${cfg.left}%`,
                  top: `${cfg.top}%`,
                  width: `${cfg.width}%`,
                  height: `${cfg.height}%`,
                }}
                onClick={() => (busy ? setSelectedMesa(mesa) : null)}
              >
                {label}
                {busy && (
                  <small className="mono">
                    {cfg.small ? fmt(order.total) : `${(order.items || []).reduce((s, i) => s + i.qty, 0)} art · ${fmt(order.total)}`}
                  </small>
                )}
              </button>
            )
          })}
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
