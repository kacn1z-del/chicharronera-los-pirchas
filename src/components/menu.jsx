import { useEffect, useState } from 'react'
import { collection, onSnapshot } from 'firebase/firestore'
import { db } from '../firebase'
import { useCart } from '../CartContext'

function formatColones(value) {
  return `₡${Number(value ?? 0).toLocaleString('es-CR')}`
}

export default function Menu() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const { addItem } = useCart()

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'Menu'),
      (snapshot) => {
        setItems(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })))
        setLoading(false)
      },
      (err) => {
        setError(err.message)
        setLoading(false)
      }
    )
    return () => unsub()
  }, [])

  if (loading) {
    return <div className="state-panel">Cargando menú…</div>
  }

  if (error) {
    return (
      <div className="state-panel">
        <p>No se pudo cargar el menú.</p>
        <p className="state-panel__hint mono">{error}</p>
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div className="state-panel">
        <p>Todavía no hay platos cargados.</p>
        <p className="state-panel__hint">
          En cuanto se agregue un documento a la colección <span className="mono">Menu</span>, aparece aquí.
        </p>
      </div>
    )
  }

  const grouped = items.reduce((acc, item) => {
    const cat = item.categoria || 'Otros'
    acc[cat] = acc[cat] || []
    acc[cat].push(item)
    return acc
  }, {})

  return (
    <div className="menu">
      {Object.entries(grouped).map(([categoria, platos]) => (
        <section key={categoria} className="menu__section">
          <h2 className="menu__category">{categoria}</h2>
          <div className="menu__grid">
            {platos.map((plato) => {
              const disponible = plato.disponible !== false
              return (
                <article key={plato.id} className={`dish-card ${!disponible ? 'is-disabled' : ''}`}>
                  <div className="dish-card__top">
                    <h3>{plato.nombre}</h3>
                    <span className="dish-card__price mono">{formatColones(plato.precio)}</span>
                  </div>
                  {plato.descripcion && <p className="dish-card__desc">{plato.descripcion}</p>}
                  <button
                    className="dish-card__add"
                    disabled={!disponible}
                    onClick={() => addItem(plato)}
                  >
                    {disponible ? 'Agregar al carrito' : 'No disponible'}
                  </button>
                </article>
              )
            })}
          </div>
        </section>
      ))}
    </div>
  )
}
