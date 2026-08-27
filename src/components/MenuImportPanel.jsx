import { useState } from 'react'
import { collection, getDocs, writeBatch, doc } from 'firebase/firestore'
import { db } from '../firebase'
import { MENU_SEED } from '../data/menuSeed'

export default function MenuImportPanel() {
  const [status, setStatus] = useState('idle') // idle | checking | importing | done | error
  const [message, setMessage] = useState('')
  const [existingCount, setExistingCount] = useState(null)

  const checkExisting = async () => {
    setStatus('checking')
    try {
      const snap = await getDocs(collection(db, 'Menu'))
      setExistingCount(snap.size)
      setStatus('idle')
    } catch (err) {
      setMessage(err.message)
      setStatus('error')
    }
  }

  const handleImport = async () => {
    setStatus('importing')
    setMessage('')
    try {
      // Firestore permite hasta 500 escrituras por batch — el menú entra en uno solo
      const batch = writeBatch(db)
      const menuRef = collection(db, 'Menu')
      MENU_SEED.forEach((item) => {
        const newDoc = doc(menuRef)
        batch.set(newDoc, { ...item, disponible: true })
      })
      await batch.commit()
      setStatus('done')
      setMessage(`Se importaron ${MENU_SEED.length} platos correctamente.`)
      setExistingCount((prev) => (prev ?? 0) + MENU_SEED.length)
    } catch (err) {
      setStatus('error')
      setMessage(err.message)
    }
  }

  return (
    <div className="panel import-panel">
      <div className="import-panel__body">
        <h3>Importar menú completo</h3>
        <p className="import-panel__hint">
          Carga los {MENU_SEED.length} platos del menú de Los Pirchas a la colección{' '}
          <span className="mono">Menu</span> de una sola vez.
        </p>

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
          <button className="btn-primary" onClick={handleImport} disabled={status === 'importing'}>
            {status === 'importing' ? 'Importando…' : 'Importar menú ahora'}
          </button>
        </div>

        {existingCount > 0 && (
          <p className="import-panel__warning">
            ⚠️ Ya hay platos cargados. Si volvés a importar, se van a duplicar (no reemplaza, agrega de
            nuevo). Si eso pasa, borrá los duplicados a mano desde Firebase Console.
          </p>
        )}
      </div>
    </div>
  )
}
