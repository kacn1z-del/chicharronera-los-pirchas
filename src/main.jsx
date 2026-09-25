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
// Versión mejorada con logs y mejor manejo de errores.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .then((registration) => {
        console.log('✅ Service Worker registrado exitosamente:', registration)
      })
      .catch((error) => {
        console.error('❌ Error registrando Service Worker:', error)
        console.error('Detalles:', error.message)
      })
  })
} else {
  console.warn('⚠️ Este navegador NO soporta Service Workers')
}

// Log adicional para debug en Android Go
if (navigator.storage && navigator.storage.persist) {
  navigator.storage.persist().then((persistent) => {
    console.log('📦 Storage persistente:', persistent ? 'SÍ' : 'NO')
  })
}

// Check: vé si el manifest se cargó
fetch('/manifest.json')
  .then((res) => {
    if (!res.ok) {
      console.error('❌ Manifest no encontrado (HTTP', res.status, ')')
    } else {
      console.log('✅ Manifest encontrado')
    }
  })
  .catch((err) => console.error('❌ Error cargando manifest:', err))
