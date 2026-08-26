import { useState } from 'react'
import { CartProvider } from './CartContext'
import Header from './components/Header'
import Menu from './components/Menu'
import CartDrawer from './components/CartDrawer'
import Checkout from './components/Checkout'
import OrderStatus from './components/OrderStatus'
import './App.css'

export default function App() {
  const [cartOpen, setCartOpen] = useState(false)
  const [view, setView] = useState('menu') // 'menu' | 'checkout' | 'confirmation'
  const [completedOrder, setCompletedOrder] = useState(null)

  const handleCheckout = () => {
    setCartOpen(false)
    setView('checkout')
  }

  const handleSuccess = (orderId, form) => {
    setCompletedOrder({ orderId, form })
    setView('confirmation')
  }

  const handleNewOrder = () => {
    setCompletedOrder(null)
    setView('menu')
  }

  return (
    <CartProvider>
      <div className="app-shell">
        <div className="flame flame--one" aria-hidden="true" />
        <div className="flame flame--two" aria-hidden="true" />

        {view !== 'confirmation' && <Header onCartClick={() => setCartOpen(true)} />}

        <main className="app-main">
          {view === 'menu' && <Menu />}
          {view === 'checkout' && (
            <Checkout onBack={() => setView('menu')} onSuccess={handleSuccess} />
          )}
          {view === 'confirmation' && completedOrder && (
            <OrderStatus
              orderId={completedOrder.orderId}
              form={completedOrder.form}
              onNewOrder={handleNewOrder}
            />
          )}
        </main>

        {view === 'menu' && (
          <CartDrawer open={cartOpen} onClose={() => setCartOpen(false)} onCheckout={handleCheckout} />
        )}
      </div>
    </CartProvider>
  )
}
