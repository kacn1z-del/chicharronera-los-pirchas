import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)

// Registra el service worker que hace instalable la página como app.
// Antes de registrar, se desinstala cualquier service worker viejo y se
// borran sus caches — esto autolimpia a cualquier usuario que haya quedado
// con una versión vieja atascada, sin que tenga que borrar datos a mano.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      const registros = await navigator.serviceWorker.getRegistrations()
      await Promise.all(registros.map((r) => r.unregister()))
      if (window.caches) {
        const nombres = await caches.keys()
        await Promise.all(nombres.map((n) => caches.delete(n)))
      }
    } catch (e) {
      // Ignorar errores de limpieza; igual se intenta registrar el nuevo.
    }

    navigator.serviceWorker.register('/sw.js').catch(() => {})
  })
}
