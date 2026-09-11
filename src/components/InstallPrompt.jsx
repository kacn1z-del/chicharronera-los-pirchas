import { useEffect, useState } from 'react'

// Ofrece instalar la página como app. En Android/Chrome/Edge el propio
// navegador dispara un evento ("beforeinstallprompt") que podemos capturar
// para mostrar un botón que instala directo. En iPhone (Safari) ese evento
// no existe — ahí lo único posible es explicarle al usuario los 2 toques
// que tiene que dar él mismo (Compartir → Agregar a pantalla de inicio).
//
// No se muestra nada si la app ya está instalada (modo standalone), ni de
// nuevo en la misma sesión si la persona ya lo cerró.
export default function InstallPrompt({ appName = 'esta app' }) {
  const [deferredPrompt, setDeferredPrompt] = useState(null)
  const [showIosHint, setShowIosHint] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    const yaInstalada =
      window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true
    if (yaInstalada) return

    if (localStorage.getItem('pirchas-install-dismissed') === '1') return

    const esIOS = /iphone|ipad|ipod/i.test(window.navigator.userAgent)

    const onBeforeInstall = (e) => {
      e.preventDefault()
      setDeferredPrompt(e)
    }
    window.addEventListener('beforeinstallprompt', onBeforeInstall)

    // Safari en iPhone nunca dispara "beforeinstallprompt" — ahí mostramos
    // directamente el instructivo, sin esperar un evento que no va a llegar.
    if (esIOS) setShowIosHint(true)

    return () => window.removeEventListener('beforeinstallprompt', onBeforeInstall)
  }, [])

  const dismiss = () => {
    localStorage.setItem('pirchas-install-dismissed', '1')
    setDismissed(true)
  }

  const instalar = async () => {
    if (!deferredPrompt) return
    deferredPrompt.prompt()
    await deferredPrompt.userChoice
    setDeferredPrompt(null)
  }

  if (dismissed || (!deferredPrompt && !showIosHint)) return null

  return (
    <div className="install-banner">
      {deferredPrompt ? (
        <>
          <span className="install-banner__text">📲 Instalá {appName} en este dispositivo</span>
          <button type="button" className="install-banner__btn" onClick={instalar}>
            Instalar
          </button>
        </>
      ) : (
        <span className="install-banner__text">
          📲 Para instalar {appName}: tocá <strong>Compartir</strong> (el cuadrito con la flecha) y
          después <strong>"Agregar a pantalla de inicio"</strong>.
        </span>
      )}
      <button type="button" className="install-banner__close" onClick={dismiss} aria-label="Cerrar">
        ✕
      </button>
    </div>
  )
}
