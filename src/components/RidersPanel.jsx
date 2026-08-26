import { useEffect, useState } from 'react'
import { onValue, ref } from 'firebase/database'
import { realtimeDB } from '../firebase'

export default function RidersPanel() {
  const [riders, setRiders] = useState([])
  const [status, setStatus] = useState(realtimeDB ? 'loading' : 'unavailable')

  useEffect(() => {
    if (!realtimeDB) return
    const unsub = onValue(
      ref(realtimeDB, 'deliveries'),
      (snapshot) => {
        const value = snapshot.val() || {}
        setRiders(
          Object.entries(value).map(([id, data]) => ({
            id,
            ...data,
          }))
        )
        setStatus('ready')
      },
      () => setStatus('error')
    )
    return () => unsub()
  }, [])

  if (status === 'unavailable') {
    return (
      <div className="panel panel--empty">
        <p>La Realtime Database no está habilitada en este proyecto todavía.</p>
        <p className="panel__hint">
          Activala en Firebase → Realtime Database para ver la ubicación de los repartidores en vivo.
        </p>
      </div>
    )
  }

  if (status === 'loading') return <div className="panel panel--empty">Cargando repartidores…</div>

  if (status === 'error') {
    return (
      <div className="panel panel--empty">
        <p>No se pudo leer el nodo "deliveries" en la Realtime Database.</p>
      </div>
    )
  }

  if (riders.length === 0) {
    return (
      <div className="panel panel--empty">
        <p>Ningún repartidor está enviando ubicación todavía.</p>
      </div>
    )
  }

  return (
    <div className="panel">
      <div className="card-grid">
        {riders.map((rider) => (
          <div key={rider.id} className="rider-card">
            <div className="rider-card__dot" aria-hidden="true" />
            <div>
              <p className="rider-card__id mono">{rider.id}</p>
              <p className="rider-card__coords mono">
                {rider.lat?.toFixed(4)}, {rider.lng?.toFixed(4)}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

