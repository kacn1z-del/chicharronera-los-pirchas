import { useEffect, useState } from 'react'
import { onAuthStateChanged, signOut } from 'firebase/auth'
import { doc, onSnapshot } from 'firebase/firestore'
import { auth, db } from '../firebase'

// Lee la sesión de Firebase y, si hay alguien logueado, su rol (guardado en
// la colección "staff") — 'admin' (Auris, control total) o 'invitado'
// (mesero, Roselle: pueden ver pedidos, cobrarlos, crear pedidos telefónicos
// y hacer cierres de caja, pero no eliminar pedidos ni editar menú/inventario).
export function useAuth() {
  const [user, setUser] = useState(null)
  const [role, setRole] = useState(null)
  const [nombre, setNombre] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, (firebaseUser) => {
      alert('DIAG onAuthStateChanged: ' + (firebaseUser ? firebaseUser.uid : 'null'))
      setUser(firebaseUser)
      if (!firebaseUser) {
        setRole(null)
        setNombre(null)
        setLoading(false)
      }
    })
    return () => unsubAuth()
  }, [])

  useEffect(() => {
    if (!user) return
    const unsubStaff = onSnapshot(
      doc(db, 'staff', user.uid),
      (snap) => {
        alert('DIAG staff OK. existe=' + snap.exists() + ' datos=' + JSON.stringify(snap.data()))
        setRole(snap.exists() ? snap.data().rol : null)
        setNombre(snap.exists() ? snap.data().nombre : null)
        setLoading(false)
      },
      (err) => {
        alert('DIAG staff ERROR: ' + err.code + ' — ' + err.message)
        setRole(null)
        setLoading(false)
      }
    )
    return () => unsubStaff()
  }, [user])

  return {
    user,
    role, // 'admin' | 'invitado' | null (null mientras carga o si no tiene perfil de staff)
    nombre,
    loading,
    isAdmin: role === 'admin',
    logout: () => signOut(auth),
  }
}
