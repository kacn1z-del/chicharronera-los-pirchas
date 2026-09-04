import { initializeApp } from 'firebase/app'
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore'
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

// Caché persistente: guarda los datos en el dispositivo (IndexedDB) para que
// el panel siga funcionando sin internet — se puede seguir viendo mesas,
// pedidos y menú, y los cambios que se hagan (marcar pedidos, cerrar caja,
// etc.) quedan en cola y se mandan solos apenas vuelva la señal.
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
}, 'default')

export const auth = getAuth(app)
export const storage = getStorage(app)

// Firestore NO resuelve las promesas de escritura (addDoc/setDoc/updateDoc)
// mientras no hay conexión — aunque el dato ya quedó guardado localmente y
// se manda solo apenas vuelva la señal. Por eso, si estamos offline, no se
// espera esa promesa (evita que la pantalla se quede "colgada"); si hay
// conexión, sí se espera, para detectar errores reales al toque.
//
// Uso: const { queued } = await writeAndContinue(updateDoc(ref, data))
export async function writeAndContinue(promise) {
  if (navigator.onLine) {
    await promise
    return { queued: false }
  }
  promise.catch(() => {}) // ya quedó en la cola local; evita "unhandled rejection"
  return { queued: true }
}

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
