import { useState } from 'react'
import { signInWithEmailAndPassword } from 'firebase/auth'
import { auth } from '../firebase'

// Las cuentas de staff se crean con un correo "interno" @staff.lospirchas.com
// (no hace falta que reciba correos de verdad, Firebase Auth solo necesita
// el formato). El usuario escribe su nombre corto (ej. "auris"), acá lo
// convertimos al correo completo antes de intentar el login.
function toStaffEmail(input) {
  const clean = input.trim().toLowerCase()
  return clean.includes('@') ? clean : `${clean}@staff.lospirchas.com`
}

export default function LoginScreen() {
  const [usuario, setUsuario] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!usuario.trim() || !password) return
    setLoading(true)
    setError(null)
    try {
      await signInWithEmailAndPassword(auth, toStaffEmail(usuario), password)
    } catch (err) {
      console.error('Error de login:', err.code, err.message)
      setError(`No se pudo entrar (${err.code || 'error desconocido'}). Detalle: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-screen">
      <div className="login-screen__card">
        <h1 className="login-screen__title">🔥 Los Pirchas</h1>
        <p className="login-screen__subtitle">Panel de administración</p>
        <form onSubmit={handleSubmit} className="login-screen__form">
          <label>
            Usuario
            <input
              value={usuario}
              onChange={(e) => setUsuario(e.target.value)}
              placeholder="auris"
              autoCapitalize="none"
              autoCorrect="off"
              autoFocus
            />
          </label>
          <label>
            Contraseña
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </label>
          {error && <p className="login-screen__error">{error}</p>}
          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? 'Entrando…' : 'Entrar'}
          </button>
        </form>
      </div>
    </div>
  )
}
