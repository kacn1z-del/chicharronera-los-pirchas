import { useState } from 'react'
import { addDoc, collection, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase'
import { useCart } from '../CartContext'

function formatColones(value) {
  return `₡${Number(value ?? 0).toLocaleString('es-CR')}`
}

// Número de SINPE Móvil de Los Pirchas — actualizar con el número real del negocio
const SINPE_NUMBER = '0000-0000'

export default function Checkout({ onBack, onSuccess }) {
  const { items, total, clear } = useCart()
  const [form, setForm] = useState({ nombre: '', telefono: '', direccion: '', notas: '' })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  const update = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }))

  const isValid = form.nombre.trim() && form.telefono.trim() && form.direccion.trim() && items.length > 0

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!isValid) return
    setSubmitting(true)
    setError(null)
    try {
      const orderRef = await addDoc(collection(db, 'orders'), {
        clientName: form.nombre.trim(),
        clientPhone: form.telefono.trim(),
        clientAddress: form.direccion.trim(),
        notes: form.notas.trim() || null,
        restaurantName: 'Los Pirchas',
        items: items.map((i) => ({ nombre: i.nombre, precio: i.precio, qty: i.qty })),
        total,
        paymentMethod: 'sinpe',
        status: 'pending',
        createdAt: serverTimestamp(),
      })
      clear()
      onSuccess(orderRef.id, form)
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="checkout">
      <button className="back-link" onClick={onBack}>
        ← Volver al carrito
      </button>

      <h1>Datos de entrega</h1>

      <form className="checkout__form" onSubmit={handleSubmit}>
        <label>
          Nombre completo
          <input value={form.nombre} onChange={update('nombre')} placeholder="Tu nombre" required />
        </label>
        <label>
          Teléfono (WhatsApp)
          <input
            value={form.telefono}
            onChange={update('telefono')}
            placeholder="8888-8888"
            inputMode="tel"
            required
          />
        </label>
        <label>
          Dirección de entrega
          <textarea
            value={form.direccion}
            onChange={update('direccion')}
            placeholder="Casa, señas, distrito…"
            rows={3}
            required
          />
        </label>
        <label>
          Notas (opcional)
          <textarea
            value={form.notas}
            onChange={update('notas')}
            placeholder="Sin cebolla, tocar el timbre, etc."
            rows={2}
          />
        </label>

        <div className="payment-box">
          <h3>Pago por SINPE Móvil</h3>
          <p>
            Transferí <strong className="mono">{formatColones(total)}</strong> al número{' '}
            <strong className="mono">{SINPE_NUMBER}</strong> a nombre de Los Pirchas.
          </p>
          <p className="payment-box__hint">
            Después de confirmar el pedido, mandanos el comprobante por WhatsApp para agilizar la entrega.
          </p>
        </div>

        {error && <p className="form-error">No se pudo enviar el pedido: {error}</p>}

        <button type="submit" className="btn-primary" disabled={!isValid || submitting}>
          {submitting ? 'Enviando pedido…' : `Confirmar pedido — ${formatColones(total)}`}
        </button>
      </form>
    </div>
  )
}
