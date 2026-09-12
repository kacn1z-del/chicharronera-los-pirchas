import { useEffect, useRef } from 'react'
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore'
import { db } from '../firebase'

// Reproduce un "ding" con la Web Audio API — no depende de ningún archivo de
// audio, así que no hay que subir ni cargar ningún .mp3/.wav.
function playBell() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext
    if (!AudioCtx) return
    const ctx = new AudioCtx()
    const now = ctx.currentTime

    // Dos tonos cortos (como un "ding-dong" de campanita) uno después del otro.
    ;[
      { freq: 880, start: 0, dur: 0.18 },
      { freq: 660, start: 0.16, dur: 0.28 },
    ].forEach(({ freq, start, dur }) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      gain.gain.setValueAtTime(0.0001, now + start)
      gain.gain.exponentialRampToValueAtTime(0.35, now + start + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + start + dur)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(now + start)
      osc.stop(now + start + dur + 0.02)
    })

    // Cerramos el contexto un rato después para no dejar procesos de audio
    // abiertos indefinidamente.
    setTimeout(() => ctx.close().catch(() => {}), 1000)
  } catch (err) {
    console.error('No se pudo reproducir el sonido de pedido nuevo:', err)
  }
}

// Suena una campanita cada vez que entra un pedido nuevo a la colección
// "orders" de Firestore, sin importar en qué pantalla del panel esté el
// usuario. En la primera carga (todos los pedidos existentes llegan como
// "added" de una sola vez) no suena nada — solo suena para pedidos que
// entran DESPUÉS de que la página ya está abierta.
//
// Nota sobre iOS/Safari: los navegadores solo dejan reproducir audio
// después de que el usuario haya tocado la pantalla al menos una vez. Por
// eso este hook también "desbloquea" el audio en el primer toque, aunque
// igual puede fallar en segundo plano/pantalla bloqueada — es una
// limitación del navegador, no de la app.
export default function useNewOrderSound(enabled) {
  const isFirstSnapshot = useRef(true)
  const unlockedRef = useRef(false)

  useEffect(() => {
    if (!enabled) return

    // Desbloquea el audio en el primer toque a la pantalla (requisito de
    // Safari/iOS para poder reproducir sonido más adelante sin gesto).
    const unlock = () => {
      if (unlockedRef.current) return
      unlockedRef.current = true
      try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext
        if (AudioCtx) {
          const ctx = new AudioCtx()
          ctx.resume().finally(() => ctx.close().catch(() => {}))
        }
      } catch {
        // no-op
      }
    }
    window.addEventListener('touchstart', unlock, { once: true })
    window.addEventListener('click', unlock, { once: true })

    isFirstSnapshot.current = true
    const q = query(collection(db, 'orders'), orderBy('createdAt', 'desc'))
    const unsub = onSnapshot(q, (snapshot) => {
      if (isFirstSnapshot.current) {
        isFirstSnapshot.current = false
        return
      }
      const hayPedidoNuevo = snapshot.docChanges().some((change) => change.type === 'added')
      if (hayPedidoNuevo) playBell()
    })

    return () => {
      unsub()
      window.removeEventListener('touchstart', unlock)
      window.removeEventListener('click', unlock)
    }
  }, [enabled])
}
