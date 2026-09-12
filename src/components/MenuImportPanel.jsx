import { useState } from 'react'
import { collection, getDocs, writeBatch, doc, deleteDoc } from 'firebase/firestore'
import { db } from '../firebase'
import { MENU_SEED } from '../data/menuSeed'
import { BOCAS_SEED } from '../data/bocasSeed'
import { EXTRAS_SEED } from '../data/extrasSeed'
import { BEBIDAS_SEED } from '../data/bebidasSeed'

export default function MenuImportPanel() {
  const [status, setStatus] = useState('idle') // idle | checking | importing | cleaning | done | error
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

  const handleImportBocas = async () => {
    setStatus('importing')
    setMessage('')
    try {
      const batch = writeBatch(db)
      const menuRef = collection(db, 'Menu')
      BOCAS_SEED.forEach((item) => {
        const newDoc = doc(menuRef)
        batch.set(newDoc, { ...item, disponible: true })
      })
      await batch.commit()
      setStatus('done')
      setMessage(`Se importaron ${BOCAS_SEED.length} platos de Noche de Bocas.`)
      setExistingCount((prev) => (prev ?? 0) + BOCAS_SEED.length)
    } catch (err) {
      setStatus('error')
      setMessage(err.message)
    }
  }

  const handleImportExtras = async () => {
    setStatus('importing')
    setMessage('')
    try {
      const batch = writeBatch(db)
      const menuRef = collection(db, 'Menu')
      EXTRAS_SEED.forEach((item) => {
        const newDoc = doc(menuRef)
        batch.set(newDoc, { ...item, disponible: true })
      })
      await batch.commit()
      setStatus('done')
      setMessage(`Se importaron ${EXTRAS_SEED.length} platos de Órdenes, Café y Adicionales.`)
      setExistingCount((prev) => (prev ?? 0) + EXTRAS_SEED.length)
    } catch (err) {
      setStatus('error')
      setMessage(err.message)
    }
  }

  const handleImportBebidas = async () => {
    setStatus('importing')
    setMessage('')
    try {
      const batch = writeBatch(db)
      const menuRef = collection(db, 'Menu')
      BEBIDAS_SEED.forEach((item) => {
        const newDoc = doc(menuRef)
        batch.set(newDoc, { ...item, disponible: true })
      })
      await batch.commit()
      setStatus('done')
      setMessage(`Se importaron ${BEBIDAS_SEED.length} ítems de cervezas, licores, helados, gaseosas, jugos y smoothies.`)
      setExistingCount((prev) => (prev ?? 0) + BEBIDAS_SEED.length)
    } catch (err) {
      setStatus('error')
      setMessage(err.message)
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
          <button
            className="btn-secondary"
            onClick={handleCleanDuplicates}
            disabled={status === 'cleaning'}
          >
            {status === 'cleaning' ? 'Limpiando…' : 'Eliminar duplicados'}
          </button>
        </div>

        {existingCount > 0 && (
          <p className="import-panel__warning">
            ⚠️ Si tocás "Importar menú ahora" más de una vez, se duplican los platos. Si eso pasa, usá el
            botón "Eliminar duplicados" — conserva un solo plato de cada combinación
            nombre + categoría + precio y borra el resto.
          </p>
        )}
      </div>

      <div className="import-panel__divider" />

      <div className="import-panel__body">
        <h3>Importar "Noche de Bocas"</h3>
        <p className="import-panel__hint">
          Menú especial de {BOCAS_SEED.length} bocas — lunes a jueves, 5:00 p.m. a 10:00 p.m., solo consumo
          en el restaurante. Este botón NO toca el menú principal, solo agrega estos platos nuevos.
        </p>
        <button className="btn-primary" onClick={handleImportBocas} disabled={status === 'importing'}>
          {status === 'importing' ? 'Importando…' : 'Importar Noche de Bocas'}
        </button>
      </div>
      <div className="import-panel__divider" />

      <div className="import-panel__body">
        <h3>Importar Órdenes, Café y Adicionales</h3>
        <p className="import-panel__hint">
          Agrega {EXTRAS_SEED.length} ítems (acompañamientos sueltos, cafés y adicionales) transcritos del
          sistema viejo. No toca el menú principal, solo agrega estos platos nuevos.
        </p>
        <button className="btn-primary" onClick={handleImportExtras} disabled={status === 'importing'}>
          {status === 'importing' ? 'Importando…' : 'Importar Órdenes/Café/Adicionales'}
        </button>
      </div>

      <div className="import-panel__divider" />

      <div className="import-panel__body">
        <h3>Importar cervezas, licores, helados, gaseosas, jugos y smoothies</h3>
        <p className="import-panel__hint">
          Agrega {BEBIDAS_SEED.length} ítems transcritos del sistema viejo. No toca el menú principal, solo
          agrega estos platos nuevos.
        </p>
        <button className="btn-primary" onClick={handleImportBebidas} disabled={status === 'importing'}>
          {status === 'importing' ? 'Importando…' : 'Importar bebidas y helados'}
        </button>
      </div>
    </div>
  )
}
