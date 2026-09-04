import { useEffect, useMemo, useState } from 'react'
import { collection, doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore'
import { db, writeAndContinue } from '../firebase'

const PAYMENT_OPTIONS = [
  { key: 'efectivo', label: 'Efectivo' },
  { key: 'sinpe', label: 'SINPE' },
  { key: 'tarjeta', label: 'Tarjeta' },
]

function formatColones(value) {
  return `₡${Number(value ?? 0).toLocaleString('es-CR')}`
}

export default function PhoneOrderPanel({ onCreated, onCancel }) {
  const [menuItems, setMenuItems] = useState([])
  const [cart, setCart] = useState([]) // [{ nombre, precio, qty }]
  const [search, setSearch] = useState('')
  const [clientName, setClientName] = useState('')
  const [clientPhone, setClientPhone] = useState('')
  const [clientAddress, setClientAddress] = useState('')
  const [entrega, setEntrega] = useState('recoge') // 'recoge' | 'domicilio'
  const [paymentMethod, setPaymentMethod] = useState('efectivo')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'Menu'), (snap) => {
      setMenuItems(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    })
    return () => unsub()
  }, [])

  const filteredMenu = useMemo(() => {
    const term = search.trim().toLowerCase()
    const disponibles = menuItems.filter((m) => m.disponible !== false)
    if (!term) return disponibles
    return disponibles.filter(
      (m) => m.nombre?.toLowerCase().includes(term) || m.categoria?.toLowerCase().includes(term)
    )
  }, [menuItems, search])

  const total = cart.reduce((sum, i) => sum + i.precio * i.qty, 0)

  const addItem = (menuItem) => {
    setCart((prev) => {
      const existing = prev.find((i) => i.nombre === menuItem.nombre)
      if (existing) {
        return prev.map((i) => (i.nombre === menuItem.nombre ? { ...i, qty: i.qty + 1 } : i))
      }
      return [...prev, { nombre: menuItem.nombre, precio: menuItem.precio, qty: 1 }]
    })
  }

  const changeQty = (nombre, delta) => {
    setCart((prev) =>
      prev
        .map((i) => (i.nombre === nombre ? { ...i, qty: i.qty + delta } : i))
        .filter((i) => i.qty > 0)
    )
  }

  const isValid = clientPhone.trim() && cart.length > 0 && (entrega === 'recoge' || clientAddress.trim())

  const handleSave = async () => {
    if (!isValid) return
    setSaving(true)
    setError(null)
    try {
      const newRef = doc(collection(db, 'orders'))
      const { queued } = await writeAndContinue(
        setDoc(newRef, {
          clientName: clientName.trim() || 'Pedido telefónico',
          clientPhone: clientPhone.trim(),
          clientAddress: entrega === 'domicilio' ? clientAddress.trim() : null,
          restaurantName: 'Los Pirchas',
          origen: 'telefono',
          tipo: entrega === 'domicilio' ? 'express' : 'llevar',
          items: cart,
          total,
          paymentMethod,
          notes: notes.trim() || null,
          status: 'pending',
          cierreId: null,
          createdAt: serverTimestamp(),
        })
      )
      setCart([])
      setClientName('')
      setClientPhone('')
      setClientAddress('')
      setNotes('')
      onCreated?.(queued)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="panel phone-order-panel">
      <div className="phone-order-panel__grid">
        <div className="phone-order-panel__menu">
          <input
            className="menu-editor__search"
            placeholder="Buscar plato…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="phone-order-panel__items">
            {filteredMenu.map((item) => (
              <button
                key={item.id}
                type="button"
                className="phone-order-panel__item"
                onClick={() => addItem(item)}
              >
                <span>{item.nombre}</span>
                <span className="mono">{formatColones(item.precio)}</span>
              </button>
            ))}
            {filteredMenu.length === 0 && <p className="panel-hint">Sin resultados.</p>}
          </div>
        </div>

        <div className="phone-order-panel__cart">
          <h3 className="section-block__title">Pedido</h3>
          {cart.length === 0 ? (
            <p className="panel-hint">Tocá un plato de la izquierda para agregarlo.</p>
          ) : (
            <ul className="phone-order-panel__cart-list">
              {cart.map((it) => (
                <li key={it.nombre}>
                  <span>{it.nombre}</span>
                  <div className="stock-ctrl">
                    <button type="button" className="action-btn" onClick={() => changeQty(it.nombre, -1)}>
                      −
                    </button>
                    <span className="mono">{it.qty}</span>
                    <button type="button" className="action-btn" onClick={() => changeQty(it.nombre, 1)}>
                      +
                    </button>
                  </div>
                  <span className="mono">{formatColones(it.precio * it.qty)}</span>
                </li>
              ))}
            </ul>
          )}
          <div className="phone-order-panel__total">
            <span>Total</span>
            <span className="mono">{formatColones(total)}</span>
          </div>

          <div className="dish-form__row">
            <label>
              Nombre del cliente
              <input value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder="Opcional" />
            </label>
            <label>
              Teléfono
              <input value={clientPhone} onChange={(e) => setClientPhone(e.target.value)} placeholder="8888-8888" />
            </label>
          </div>

          <div className="dish-form__row">
            <label>
              Entrega
              <select value={entrega} onChange={(e) => setEntrega(e.target.value)}>
                <option value="recoge">Recoge en local</option>
                <option value="domicilio">A domicilio</option>
              </select>
            </label>
            <label>
              Método de pago
              <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
                {PAYMENT_OPTIONS.map((p) => (
                  <option key={p.key} value={p.key}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {entrega === 'domicilio' && (
            <label>
              Dirección de entrega
              <input
                value={clientAddress}
                onChange={(e) => setClientAddress(e.target.value)}
                placeholder="Dirección completa"
              />
            </label>
          )}

          <label>
            Notas (opcional)
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </label>

          {error && <p className="form-error">{error}</p>}

          <div className="dish-form__actions">
            <button className="btn-secondary" type="button" onClick={onCancel}>
              Cancelar
            </button>
            <button className="btn-primary" type="button" disabled={!isValid || saving} onClick={handleSave}>
              {saving ? 'Guardando…' : 'Registrar pedido'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
