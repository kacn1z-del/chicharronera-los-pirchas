import { useEffect, useState } from 'react'
import { collection, deleteDoc, doc, onSnapshot, updateDoc, addDoc } from 'firebase/firestore'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { db, storage } from '../firebase'

function formatColones(value) {
  return `₡${Number(value ?? 0).toLocaleString('es-CR')}`
}

function emptyDraft() {
  return { nombre: '', categoria: '', precio: '', descripcion: '', imagenUrl: '', disponible: true }
}

export default function MenuEditor() {
  const [items, setItems] = useState([])
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
        <button className="btn-primary" onClick={startAdd}>
          + Agregar plato
        </button>
      </div>

      {adding && (
        <DishForm
          draft={draft}
          setDraft={setDraft}
          onCancel={cancel}
          onSave={saveNew}
          saving={saving}
          saveLabel="Agregar plato"
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
              editingId === item.id ? (
                <tr key={item.id}>
                  <td colSpan={5}>
                    <DishForm
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
                  <td>{item.nombre}</td>
                  <td>{item.categoria}</td>
                  <td className="mono">{formatColones(item.precio)}</td>
                  <td>
                    <button
                      className={`badge ${item.disponible !== false ? 'badge--green' : 'badge--gray'}`}
                      onClick={() => toggleDisponible(item)}
                      style={{ border: 'none', cursor: 'pointer' }}
                    >
                      {item.disponible !== false ? 'Disponible' : 'Agotado'}
                    </button>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button className="btn-secondary" onClick={() => startEdit(item)}>
                        Editar
                      </button>
                      <button className="btn-secondary" onClick={() => handleDelete(item.id)}>
                        Borrar
                      </button>
                    </div>
                  </td>
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

function DishForm({ draft, setDraft, onCancel, onSave, saving, saveLabel }) {
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
