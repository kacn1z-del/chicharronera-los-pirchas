import { useEffect, useState } from 'react'
import { collection, onSnapshot } from 'firebase/firestore'
import { db } from '../firebase'

export default function UsersPanel() {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'users'),
      (snapshot) => {
        setUsers(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })))
        setLoading(false)
      },
      (err) => {
        setError(err.message)
        setLoading(false)
      }
    )
    return () => unsub()
  }, [])

  if (loading) return <div className="panel panel--empty">Cargando usuarios…</div>

  if (error) {
    return (
      <div className="panel panel--empty">
        <p>No se pudo leer la colección "users".</p>
        <p className="panel__hint mono">{error}</p>
      </div>
    )
  }

  if (users.length === 0) {
    return (
      <div className="panel panel--empty">
        <p>Todavía no hay usuarios registrados.</p>
      </div>
    )
  }

  return (
    <div className="panel">
      <table className="orders-table">
        <thead>
          <tr>
            <th>Nombre</th>
            <th>Teléfono</th>
            <th>Correo</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id}>
              <td data-label="Nombre">{u.nombre || u.name || '—'}</td>
              <td data-label="Teléfono" className="mono">{u.telefono || u.phone || '—'}</td>
              <td data-label="Correo">{u.email || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
