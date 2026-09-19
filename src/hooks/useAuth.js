import { useEffect, useState } from 'react'
import { onAuthStateChanged, signOut } from 'firebase/auth'
import { doc, onSnapshot } from 'firebase/firestore'
import { auth, db } from '../firebase'

// Lee la sesión de Firebase y, si hay alguien logueado, su rol (guardado en
// la colección "staff"):
//   'admin'    — Auris, control total.
//   'invitado' — mesero (Roselle): ver pedidos, cobrarlos, crear pedidos
//                telefónicos y hacer cierres de caja, pero no eliminar
//                pedidos ni editar menú/inventario.
//   'cocina'   — pantalla de cocina: solo ve pedidos con comida pendiente y
//                los marca "Preparado", nada más.
//   'bebidas'  — pantalla hermana de cocina, pero para bebidas: solo ve
//                pedidos con bebida pendiente y los marca "Preparado".
export function useAuth() {
  const [user, setUser] = useState(null)
  const [role, setRole] = useState(null)
  const [nombre, setNombre] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, (firebaseUser) => {
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
        setRole(snap.exists() ? snap.data().rol : null)
        setNombre(snap.exists() ? snap.data().nombre : null)
        setLoading(false)
      },
      () => {
        setRole(null)
        setLoading(false)
      }
    )
    return () => unsubStaff()
  }, [user])

  return {
    user,
    role, // 'admin' | 'invitado' | 'cocina' | 'bebidas' | null (null mientras carga o si no tiene perfil de staff)
    nombre,
    loading,
    isAdmin: role === 'admin',
    isCocina: role === 'cocina',
    isBebidas: role === 'bebidas',
    logout: () => signOut(auth),
  }
}
