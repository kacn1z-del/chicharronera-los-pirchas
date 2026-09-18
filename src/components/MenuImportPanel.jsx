import { useState } from 'react'
import { collection, getDocs, deleteDoc, doc, addDoc, query, where, updateDoc } from 'firebase/firestore'
import { db } from '../firebase'
import { RESTRUCTURACION_SEED, REEMPLAZOS_SEED, ORDENES_A_ELIMINAR, BEBIDAS_CALIENTES_MIGRACION, BATIDOS_CATEGORIA_MIGRACION } from '../data/restructuracionSeed'

// Ya se usaron los botones de importación masiva (menú, Noche de Bocas,
// Órdenes/Café/Adicionales, bebidas, sabores de batido) — se quitaron para
// no dejarlos tentando a re-importar por accidente y duplicar el menú.
//
// TEMPORAL: se agregaron botones para la reestructuración de menú (Órdenes,
// Café, Postres, Menú de café nuevos + renombrar ítems existentes al texto
// exacto del cliente + limpieza de Adicionales/Smoothies + renombrar
// Helados a Postres). Una vez usados, quitar este bloque igual que se hizo
// con los anteriores para no dejarlos tentando a re-importar.
export default function MenuImportPanel() {
  const [status, setStatus] = useState('idle') // idle | checking | cleaning | importing | done | error
  const [message, setMessage] = useState('')
  const [existingCount, setExistingCount] = useState(null)
  const [nombreABorrar, setNombreABorrar] = useState('')

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

  // TEMPORAL — importa los ítems nuevos de Órdenes, Postres, Café y Menú de café
  const handleImportRestructuracion = async () => {
    setStatus('importing')
    setMessage('')
    try {
      await Promise.all(
        RESTRUCTURACION_SEED.map((item) => addDoc(collection(db, 'Menu'), item))
      )
      setStatus('done')
      setMessage(`Se importaron ${RESTRUCTURACION_SEED.length} platos nuevos.`)
    } catch (err) {
      setStatus('error')
      setMessage(err.message)
    }
  }

  // TEMPORAL — renombra ítems existentes al texto exacto que dio el cliente
  // (evita duplicar platos que ya estaban con otro nombre)
  const handleRenombrarExactos = async () => {
    setStatus('cleaning')
    setMessage('')
    try {
      let totalRenombrados = 0
      const notas = []

      for (const { viejo, nuevo } of REEMPLAZOS_SEED) {
        const q = query(collection(db, 'Menu'), where('nombre', '==', viejo))
        const snap = await getDocs(q)

        if (snap.empty) {
          notas.push(`"${viejo}" no se encontró.`)
          continue
        }

        await Promise.all(
          snap.docs.map((docSnap) => updateDoc(doc(db, 'Menu', docSnap.id), { nombre: nuevo }))
        )
        totalRenombrados += snap.size
      }

      setStatus('done')
      setMessage(
        `Se renombraron ${totalRenombrados} platos.` + (notas.length ? ` ${notas.join(' ')}` : '')
      )
    } catch (err) {
      setStatus('error')
      setMessage(err.message)
    }
  }

  // TEMPORAL — migra la categoría plana "Café" a "Bebidas calientes" con
  // 4 subcategorías (Café, Té, Aguadulce, Chocolate)
  const handleMigrarBebidasCalientes = async () => {
    setStatus('cleaning')
    setMessage('')
    try {
      let totalMigrados = 0
      const notas = []

      for (const { nombre, subcategoria } of BEBIDAS_CALIENTES_MIGRACION) {
        const q = query(collection(db, 'Menu'), where('nombre', '==', nombre))
        const snap = await getDocs(q)

        if (snap.empty) {
          notas.push(`"${nombre}" no se encontró.`)
          continue
        }

        await Promise.all(
          snap.docs.map((docSnap) =>
            updateDoc(doc(db, 'Menu', docSnap.id), { categoria: 'Bebidas calientes', subcategoria })
          )
        )
        totalMigrados += snap.size
      }

      setStatus('done')
      setMessage(
        `Se migraron ${totalMigrados} platos a "Bebidas calientes".` + (notas.length ? ` ${notas.join(' ')}` : '')
      )
    } catch (err) {
      setStatus('error')
      setMessage(err.message)
    }
  }

  // TEMPORAL — separa los 28 sabores de batido de la categoría genérica
  // "Bebidas" en "Batidos en agua" y "Batidos en leche"
  const handleMigrarBatidos = async () => {
    setStatus('cleaning')
    setMessage('')
    try {
      let totalMigrados = 0
      const notas = []

      for (const { nombre, categoria } of BATIDOS_CATEGORIA_MIGRACION) {
        const q = query(collection(db, 'Menu'), where('nombre', '==', nombre))
        const snap = await getDocs(q)

        if (snap.empty) {
          notas.push(`"${nombre}" no se encontró.`)
          continue
        }

        await Promise.all(
          snap.docs.map((docSnap) => updateDoc(doc(db, 'Menu', docSnap.id), { categoria }))
        )
        totalMigrados += snap.size
      }

      setStatus('done')
      setMessage(
        `Se migraron ${totalMigrados} batidos.` + (notas.length ? ` ${notas.join(' ')}` : '')
      )
    } catch (err) {
      setStatus('error')
      setMessage(err.message)
    }
  }

  // TEMPORAL — elimina las Órdenes viejas que el cliente no incluyó en su lista final
  const handleEliminarOrdenesViejas = async () => {
    setStatus('cleaning')
    setMessage('')
    try {
      let totalEliminados = 0
      const notas = []

      for (const nombre of ORDENES_A_ELIMINAR) {
        const q = query(collection(db, 'Menu'), where('nombre', '==', nombre))
        const snap = await getDocs(q)

        if (snap.empty) {
          notas.push(`"${nombre}" no se encontró.`)
          continue
        }

        await Promise.all(snap.docs.map((docSnap) => deleteDoc(doc(db, 'Menu', docSnap.id))))
        totalEliminados += snap.size
      }

      setStatus('done')
      setMessage(
        `Se eliminaron ${totalEliminados} platos de Órdenes.` + (notas.length ? ` ${notas.join(' ')}` : '')
      )
      setExistingCount((prev) => (prev ?? totalEliminados) - totalEliminados)
    } catch (err) {
      setStatus('error')
      setMessage(err.message)
    }
  }

  // TEMPORAL — renombra la categoría "Helados" a "Postres" en los docs existentes
  const handleRenameHeladosAPostres = async () => {
    setStatus('cleaning')
    setMessage('')
    try {
      const q = query(collection(db, 'Menu'), where('categoria', '==', 'Helados'))
      const snap = await getDocs(q)

      if (snap.empty) {
        setStatus('done')
        setMessage('No se encontraron platos en la categoría "Helados".')
        return
      }

      await Promise.all(
        snap.docs.map((docSnap) => updateDoc(doc(db, 'Menu', docSnap.id), { categoria: 'Postres' }))
      )

      setStatus('done')
      setMessage(`Se renombraron ${snap.size} platos de "Helados" a "Postres".`)
    } catch (err) {
      setStatus('error')
      setMessage(err.message)
    }
  }

  // TEMPORAL — elimina todos los platos de una categoría (Adicionales, Smoothies)
  const handleDeleteCategoria = async (categoria) => {
    setStatus('cleaning')
    setMessage('')
    try {
      const q = query(collection(db, 'Menu'), where('categoria', '==', categoria))
      const snap = await getDocs(q)

      if (snap.empty) {
        setStatus('done')
        setMessage(`No se encontraron platos en la categoría "${categoria}".`)
        return
      }

      await Promise.all(snap.docs.map((docSnap) => deleteDoc(doc(db, 'Menu', docSnap.id))))

      setStatus('done')
      setMessage(`Se eliminaron ${snap.size} platos de la categoría "${categoria}".`)
      setExistingCount((prev) => (prev ?? snap.size) - snap.size)
    } catch (err) {
      setStatus('error')
      setMessage(err.message)
    }
  }

  // TEMPORAL — elimina un plato suelto buscándolo por nombre exacto (para la
  // "Orden de yuca" vieja, ya que no sabemos su categoría exacta de antemano)
  const handleDeleteByNombre = async () => {
    const nombre = nombreABorrar.trim()
    if (!nombre) return

    setStatus('cleaning')
    setMessage('')
    try {
      const q = query(collection(db, 'Menu'), where('nombre', '==', nombre))
      const snap = await getDocs(q)

      if (snap.empty) {
        setStatus('done')
        setMessage(`No se encontró ningún plato con el nombre exacto "${nombre}".`)
        return
      }

      await Promise.all(snap.docs.map((docSnap) => deleteDoc(doc(db, 'Menu', docSnap.id))))

      setStatus('done')
      setMessage(`Se eliminaron ${snap.size} plato(s) con el nombre "${nombre}".`)
      setExistingCount((prev) => (prev ?? snap.size) - snap.size)
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

        <h4 style={{ marginTop: '1.5rem' }}>Reestructuración de menú (temporal)</h4>
        <div className="import-panel__actions">
          <button className="btn-primary" onClick={handleImportRestructuracion} disabled={status === 'importing'}>
            {status === 'importing' ? 'Importando…' : `Importar ${RESTRUCTURACION_SEED.length} platos nuevos`}
          </button>
          <button className="btn-secondary" onClick={handleRenombrarExactos} disabled={status === 'cleaning'}>
            Renombrar existentes al texto del cliente
          </button>
          <button className="btn-secondary" onClick={handleMigrarBebidasCalientes} disabled={status === 'cleaning'}>
            Migrar Café → Bebidas calientes (con subcategorías)
          </button>
          <button className="btn-secondary" onClick={handleMigrarBatidos} disabled={status === 'cleaning'}>
            Migrar Batidos → en agua / en leche
          </button>
          <button className="btn-secondary" onClick={handleEliminarOrdenesViejas} disabled={status === 'cleaning'}>
            Eliminar Órdenes viejas no listadas
          </button>
          <button className="btn-secondary" onClick={handleRenameHeladosAPostres} disabled={status === 'cleaning'}>
            Renombrar Helados → Postres
          </button>
          <button className="btn-secondary" onClick={() => handleDeleteCategoria('Adicionales')} disabled={status === 'cleaning'}>
            Eliminar categoría "Adicionales"
          </button>
          <button className="btn-secondary" onClick={() => handleDeleteCategoria('Smoothies')} disabled={status === 'cleaning'}>
            Eliminar categoría "Smoothies"
          </button>
        </div>

        <div className="import-panel__actions" style={{ marginTop: '0.75rem', alignItems: 'center' }}>
          <input
            type="text"
            placeholder='Nombre exacto a borrar (ej. "Orden de yuca")'
            value={nombreABorrar}
            onChange={(e) => setNombreABorrar(e.target.value)}
            style={{ flex: 1, minWidth: '200px', padding: '0.5rem' }}
          />
          <button className="btn-secondary" onClick={handleDeleteByNombre} disabled={status === 'cleaning' || !nombreABorrar.trim()}>
            Borrar por nombre
          </button>
        </div>
      </div>
    </div>
  )
}
