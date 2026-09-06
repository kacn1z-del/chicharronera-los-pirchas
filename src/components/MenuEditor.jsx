import { useEffect, useState } from 'react'
import { collection, deleteDoc, doc, onSnapshot, updateDoc, addDoc } from 'firebase/firestore'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { db, storage } from '../firebase'

function formatColones(value) {
  return `₡${Number(value ?? 0).toLocaleString('es-CR')}`
}

function emptyDraft() {
  return { nombre: '', categoria: '', precio: '', descripcion: '', imagenUrl: '', disponible: true, receta: [] }
}

export default function MenuEditor({ isAdmin = false }) {
  const [items, setItems] = useState([])
  const [inventarioItems, setInventarioItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [editingId, setEditingId] = useState(null)
  const [draft, setDraft] = useState(emptyDraft())
  const [adding, setAdding] = useState(false)
  const [filter, setFilter] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'Menu'),
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

  // Se usa para armar el selector de "receta" (qué productos de inventario
  // se descuentan al vender este plato).
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'inventario'), (snap) => {
      setInventarioItems(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    })
    return () => unsub()
  }, [])

  const startEdit = (item) => {
    setAdding(false)
    setEditingId(item.id)
    setDraft({
      nombre: item.nombre || '',
      categoria: item.categoria || '',
      precio: item.precio ?? '',
      descripcion: item.descripcion || '',
      imagenUrl: item.imagenUrl || '',
      disponible: item.disponible !== false,
      receta: Array.isArray(item.receta) ? item.receta : [],
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
    categoria: draft.categoria.trim(),
    precio: Number(draft.precio) || 0,
    descripcion: draft.descripcion.trim() || null,
    imagenUrl: draft.imagenUrl.trim() || null,
    disponible: draft.disponible,
    // Solo se guardan las filas de receta que quedaron con producto e ingrediente elegidos.
    receta: (draft.receta || [])
      .filter((r) => r.inventarioId && Number(r.cantidad) > 0)
      .map((r) => ({
        inventarioId: r.inventarioId,
        inventarioNombre: r.inventarioNombre,
        cantidad: Number(r.cantidad),
      })),
  })

  const saveEdit = async () => {
    if (!draft.nombre.trim() || !draft.categoria.trim()) return
    setSaving(true)
    try {
      await updateDoc(doc(db, 'Menu', editingId), buildPayload())
      cancel()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const saveNew = async () => {
    if (!draft.nombre.trim() || !draft.categoria.trim()) return
    setSaving(true)
    try {
      await addDoc(collection(db, 'Menu'), buildPayload())
      cancel()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id) => {
    try {
      await deleteDoc(doc(db, 'Menu', id))
    } catch (err) {
      setError(err.message)
    }
  }

  const toggleDisponible = async (item) => {
    try {
      await updateDoc(doc(db, 'Menu', item.id), { disponible: item.disponible === false })
    } catch (err) {
      setError(err.message)
    }
  }

  if (loading) return <div className="panel panel--empty">Cargando menú…</div>

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

  const sorted = [...filtered].sort((a, b) => (a.categoria || '').localeCompare(b.categoria || ''))

  return (
    <div className="menu-editor">
      <div className="menu-editor__toolbar">
        <input
          className="menu-editor__search"
          placeholder="Buscar plato o categoría…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        {isAdmin && (
          <button className="btn-primary" onClick={startAdd}>
            + Agregar plato
          </button>
        )}
      </div>

      {isAdmin && adding && (
        <DishForm
          draft={draft}
          setDraft={setDraft}
          onCancel={cancel}
          onSave={saveNew}
          saving={saving}
          saveLabel="Agregar plato"
          inventarioItems={inventarioItems}
        />
      )}

      <div className="panel">
        <table className="orders-table">
          <thead>
            <tr>
              <th>Plato</th>
              <th>Categoría</th>
              <th>Precio</th>
              <th>Estado</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((item) =>
              isAdmin && editingId === item.id ? (
                <tr key={item.id}>
                  <td colSpan={5}>
                    <DishForm
                      draft={draft}
                      setDraft={setDraft}
                      onCancel={cancel}
                      onSave={saveEdit}
                      saving={saving}
                      saveLabel="Guardar cambios"
                      inventarioItems={inventarioItems}
                    />
                  </td>
                </tr>
              ) : (
                <tr key={item.id}>
                  <td data-label="Plato">
                    {item.nombre}
                    {Array.isArray(item.receta) && item.receta.length > 0 && (
                      <div className="order-sub">
                        Descuenta: {item.receta.map((r) => `${r.cantidad}× ${r.inventarioNombre}`).join(', ')}
                      </div>
                    )}
                  </td>
                  <td data-label="Categoría">{item.categoria}</td>
                  <td data-label="Precio" className="mono">{formatColones(item.precio)}</td>
                  <td data-label="Estado">
                    {isAdmin ? (
                      <button
                        className={`badge ${item.disponible !== false ? 'badge--green' : 'badge--gray'}`}
                        onClick={() => toggleDisponible(item)}
                        style={{ border: 'none', cursor: 'pointer' }}
                      >
                        {item.disponible !== false ? 'Disponible' : 'Agotado'}
                      </button>
                    ) : (
                      <span className={`badge ${item.disponible !== false ? 'badge--green' : 'badge--gray'}`}>
                        {item.disponible !== false ? 'Disponible' : 'Agotado'}
                      </span>
                    )}
                  </td>
                  {isAdmin && (
                    <td data-label="Acciones">
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button className="btn-secondary" onClick={() => startEdit(item)}>
                          Editar
                        </button>
                        <button className="btn-secondary" onClick={() => handleDelete(item.id)}>
                          Borrar
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              )
            )}
          </tbody>
        </table>
        {sorted.length === 0 && <p style={{ padding: '20px', textAlign: 'center' }}>Sin resultados.</p>}
      </div>
    </div>
  )
}

function DishForm({ draft, setDraft, onCancel, onSave, saving, saveLabel, inventarioItems }) {
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState(null)

  const set = (field) => (e) =>
    setDraft((d) => ({ ...d, [field]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setUploadError(null)
    try {
      const path = `menu/${Date.now()}-${file.name}`
      const fileRef = ref(storage, path)
      await uploadBytes(fileRef, file)
      const url = await getDownloadURL(fileRef)
      setDraft((d) => ({ ...d, imagenUrl: url }))
    } catch (err) {
      setUploadError(err.message)
    } finally {
      setUploading(false)
    }
  }

  const receta = draft.receta || []

  const addIngrediente = () => {
    setDraft((d) => ({
      ...d,
      receta: [...(d.receta || []), { inventarioId: '', inventarioNombre: '', cantidad: 1 }],
    }))
  }

  const updateIngredienteProducto = (idx, inventarioId) => {
    const inv = inventarioItems.find((i) => i.id === inventarioId)
    setDraft((d) => {
      const next = [...(d.receta || [])]
      next[idx] = { ...next[idx], inventarioId, inventarioNombre: inv?.nombre || '' }
      return { ...d, receta: next }
    })
  }

  const updateIngredienteCantidad = (idx, cantidad) => {
    setDraft((d) => {
      const next = [...(d.receta || [])]
      next[idx] = { ...next[idx], cantidad }
      return { ...d, receta: next }
    })
  }

  const removeIngrediente = (idx) => {
    setDraft((d) => ({ ...d, receta: (d.receta || []).filter((_, i) => i !== idx) }))
  }

  return (
    <div className="dish-form">
      <div className="dish-form__row">
        <label>
          Nombre
          <input value={draft.nombre} onChange={set('nombre')} placeholder="Nombre del plato" />
        </label>
        <label>
          Categoría
          <input value={draft.categoria} onChange={set('categoria')} placeholder="Ej: Casados" />
        </label>
      </div>
      <div className="dish-form__row">
        <label>
          Precio (₡)
          <input type="number" value={draft.precio} onChange={set('precio')} placeholder="4500" />
        </label>
        <label className="dish-form__checkbox">
          <input type="checkbox" checked={draft.disponible} onChange={set('disponible')} />
          Disponible
        </label>
      </div>
      <label>
        Descripción (opcional)
        <textarea value={draft.descripcion} onChange={set('descripcion')} rows={2} />
      </label>

      <label>
        Foto del plato
        <input type="file" accept="image/*" onChange={handleFileChange} disabled={uploading} />
      </label>
      {uploading && <p className="dish-form__hint">Subiendo foto…</p>}
      {uploadError && <p className="form-error">No se pudo subir la foto: {uploadError}</p>}
      {draft.imagenUrl && (
        <div className="dish-form__preview">
          <img src={draft.imagenUrl} alt="Vista previa" />
          <button
            type="button"
            className="btn-secondary"
            onClick={() => setDraft((d) => ({ ...d, imagenUrl: '' }))}
          >
            Quitar foto
          </button>
        </div>
      )}

      <div className="recipe-block">
        <div className="recipe-block__head">
          <span>Receta (qué se descuenta del inventario al vender 1 unidad)</span>
          <button type="button" className="btn-secondary" onClick={addIngrediente}>
            + Agregar ingrediente
          </button>
        </div>
        {receta.length === 0 && (
          <p className="dish-form__hint">
            Sin receta configurada — este plato no va a descontar inventario automáticamente.
          </p>
        )}
        {receta.map((r, idx) => (
          <div className="recipe-row" key={idx}>
            <select
              value={r.inventarioId}
              onChange={(e) => updateIngredienteProducto(idx, e.target.value)}
            >
              <option value="">Elegir producto de inventario…</option>
              {inventarioItems.map((inv) => (
                <option key={inv.id} value={inv.id}>
                  {inv.nombre}
                </option>
              ))}
            </select>
            <input
              type="number"
              min="0"
              step="0.01"
              className="recipe-row__cantidad"
              value={r.cantidad}
              onChange={(e) => updateIngredienteCantidad(idx, e.target.value)}
              placeholder="Cantidad"
            />
            <button type="button" className="btn-secondary" onClick={() => removeIngrediente(idx)}>
              Quitar
            </button>
          </div>
        ))}
      </div>

      <div className="dish-form__actions">
        <button className="btn-secondary" onClick={onCancel} type="button">
          Cancelar
        </button>
        <button className="btn-primary" onClick={onSave} disabled={saving || uploading} type="button">
          {saving ? 'Guardando…' : saveLabel}
        </button>
      </div>
    </div>
  )
}
