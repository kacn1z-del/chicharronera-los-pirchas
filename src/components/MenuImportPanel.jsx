import { useState } from 'react'
import { collection, getDocs, deleteDoc, doc } from 'firebase/firestore'
import { db } from '../firebase'

// Ya se usaron los botones de importación masiva (menú, Noche de Bocas,
// Órdenes/Café/Adicionales, bebidas, sabores de batido, reestructuración de
// menú de septiembre 2026) — se quitaron para no dejarlos tentando a
// re-importar por accidente y duplicar el menú.
export default function MenuImportPanel() {
  const [status, setStatus] = useState('idle') // idle | checking | cleaning | done | error
  const [message, setMessage] = useState('')
  const [existingCount, setExistingCount] = useState(null)

  const checkExisting = async () => {
    setStatus('checking')
    setMessage('')
    try {
      const snap = await getDocs(collection(db, 'Menu'))
      setExistingCount(snap.size)
      setStatus('idle')
    } catch (err) {
      setMessage(err.message)
      setStatus('error')
    }
  }

  const handleCleanDuplicates = async () => {
    setStatus('cleaning')
    setMessage('')
    try {
      const snap = await getDocs(collection(db, 'Menu'))
      const seen = new Map() // clave "nombre|categoria|precio" -> primer doc.id conservado
      const toDelete = []

      snap.docs.forEach((docSnap) => {
        const data = docSnap.data()
        const key = `${data.nombre}|${data.categoria}|${data.precio}`
        if (seen.has(key)) {
          toDelete.push(docSnap.id)
        } else {
          seen.set(key, docSnap.id)
        }
      })

      if (toDelete.length === 0) {
        setStatus('done')
        setMessage('No se encontraron duplicados — el menú ya está limpio.')
        return
      }

      await Promise.all(toDelete.map((id) => deleteDoc(doc(db, 'Menu', id))))

      setStatus('done')
      setMessage(`Se eliminaron ${toDelete.length} platos duplicados.`)
      setExistingCount((prev) => (prev ?? toDelete.length) - toDelete.length)
    } catch (err) {
      setStatus('error')
      setMessage(err.message)
    }
  }

  return (
    <div className="panel import-panel">
      <div className="import-panel__body">
        <h3>Mantenimiento del menú</h3>

        {existingCount !== null && (
          <p className="import-panel__count">
            Actualmente hay <strong className="mono">{existingCount}</strong> platos en Firestore.
          </p>
        )}

        {status === 'done' && <p className="import-panel__success">{message}</p>}
        {status === 'error' && <p className="import-panel__error">Error: {message}</p>}

        <div className="import-panel__actions">
          <button className="btn-secondary" onClick={checkExisting} disabled={status === 'checking'}>
            {status === 'checking' ? 'Revisando…' : 'Ver cuántos platos hay'}
          </button>
          <button className="btn-secondary" onClick={handleCleanDuplicates} disabled={status === 'cleaning'}>
            {status === 'cleaning' ? 'Limpiando…' : 'Eliminar duplicados'}
          </button>
        </div>
      </div>
    </div>
  )
}
