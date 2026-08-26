import { useCart } from '../CartContext'

export default function Header({ onCartClick }) {
  const { count } = useCart()

  return (
    <header className="header">
      <div className="header__brand">
        <img src="/logo.jpeg" alt="Los Pirchas" className="header__logo" />
        <div>
          <p className="header__title">Los Pirchas</p>
          <p className="header__subtitle">Restaurante y Chicharronera</p>
        </div>
      </div>
      <button className="header__cart" onClick={onCartClick} aria-label="Ver carrito">
        🛒
        {count > 0 && <span className="header__cart-badge">{count}</span>}
      </button>
    </header>
  )
}
