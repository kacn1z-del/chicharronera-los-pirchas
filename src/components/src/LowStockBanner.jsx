import { useEffect, useState } from 'react'
import { collection, onSnapshot } from 'firebase/firestore'
import { db } from '../firebase'

// Umbral por defecto: si un producto de inventario no tiene "minimo" propio
// configurado, se avisa igual apenas queden 5 unidades o menos.
const UMBRAL_DEFECTO = 5

function estaBajo(item) {
  const umbral = item.minimo != null ? Number(item.minimo) : UMBRAL_DEFECTO
  return Number(item.cantidad || 0) <= umbral
}

export default function LowStockBanner() {
  const [items, setItems] = useState([])

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'inventario'), (snap) => {
      setItems(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    })
    return () => unsub()
  }, [])

  const bajos = items.filter(estaBajo).sort((a, b) => Number(a.cantidad || 0) - Number(b.cantidad || 0))

  if (bajos.length === 0) return null

  return (
    <div className="low-stock-banner" role="alert">
      <span className="low-stock-banner__icon">⚠️</span>
      <div className="low-stock-banner__body">
        <strong>Pocas existencias en inventario:</strong>
        <div className="low-stock-banner__list">
          {bajos.map((item) => (
            <span key={item.id} className="low-stock-banner__item">
              {item.nombre}: {item.cantidad ?? 0} {item.unidad || 'unidades'}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
