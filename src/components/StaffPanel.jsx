import { useEffect, useState } from 'react'
import { collection, onSnapshot } from 'firebase/firestore'
import { auth, db } from '../firebase'

const ROL_LABELS = {
  admin: 'Administrador',
  invitado: 'Invitado',
}

export default function StaffPanel() {
  const [staff, setStaff] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [usuario, setUsuario] = useState('')
  const [nombre, setNombre] = useState('')
  const [password, setPassword] = useState('')
  const [rol, setRol] = useState('invitado')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState(null)

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'staff'),
      (snap) => {
        setStaff(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
        setLoading(false)
      },
      (err) => {
        setError(err.message)
        setLoading(false)
      }
    )
    return () => unsub()
  }, [])

  const handleCreate = async (e) => {
    e.preventDefault()
    if (!usuario.trim() || !nombre.trim() || !password) return
    setSaving(true)
    setFormError(null)
    try {
      const idToken = await auth.currentUser.getIdToken()
      const res = await fetch('/api/crear-usuario', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ usuario: usuario.trim(), nombre: nombre.trim(), password, rol }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'No se pudo crear el usuario')
      setUsuario('')
      setNombre('')
      setPassword('')
      setRol('invitado')
    } catch (err) {
      setFormError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="panel staff-panel">
      <form className="staff-form" onSubmit={handleCreate}>
        <label>
          Usuario
          <input
            value={usuario}
            onChange={(e) => setUsuario(e.target.value)}
            placeholder="roselle"
            autoComplete="off"
            autoCapitalize="none"
          />
        </label>
        <label>
          Nombre
          <input
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Roselle"
            autoComplete="off"
          />
        </label>
        <label>
          Contraseña
          <input
            type="text"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="mínimo 6 caracteres"
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            name="staff-password-field"
            data-lpignore="true"
          />
        </label>
        <label>
          Rol
          <select value={rol} onChange={(e) => setRol(e.target.value)}>
            <option value="invitado">Invitado (ver, cobrar, cerrar caja)</option>
            <option value="admin">Administrador (control total)</option>
          </select>
        </label>
        <button type="submit" className="btn-primary" disabled={saving}>
          {saving ? 'Creando…' : '+ Crear usuario'}
        </button>
      </form>

      {formError && <p className="form-error">{formError}</p>}

      {loading ? (
        <p style={{ padding: '10px 0' }}>Cargando…</p>
      ) : error ? (
        <p style={{ padding: '10px 0' }}>No se pudo leer la colección "staff": {error}</p>
      ) : (
        <table className="orders-table">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Usuario</th>
              <th>Rol</th>
            </tr>
          </thead>
          <tbody>
            {staff.map((s) => (
              <tr key={s.id}>
                <td data-label="Nombre">{s.nombre}</td>
                <td data-label="Usuario" className="mono">{s.email}</td>
                <td data-label="Rol">
                  <span className={`badge ${s.rol === 'admin' ? 'badge--green' : 'badge--blue'}`}>
                    {ROL_LABELS[s.rol] || s.rol}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
