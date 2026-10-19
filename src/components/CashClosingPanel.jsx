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
  mixto: 'Mixto',
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

// Número corto del pedido (no hay número consecutivo guardado, así que se usan
// los últimos 6 caracteres del ID del documento).
function shortPedidoId(id) {
  return id ? `#${String(id).slice(-6).toUpperCase()}` : '—'
}

// Suma cada pedido por método de pago. Si el pedido se cobró dividido entre
// varias personas (app de meseros), reparte el total entre los métodos reales
// usados en cada parte en vez de contarlo todo como "dividido". Si se cobró
// con pago mixto (una sola cuenta repartida entre efectivo/tarjeta/SINPE),
// reparte igual entre esos tres en vez de contarlo todo como "mixto".
function addToPaymentTotals(totals, order) {
  if (order.splitPayment && Array.isArray(order.payments)) {
    order.payments.forEach((p) => {
      totals[p.metodo] = (totals[p.metodo] || 0) + Number(p.monto || 0)
    })
    return
  }
  if (order.mixedPayment && order.montos) {
    Object.entries(order.montos).forEach(([metodo, monto]) => {
      if (Number(monto) > 0) totals[metodo] = (totals[metodo] || 0) + Number(monto)
    })
    return
  }
  const metodo = order.paymentMethod || 'efectivo'
  totals[metodo] = (totals[metodo] || 0) + Number(order.total || 0)
}

// Extrae detalles de pagos divididos para guardarlos en el cierre
function extractSplitPaymentDetails(order) {
  if (!order.splitPayment || !Array.isArray(order.payments)) return null
  return {
    orderId: order.id,
    mesa: order.mesa || null,
    clientName: order.clientName || null,
    total: order.total,
    payments: order.payments.map((p) => ({
      persona: p.persona,
      metodo: p.metodo,
      monto: p.monto,
    })),
  }
}

// Arma el detalle completo de un pedido (mesa, número, pagos, productos).
// Se guarda dentro del cierre y también se usa para mostrar el desglose.
function buildPedidoDetalle(order) {
  const items = Array.isArray(order.items)
    ? order.items.map((it) => ({
        nombre: it.nombre || it.name || 'Producto',
        qty: Number(it.qty ?? it.quantity ?? 1) || 1,
        precio: Number(it.precio ?? it.price ?? 0) || 0,
      }))
    : []

  let payments = null
  if (order.splitPayment && Array.isArray(order.payments)) {
    payments = order.payments.map((p) => ({
      persona: p.persona || '—',
      metodo: p.metodo || 'efectivo',
      monto: Number(p.monto || 0),
    }))
  } else if (order.mixedPayment && order.montos) {
    payments = Object.entries(order.montos)
      .filter(([, monto]) => Number(monto) > 0)
      .map(([metodo, monto]) => ({ persona: 'Pago mixto', metodo, monto: Number(monto) }))
  }

  let metodo = order.paymentMethod || 'efectivo'
  if (order.splitPayment) metodo = 'dividido'
  else if (order.mixedPayment) metodo = 'mixto'

  return {
    orderId: order.id,
    pedido: shortPedidoId(order.id),
    mesa: order.mesa || null,
    clientName: order.clientName || null,
    canal: orderOrigen(order),
    total: Number(order.total || 0),
    metodo,
    createdAt: order.createdAt?.toMillis?.() ?? null,
    payments,
    items,
  }
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

// Lista desplegable por pedido, con el mismo estilo que "Pagos Divididos".
function PedidosDesglose({ pedidos, scopeKey, expanded, onToggle }) {
  if (!pedidos || pedidos.length === 0) return null

  return (
    <div className="split-payments-section">
      <h4 className="split-payments-title">🧾 Desglose por pedido ({pedidos.length})</h4>
      <div className="split-payments-list">
        {pedidos.map((p) => {
          const key = `${scopeKey}-${p.orderId}`
          const open = expanded === key
          return (
            <div key={key} className="split-payment-item">
              <button type="button" className="split-payment-header" onClick={() => onToggle(key)}>
                <span>
                  {p.mesa ? `Mesa ${p.mesa}` : p.clientName || 'Sin mesa'}
                  {' · '}
                  {p.pedido}
                  {' · '}
                  {PAYMENT_LABELS[p.metodo] || p.metodo}
                  {' · '}
                  {formatColones(p.total)}
                </span>
                <span>{open ? '▲' : '▼'}</span>
              </button>
              {open && (
                <div className="split-payment-details">
                  <div className="split-payment-detail-row">
                    <span className="split-payment-persona">Canal</span>
                    <span className="split-payment-method">{ORIGEN_LABELS[p.canal] || p.canal || '—'}</span>
                    <span className="split-payment-monto">{formatDateTime(p.createdAt)}</span>
                  </div>

                  {Array.isArray(p.payments) && p.payments.length > 0 && (
                    <>
                      {p.payments.map((pay, pIdx) => (
                        <div key={pIdx} className="split-payment-detail-row">
                          <span className="split-payment-persona">{pay.persona}</span>
                          <span className="split-payment-method">{PAYMENT_LABELS[pay.metodo] || pay.metodo}</span>
                          <span className="split-payment-monto">{formatColones(pay.monto)}</span>
                        </div>
                      ))}
                    </>
                  )}

                  {Array.isArray(p.items) && p.items.length > 0 && (
                    <>
                      {p.items.map((it, iIdx) => (
                        <div key={iIdx} className="split-payment-detail-row">
                          <span className="split-payment-persona">
                            {it.qty} × {it.nombre}
                          </span>
                          <span className="split-payment-method">{formatColones(it.precio)}</span>
                          <span className="split-payment-monto">{formatColones(it.precio * it.qty)}</span>
                        </div>
                      ))}
                    </>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function CashClosingPanel() {
  const [orders, setOrders] = useState([])
  const [cierres, setCierres] = useState([])
  const [loading, setLoading] = useState(true)
  const [closing, setClosing] = useState(false)
  const [error, setError] = useState(null)
  const [expandedCierre, setExpandedCierre] = useState(null)
  const [expandedSplitPayment, setExpandedSplitPayment] = useState(null)
  const [expandedPedido, setExpandedPedido] = useState(null)

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

  const pedidosPendientes = useMemo(() => pendientes.map(buildPedidoDetalle), [pendientes])

  const resumen = useMemo(() => {
    const porOrigen = {}
    const porPago = {}
    let totalGeneral = 0
    const splitPaymentDetails = []

    pendientes.forEach((order) => {
      const origen = orderOrigen(order)
      porOrigen[origen] = (porOrigen[origen] || 0) + Number(order.total || 0)
      addToPaymentTotals(porPago, order)
      totalGeneral += Number(order.total || 0)

      // Extraer detalles de pagos divididos
      const splitDetail = extractSplitPaymentDetails(order)
      if (splitDetail) {
        splitPaymentDetails.push(splitDetail)
      }
    })
    return { porOrigen, porPago, totalGeneral, cantidad: pendientes.length, splitPaymentDetails }
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
        splitPaymentDetails: resumen.splitPaymentDetails,
        pedidosDetalle: pedidosPendientes,
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
                  <th>Mesa</th>
                  <th>Pedido</th>
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
                    <td data-label="Mesa">{order.mesa || '—'}</td>
                    <td className="mono" data-label="Pedido">{shortPedidoId(order.id)}</td>
                    <td data-label="Cliente">{order.clientName || '—'}</td>
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

            <PedidosDesglose
              pedidos={pedidosPendientes}
              scopeKey="pendiente"
              expanded={expandedPedido}
              onToggle={(key) => setExpandedPedido((cur) => (cur === key ? null : key))}
            />

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

                    {/* Desglose por pedido: mesa, número de pedido, pagos y productos */}
                    {Array.isArray(c.pedidosDetalle) && c.pedidosDetalle.length > 0 ? (
                      <PedidosDesglose
                        pedidos={c.pedidosDetalle}
                        scopeKey={c.id}
                        expanded={expandedPedido}
                        onToggle={(key) => setExpandedPedido((cur) => (cur === key ? null : key))}
                      />
                    ) : (
                      <p className="panel-hint">
                        Este cierre se hizo antes de guardar el detalle por pedido.
                      </p>
                    )}

                    {/* Detalles de pagos divididos */}
                    {Array.isArray(c.splitPaymentDetails) && c.splitPaymentDetails.length > 0 && (
                      <div className="split-payments-section">
                        <h4 className="split-payments-title">📋 Pagos Divididos ({c.splitPaymentDetails.length})</h4>
                        <div className="split-payments-list">
                          {c.splitPaymentDetails.map((detail, idx) => (
                            <div key={idx} className="split-payment-item">
                              <button
                                type="button"
                                className="split-payment-header"
                                onClick={() => setExpandedSplitPayment((cur) => (cur === `${c.id}-${idx}` ? null : `${c.id}-${idx}`))}
                              >
                                <span>
                                  {detail.mesa ? `Mesa ${detail.mesa}` : detail.clientName || 'Pedido'}
                                  {' · '}
                                  {shortPedidoId(detail.orderId)}
                                  {' · '}
                                  {formatColones(detail.total)}
                                </span>
                                <span>{expandedSplitPayment === `${c.id}-${idx}` ? '▲' : '▼'}</span>
                              </button>
                              {expandedSplitPayment === `${c.id}-${idx}` && (
                                <ul className="split-payment-details">
                                  {detail.payments.map((p, pIdx) => (
                                    <li key={pIdx} className="split-payment-detail-row">
                                      <span className="split-payment-persona">{p.persona}</span>
                                      <span className="split-payment-method">{PAYMENT_LABELS[p.metodo] || p.metodo}</span>
                                      <span className="split-payment-monto">{formatColones(p.monto)}</span>
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
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
