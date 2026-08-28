import { useEffect, useState } from 'react'
import { collection, onSnapshot } from 'firebase/firestore'
import { db } from '../firebase'

export default function RestaurantsPanel() {
  const [restaurants, setRestaurants] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'restaurants'),
      (snapshot) => {
        setRestaurants(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })))
        setLoading(false)
      },
      (err) => {
        setError(err.message)
        setLoading(false)
      }
    )
    return () => unsub()
  }, [])

  if (loading) return <div className="panel panel--empty">Cargando restaurantes…</div>

  if (error) {
    return (
      <div className="panel panel--empty">
        <p>No se pudo leer la colección "restaurants".</p>
        <p className="panel__hint mono">{error}</p>
      </div>
    )
  }

  if (restaurants.length === 0) {
    return (
      <div className="panel panel--empty">
        <p>Todavía no hay restaurantes registrados.</p>
        <p className="panel__hint">
          Cuando se cree un documento en <span className="mono">restaurants</span>, aparece aquí.
        </p>
      </div>
    )
  }

  return (
    <div className="panel">
      <div className="card-grid">
        {restaurants.map((r) => (
          <div key={r.id} className="restaurant-card">
            <div className="restaurant-card__top">
              <h3>{r.nombre || r.name || 'Sin nombre'}</h3>
              <span className={`badge ${r.activo ?? r.disponible ? 'badge--green' : 'badge--gray'}`}>
                {(r.activo ?? r.disponible) ? 'Activo' : 'Inactivo'}
              </span>
            </div>
            <p className="restaurant-card__meta">{r.categoria || 'Sin categoría'}</p>
            {r.direccion && <p className="restaurant-card__meta">{r.direccion}</p>}
          </div>
        ))}
      </div>
    </div>
  )
}

