import { useEffect, useState } from 'react'
import { useCart } from '../CartContext'

export default function Header({ onCartClick }) {
  const { count } = useCart()
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 140)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <>
      <section className="hero">
        <div className="hero__texture" aria-hidden="true" />
        <img src="/logo.jpeg" alt="Los Pirchas" className="hero__logo" />
        <p className="hero__eyebrow">Restaurante y Chicharronera</p>
        <h1 className="hero__title">Los Pirchas</h1>
        <p className="hero__sub">San Luis, Acosta — diagonal a Unifami</p>
      </section>

      <header className={`bar ${scrolled ? 'is-condensed' : ''}`}>
        <div className="bar__brand">
          <img src="/logo.jpeg" alt="" className="bar__logo" />
          <span className="bar__name">Los Pirchas</span>
        </div>
        <button className="bar__cart" onClick={onCartClick} aria-label="Ver carrito">
          <span className="bar__cart-icon">🛒</span>
          {count > 0 && <span className="bar__cart-badge">{count}</span>}
        </button>
      </header>
    </>
  )
}
