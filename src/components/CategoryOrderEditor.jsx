import { useEffect, useRef, useState } from 'react'
import { collection, doc, onSnapshot, setDoc } from 'firebase/firestore'
import { db } from '../firebase'

// Guarda el orden de las categorías (las "cintas"/pestañas del menú del
// cliente) en Firestore, en Config/categoryOrder, campo `orden` (array de
// nombres de categoría). El sitio del cliente lee ese mismo documento y
// ordena las pestañas según lo que se guarde acá.
const CONFIG_DOC = 'categoryOrder'

function mergeOrder(saved, categoriasActuales) {
  const enOrdenGuardado = saved.filter((c) => categoriasActuales.includes(c))
  const faltantes = categoriasActuales
    .filter((c) => !saved.includes(c))
    .sort((a, b) => a.localeCompare(b))
  return [...enOrdenGuardado, ...faltantes]
}

export default function CategoryOrderEditor() {
  const [categoriasActuales, setCategoriasActuales] = useState([])
  const [catsLoaded, setCatsLoaded] = useState(false)
  const [savedOrder, setSavedOrder] = useState([])
  const [savedLoaded, setSavedLoaded] = useState(false)
  const [order, setOrder] = useState([])
  const [status, setStatus] = useState('idle') // idle | saving | saved | error
  const [message, setMessage] = useState('')
  const [loadError, setLoadError] = useState(null)
  const initialized = useRef(false)

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'Menu'),
      (snap) => {
        const cats = [...new Set(snap.docs.map((d) => d.data().categoria).filter(Boolean))]
        setCategoriasActuales(cats)
        setCatsLoaded(true)
      },
      (err) => setLoadError(`Error leyendo Menu: ${err.message}`)
    )
    return () => unsub()
  }, [])

  useEffect(() => {
    const unsub = onSnapshot(
      doc(db, 'Config', CONFIG_DOC),
      (snap) => {
        setSavedOrder(snap.exists() && Array.isArray(snap.data().orden) ? snap.data().orden : [])
        setSavedLoaded(true)
      },
      (err) => setLoadError(`Error leyendo Config/${CONFIG_DOC}: ${err.message}`)
    )
    return () => unsub()
  }, [])

  // Solo arma el orden inicial una vez, cuando ya cargaron ambas cosas.
  // Si después aparece una categoría nueva en el menú, se agrega al final
  // sin pisar el orden que ya armó el usuario en pantalla.
  useEffect(() => {
    if (!catsLoaded || !savedLoaded) return
    if (!initialized.current) {
      setOrder(mergeOrder(savedOrder, categoriasActuales))
      initialized.current = true
      return
    }
    setOrder((prev) => {
      const faltantes = categoriasActuales.filter((c) => !prev.includes(c)).sort((a, b) => a.localeCompare(b))
      if (faltantes.length === 0) return prev
      return [...prev, ...faltantes]
    })
  }, [catsLoaded, savedLoaded, categoriasActuales, savedOrder])

  const mover = (idx, dir) => {
    setOrder((prev) => {
      const next = [...prev]
      const destino = idx + dir
      if (destino < 0 || destino >= next.length) return prev
      ;[next[idx], next[destino]] = [next[destino], next[idx]]
      return next
    })
  }

  const guardar = async () => {
    setStatus('saving')
    setMessage('')
    try {
      await setDoc(doc(db, 'Config', CONFIG_DOC), { orden: order }, { merge: true })
      setStatus('saved')
      setMessage('Orden guardado — el sitio del cliente ya lo va a usar.')
    } catch (err) {
      setStatus('error')
      setMessage(err.message)
    }
  }

  if (loadError) {
    return (
      <div className="panel panel--empty">
        <p>{loadError}</p>
        <p className="dish-form__hint">
          Probablemente falta permiso en las reglas de Firestore para leer/escribir la colección "Config".
        </p>
      </div>
    )
  }

  if (!catsLoaded || !savedLoaded) {
    return <div className="panel panel--empty">Cargando categorías…</div>
  }

  return (
    <div className="panel category-order">
      <div className="category-order__body">
        <h3>Orden de las categorías (pestañas del menú)</h3>
        <p className="dish-form__hint">
          Usá las flechas para subir o bajar cada categoría, y tocá "Guardar orden" al terminar.
        </p>

        {status === 'saved' && <p className="import-panel__success">{message}</p>}
        {status === 'error' && <p className="import-panel__error">Error: {message}</p>}

        <ol className="category-order__list">
          {order.map((cat, idx) => (
            <li key={cat} className="category-order__item">
              <span className="category-order__name">{cat}</span>
              <div className="category-order__actions">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => mover(idx, -1)}
                  disabled={idx === 0}
                  aria-label={`Subir ${cat}`}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => mover(idx, 1)}
                  disabled={idx === order.length - 1}
                  aria-label={`Bajar ${cat}`}
                >
                  ↓
                </button>
              </div>
            </li>
          ))}
        </ol>

        <button className="btn-primary" onClick={guardar} disabled={status === 'saving'}>
          {status === 'saving' ? 'Guardando…' : 'Guardar orden'}
        </button>
      </div>
    </div>
  )
}
