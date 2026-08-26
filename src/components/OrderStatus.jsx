import { useEffect, useState } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'
import { db } from '../firebase'

const STATUS_STEPS = [
  { key: 'pending', label: 'Pendiente' },
  { key: 'preparing', label: 'Preparando' },
  { key: 'on_the_way', label: 'En camino' },
  { key: 'delivered', label: 'Entregado' },
]

function whatsappConfirmLink(orderId, form) {
  const message = encodeURIComponent(
    `Hola, soy ${form.nombre}. Acabo de hacer un pedido en Los Pirchas (#${orderId.slice(
      0,
      6
    )}). Aquí les mando el comprobante de SINPE.`
  )
  const phone = form.telefono.replace(/[^\d]/g, '')
  return `https://wa.me/${phone}?text=${message}`
}

export default function OrderStatus({ orderId, form, onNewOrder }) {
  const [status, setStatus] = useState('pending')

  useEffect(() => {
    if (!orderId) return
    const unsub = onSnapshot(doc(db, 'orders', orderId), (snap) => {
      if (snap.exists()) setStatus(snap.data().status || 'pending')
    })
    return () => unsub()
  }, [orderId])

  const currentIndex = STATUS_STEPS.findIndex((s) => s.key === status)

  return (
    <div className="order-status">
      <div className="order-status__icon">✅</div>
      <h1>¡Pedido recibido!</h1>
      <p className="order-status__id mono">Pedido #{orderId.slice(0, 6)}</p>

      <div className="tracker">
        {STATUS_STEPS.map((step, i) => (
          <div key={step.key} className={`tracker__step ${i <= currentIndex ? 'is-active' : ''}`}>
            <span className="tracker__dot" />
            <span className="tracker__label">{step.label}</span>
          </div>
        ))}
      </div>

      <a className="btn-whatsapp" href={whatsappConfirmLink(orderId, form)} target="_blank" rel="noreferrer">
        Enviar comprobante por WhatsApp
      </a>

      <button className="back-link" onClick={onNewOrder}>
        Hacer otro pedido
      </button>
    </div>
  )
}

