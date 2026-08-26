import { initializeApp } from 'firebase/app'
import { getFirestore } from 'firebase/firestore'
import { getDatabase } from 'firebase/database'
import { getAuth } from 'firebase/auth'
import { getStorage } from 'firebase/storage'
import { getAnalytics, isSupported } from 'firebase/analytics'

// Configuración del proyecto "Acosta Food" en Firebase
const firebaseConfig = {
  apiKey: 'AIzaSyBLVHsF0VqPorPkK0auaWUH_4-k-loC6iU',
  authDomain: 'acosta-food.firebaseapp.com',
  projectId: 'acosta-food',
  storageBucket: 'acosta-food.firebasestorage.app',
  messagingSenderId: '605529235094',
  appId: '1:605529235094:web:035dff54f04af00654acb7',
  measurementId: 'G-QWEN1MWXXZ',
}

export const app = initializeApp(firebaseConfig)
export const db = getFirestore(app)
export const auth = getAuth(app)
export const storage = getStorage(app)

// La Realtime Database es opcional — solo se activa si el proyecto la tiene habilitada
export let realtimeDB = null
try {
  realtimeDB = getDatabase(app)
} catch (err) {
  console.warn('Realtime Database no está configurada en este proyecto todavía.')
}

// Analytics solo funciona en el navegador (no en SSR) y solo si el entorno lo soporta
export let analytics = null
isSupported().then((supported) => {
  if (supported) analytics = getAnalytics(app)
})
