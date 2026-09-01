import { useEffect, useState } from 'react'
import { collection, deleteDoc, doc, onSnapshot, updateDoc, addDoc } from 'firebase/firestore'
import { db } from '../firebase'

const UNIDADES = ['unidades', 'kg', 'g', 'l', 'ml', 'paquetes', 'cajas']

function emptyDraft() {
  return { nombre: '', categoria: '', cantidad: '', unidad: 'unidades', minimo: '', notas: '' }
}

export default function InventoryPanel() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [editingId, setEditingId] = useState(null)
  const [draft, setDraft] = useState(emptyDraft())
  const [adding, setAdding] = useState(false)
  const [filter, setFilter] = useState('')
  const [saving, setSaving] = useState(false)
  const [busyId, setBusyId] = useState(null)

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'inventario'),
      (snap) => {
        setItems(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
        setLoading(false)
      },
      (err) => {
        setError(err.message)
        setLoading(false)
      }
    )
    return () => unsub()
  }, [])

  const startEdit = (item) => {
    setAdding(false)
    setEditingId(item.id)
    setDraft({
      nombre: item.nombre || '',
      categoria: item.categoria || '',
      cantidad: item.cantidad ?? '',
      unidad: item.unidad || 'unidades',
      minimo: item.minimo ?? '',
      notas: item.notas || '',
    })
  }

  const startAdd = () => {
    setEditingId(null)
    setAdding(true)
    setDraft(emptyDraft())
  }

  const cancel = () => {
    setEditingId(null)
    setAdding(false)
    setDraft(emptyDraft())
  }

  const buildPayload = () => ({
    nombre: draft.nombre.trim(),
    categoria: draft.categoria.trim() || null,
    cantidad: Number(draft.cantidad) || 0,
    unidad: draft.unidad || 'unidades',
    minimo: draft.minimo === '' ? null : Number(draft.minimo),
    notas: draft.notas.trim() || null,
  })

  const saveEdit = async () => {
    if (!draft.nombre.trim()) return
    setSaving(true)
    try {
      await updateDoc(doc(db, 'inventario', editingId), buildPayload())
      cancel()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const saveNew = async () => {
    if (!draft.nombre.trim()) return
    setSaving(true)
    try {
      await addDoc(collection(db, 'inventario'), buildPayload())
      cancel()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (item) => {
    if (!window.confirm(`¿Quitar "${item.nombre}" del inventario?`)) return
    setBusyId(item.id)
    try {
      await deleteDoc(doc(db, 'inventario', item.id))
    } catch (err) {
      setError(err.message)
    } finally {
      setBusyId(null)
    }
  }

  const adjustStock = async (item, delta) => {
    const next = Math.max(0, Number(item.cantidad || 0) + delta)
    setBusyId(item.id)
    try {
      await updateDoc(doc(db, 'inventario', item.id), { cantidad: next })
    } catch (err) {
      setError(err.message)
    } finally {
      setBusyId(null)
    }
  }

  if (loading) return <div className="panel panel--empty">Cargando inventario…</div>

  if (error) {
    return (
      <div className="panel panel--empty">
        <p>Error: {error}</p>
      </div>
    )
  }

  const filtered = filter
    ? items.filter(
        (i) =>
          i.nombre?.toLowerCase().includes(filter.toLowerCase()) ||
          i.categoria?.toLowerCase().includes(filter.toLowerCase())
      )
    : items

  const sorted = [...filtered].sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''))

  return (
    <div className="menu-editor">
      <div className="menu-editor__toolbar">
        <input
          className="menu-editor__search"
          placeholder="Buscar producto o categoría…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <button className="btn-primary" onClick={startAdd}>
          + Agregar producto
        </button>
      </div>

      {adding && (
        <InventoryForm
          draft={draft}
          setDraft={setDraft}
          onCancel={cancel}
          onSave={saveNew}
          saving={saving}
          saveLabel="Agregar producto"
        />
      )}

      <div className="panel">
        <table className="orders-table inventory-table">
          <colgroup>
            <col style={{ width: '22%' }} />
            <col style={{ width: '16%' }} />
            <col style={{ width: '26%' }} />
            <col style={{ width: '14%' }} />
            <col style={{ width: '22%' }} />
          </colgroup>
          <thead>
            <tr>
              <th>Producto</th>
              <th>Categoría</th>
              <th>Stock</th>
              <th>Estado</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((item) => {
              const bajo = item.minimo != null && Number(item.cantidad || 0) <= Number(item.minimo)
              return editingId === item.id ? (
                <tr key={item.id}>
                  <td colSpan={5} data-label="">
                    <InventoryForm
                      draft={draft}
                      setDraft={setDraft}
                      onCancel={cancel}
                      onSave={saveEdit}
                      saving={saving}
                      saveLabel="Guardar cambios"
                    />
                  </td>
                </tr>
              ) : (
                <tr key={item.id}>
                  <td data-label="Producto">
                    {item.nombre}
                    {item.notas && <div className="order-sub">{item.notas}</div>}
                  </td>
                  <td data-label="Categoría">{item.categoria || '—'}</td>
                  <td data-label="Stock">
                    <div className="stock-ctrl">
                      <button
                        type="button"
                        className="action-btn"
                        disabled={busyId === item.id}
                        onClick={() => adjustStock(item, -1)}
                      >
                        −
                      </button>
                      <span className="mono">
                        {item.cantidad ?? 0} {item.unidad}
                      </span>
                      <button
                        type="button"
                        className="action-btn"
                        disabled={busyId === item.id}
                        onClick={() => adjustStock(item, 1)}
                      >
                        +
                      </button>
                    </div>
                  </td>
                  <td data-label="Estado">
                    <span className={`badge ${bajo ? 'badge--red' : 'badge--green'}`}>
                      {bajo ? 'Stock bajo' : 'OK'}
                    </span>
                  </td>
                  <td data-label="Acciones">
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      <button className="btn-secondary" onClick={() => startEdit(item)}>
                        Editar
                      </button>
                      <button
                        className="btn-secondary"
                        disabled={busyId === item.id}
                        onClick={() => handleDelete(item)}
                      >
                        Quitar
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {sorted.length === 0 && <p style={{ padding: '20px', textAlign: 'center' }}>Sin productos en el inventario.</p>}
      </div>
    </div>
  )
}

function InventoryForm({ draft, setDraft, onCancel, onSave, saving, saveLabel }) {
  const set = (field) => (e) => setDraft((d) => ({ ...d, [field]: e.target.value }))

  return (
    <div className="dish-form">
      <div className="dish-form__row">
        <label>
          Nombre del producto
          <input value={draft.nombre} onChange={set('nombre')} placeholder="Ej: Queso mozzarella" />
        </label>
        <label>
          Categoría (opcional)
          <input value={draft.categoria} onChange={set('categoria')} placeholder="Ej: Lácteos" />
        </label>
      </div>
      <div className="dish-form__row">
        <label>
          Cantidad actual
          <input type="number" value={draft.cantidad} onChange={set('cantidad')} placeholder="0" />
        </label>
        <label>
          Unidad
          <select value={draft.unidad} onChange={set('unidad')}>
            {UNIDADES.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        </label>
        <label>
          Mínimo antes de alertar (opcional)
          <input type="number" value={draft.minimo} onChange={set('minimo')} placeholder="Ej: 5" />
        </label>
      </div>
      <label>
        Notas (opcional)
        <textarea value={draft.notas} onChange={set('notas')} rows={2} />
      </label>

      <div className="dish-form__actions">
        <button className="btn-secondary" onClick={onCancel} type="button">
          Cancelar
        </button>
        <button className="btn-primary" onClick={onSave} disabled={saving} type="button">
          {saving ? 'Guardando…' : saveLabel}
        </button>
      </div>
    </div>
  )
}
