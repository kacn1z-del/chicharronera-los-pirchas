import { useCart } from '../CartContext'

function formatColones(value) {
  return `₡${Number(value ?? 0).toLocaleString('es-CR')}`
}

export default function CartDrawer({ open, onClose, onCheckout }) {
  const { items, setQty, removeItem, total } = useCart()

  if (!open) return null

  return (
    <div className="drawer-overlay" onClick={onClose}>
      <div className="drawer" onClick={(e) => e.stopPropagation()}>
        <div className="drawer__header">
          <h2>Tu pedido</h2>
          <button className="drawer__close" onClick={onClose} aria-label="Cerrar carrito">
            ✕
          </button>
        </div>

        {items.length === 0 ? (
          <div className="state-panel">
            <p>Todavía no agregaste nada.</p>
          </div>
        ) : (
          <>
            <div className="drawer__items">
              {items.map((item) => (
                <div key={item.id} className="cart-row">
                  <div className="cart-row__info">
                    <p className="cart-row__name">{item.nombre}</p>
                    <p className="cart-row__price mono">{formatColones(item.precio)}</p>
                  </div>
                  <div className="cart-row__qty">
                    <button onClick={() => setQty(item.id, item.qty - 1)} aria-label="Restar">
                      −
                    </button>
                    <span className="mono">{item.qty}</span>
                    <button onClick={() => setQty(item.id, item.qty + 1)} aria-label="Sumar">
                      +
                    </button>
                  </div>
                  <button className="cart-row__remove" onClick={() => removeItem(item.id)} aria-label="Quitar">
                    🗑
                  </button>
                </div>
              ))}
            </div>

            <div className="drawer__footer">
              <div className="drawer__total">
                <span>Total</span>
                <span className="mono">{formatColones(total)}</span>
              </div>
              <button className="btn-primary" onClick={onCheckout}>
                Continuar al pedido
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
