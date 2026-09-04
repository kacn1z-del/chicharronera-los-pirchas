import { useEffect, useMemo, useState } from 'react'
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  writeBatch,
} from 'firebase/firestore'
import { db } from '../firebase'
import { orderOrigen } from './OrdersTable'

const ORIGEN_LABELS = {
  salon: 'Salón',
  telefono: 'Teléfono',
  'cliente-web': 'Página web',
}

const PAYMENT_LABELS = {
  efectivo: 'Efectivo',
  sinpe: 'SINPE',
  tarjeta: 'Tarjeta',
  dividido: 'Dividido',
}

function formatColones(value) {
  return `₡${Number(value ?? 0).toLocaleString('es-CR')}`
}

function formatDateTime(ts) {
  if (!ts) return '—'
  const date = typeof ts === 'number' ? new Date(ts) : ts?.toDate?.()
  if (!date) return '—'
  return date.toLocaleString('es-CR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

// Suma cada pedido por método de pago. Si el pedido se cobró dividido entre
// varias personas (app de meseros), reparte el total entre los métodos reales
// usados en cada parte en vez de contarlo todo como "dividido".
function addToPaymentTotals(totals, order) {
  if (order.splitPayment && Array.isArray(order.payments)) {
    order.payments.forEach((p) => {
      totals[p.metodo] = (totals[p.metodo] || 0) + Number(p.monto || 0)
    })
    return
  }
  const metodo = order.paymentMethod || 'efectivo'
  totals[metodo] = (totals[metodo] || 0) + Number(order.total || 0)
}

async function commitInChunks(items, buildOp) {
  // Firestore permite máximo 500 escrituras por batch. Partimos en bloques de
  // 400 para dejar margen (el batch también incluye el documento del cierre).
  const CHUNK = 400
  for (let i = 0; i < items.length; i += CHUNK) {
    const batch = writeBatch(db)
    items.slice(i, i + CHUNK).forEach((item) => buildOp(batch, item))
    await batch.commit()
  }
}

export default function CashClosingPanel() {
  const [orders, setOrders] = useState([])
  const [cierres, setCierres] = useState([])
  const [loading, setLoading] = useState(true)
  const [closing, setClosing] = useState(false)
  const [error, setError] = useState(null)
  const [expandedCierre, setExpandedCierre] = useState(null)

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'orders'),
      (snap) => {
        setOrders(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
        setLoading(false)
      },
      (err) => {
        setError(err.message)
        setLoading(false)
      }
    )
    return () => unsub()
  }, [])

  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, 'cierresCaja'), orderBy('createdAt', 'desc')),
      (snap) => setCierres(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      () => {}
    )
    return () => unsub()
  }, [])

  const pendientes = useMemo(
    () => orders.filter((o) => !o.cierreId && o.status !== 'cancelled'),
    [orders]
  )

  const resumen = useMemo(() => {
    const porOrigen = {}
    const porPago = {}
    let totalGeneral = 0
    pendientes.forEach((order) => {
      const origen = orderOrigen(order)
      porOrigen[origen] = (porOrigen[origen] || 0) + Number(order.total || 0)
      addToPaymentTotals(porPago, order)
      totalGeneral += Number(order.total || 0)
    })
    return { porOrigen, porPago, totalGeneral, cantidad: pendientes.length }
  }, [pendientes])

  const handleCerrarCaja = async () => {
    if (pendientes.length === 0) return
    if (
      !window.confirm(
        `¿Cerrar caja con ${pendientes.length} pedido(s) por un total de ${formatColones(
          resumen.totalGeneral
        )}? Esto no se puede deshacer.`
      )
    )
      return

    setClosing(true)
    setError(null)
    try {
      const cierreRef = doc(collection(db, 'cierresCaja'))
      // Primer batch: crea el documento del cierre con el resumen.
      const firstBatch = writeBatch(db)
      firstBatch.set(cierreRef, {
        totalGeneral: resumen.totalGeneral,
        cantidadPedidos: resumen.cantidad,
        totalesPorOrigen: resumen.porOrigen,
        totalesPorMetodoPago: resumen.porPago,
        ordenesIds: pendientes.map((o) => o.id),
        createdAt: serverTimestamp(),
      })
      await firstBatch.commit()

      // Marca cada pedido incluido con el id del cierre, en bloques de 400.
      await commitInChunks(pendientes, (batch, order) => {
        batch.update(doc(db, 'orders', order.id), { cierreId: cierreRef.id })
      })
    } catch (err) {
      setError(err.message)
    } finally {
      setClosing(false)
    }
  }

  if (loading) return <div className="panel panel--empty">Cargando pedidos…</div>

  return (
    <div className="cash-closing">
      {error && <p className="form-error">{error}</p>}

      <section className="section-block">
        <h3 className="section-block__title">Pedidos pendientes de cerrar ({resumen.cantidad})</h3>

        {resumen.cantidad === 0 ? (
          <p className="panel-hint">No hay pedidos pendientes — la caja ya está al día.</p>
        ) : (
          <>
            <div className="cash-summary-grid">
              <div className="cash-summary-card">
                <span className="cash-summary-card__label">Total general</span>
                <span className="cash-summary-card__value">{formatColones(resumen.totalGeneral)}</span>
              </div>
              {Object.entries(resumen.porOrigen).map(([origen, monto]) => (
                <div className="cash-summary-card" key={origen}>
                  <span className="cash-summary-card__label">{ORIGEN_LABELS[origen] || origen}</span>
                  <span className="cash-summary-card__value">{formatColones(monto)}</span>
                </div>
              ))}
            </div>

            <div className="cash-summary-grid cash-summary-grid--payment">
              {Object.entries(resumen.porPago).map(([metodo, monto]) => (
                <div className="cash-summary-card cash-summary-card--muted" key={metodo}>
                  <span className="cash-summary-card__label">{PAYMENT_LABELS[metodo] || metodo}</span>
                  <span className="cash-summary-card__value">{formatColones(monto)}</span>
                </div>
              ))}
            </div>

            <table className="orders-table cash-closing-table">
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Canal</th>
                  <th>Pago</th>
                  <th>Hora</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {pendientes.map((order) => (
                  <tr key={order.id}>
                    <td data-label="Cliente">{order.clientName || order.mesa || '—'}</td>
                    <td data-label="Canal">{ORIGEN_LABELS[orderOrigen(order)] || '—'}</td>
                    <td data-label="Pago">
                      {order.splitPayment ? 'Dividido' : PAYMENT_LABELS[order.paymentMethod] || order.paymentMethod || '—'}
                    </td>
                    <td className="mono" data-label="Hora">{formatDateTime(order.createdAt)}</td>
                    <td className="mono" data-label="Total">{formatColones(order.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <button className="btn-primary" onClick={handleCerrarCaja} disabled={closing}>
              {closing ? 'Cerrando caja…' : `Cerrar caja (${formatColones(resumen.totalGeneral)})`}
            </button>
          </>
        )}
      </section>

      <section className="section-block">
        <h3 className="section-block__title">Historial de cierres ({cierres.length})</h3>
        {cierres.length === 0 ? (
          <p className="panel-hint">Todavía no se ha hecho ningún cierre de caja.</p>
        ) : (
          <ul className="cash-history">
            {cierres.map((c) => (
              <li key={c.id} className="cash-history__item">
                <button
                  type="button"
                  className="cash-history__row"
                  onClick={() => setExpandedCierre((cur) => (cur === c.id ? null : c.id))}
                >
                  <span>{formatDateTime(c.createdAt)}</span>
                  <span className="mono">{c.cantidadPedidos} pedido(s)</span>
                  <span className="mono">{formatColones(c.totalGeneral)}</span>
                  <span>{expandedCierre === c.id ? '▲' : '▼'}</span>
                </button>
                {expandedCierre === c.id && (
                  <div className="cash-history__detail">
                    <div className="cash-summary-grid">
                      {Object.entries(c.totalesPorOrigen || {}).map(([origen, monto]) => (
                        <div className="cash-summary-card cash-summary-card--muted" key={origen}>
                          <span className="cash-summary-card__label">{ORIGEN_LABELS[origen] || origen}</span>
                          <span className="cash-summary-card__value">{formatColones(monto)}</span>
                        </div>
                      ))}
                    </div>
                    <div className="cash-summary-grid cash-summary-grid--payment">
                      {Object.entries(c.totalesPorMetodoPago || {}).map(([metodo, monto]) => (
                        <div className="cash-summary-card cash-summary-card--muted" key={metodo}>
                          <span className="cash-summary-card__label">{PAYMENT_LABELS[metodo] || metodo}</span>
                          <span className="cash-summary-card__value">{formatColones(monto)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
