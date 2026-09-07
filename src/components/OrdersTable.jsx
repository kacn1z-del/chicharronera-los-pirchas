import { useEffect, useState } from 'react'
import { collection, deleteDoc, doc, onSnapshot, orderBy, query, runTransaction, updateDoc, writeBatch } from 'firebase/firestore'
import { db, writeAndContinue } from '../firebase'

const STATUS_LABELS = {
  pending: { label: 'Pendiente', tone: 'amber' },
  preparing: { label: 'Preparando', tone: 'blue' },
  on_the_way: { label: 'En camino', tone: 'green' },
  delivered: { label: 'Entregado', tone: 'gray' },
  cancelled: { label: 'Cancelado', tone: 'red' },
}

const FACTURA_LABELS = {
  aceptado: { label: 'Facturado', tone: 'green' },
  rechazado: { label: 'Rechazado', tone: 'red' },
}

const ORIGEN_LABELS = {
  salon: { label: 'Salón', tone: 'green' },
  telefono: { label: 'Teléfono', tone: 'blue' },
  'cliente-web': { label: 'Página web', tone: 'amber' },
}

// Umbral por defecto para avisar stock bajo cuando el producto de inventario
// no tiene un "minimo" propio configurado.
const UMBRAL_DEFECTO = 5

export function orderOrigen(order) {
  if (order.origen) return order.origen
  // Pedidos creados antes de que existiera el campo "origen": lo inferimos.
  if (order.mesa) return 'salon'
  if (order.clientAddress) return 'cliente-web'
  return 'telefono'
}

function origenInfo(order) {
  return ORIGEN_LABELS[orderOrigen(order)] ?? { label: 'Desconocido', tone: 'gray' }
}

function statusInfo(status) {
  return STATUS_LABELS[status] ?? { label: status || 'Sin estado', tone: 'gray' }
}

function formatTime(createdAt) {
  if (!createdAt) return '—'
  const date = typeof createdAt === 'number' ? new Date(createdAt) : createdAt?.toDate?.()
  if (!date) return '—'
  return date.toLocaleTimeString('es-CR', { hour: '2-digit', minute: '2-digit' })
}

function whatsappLink(order) {
  const phone = (order.clientPhone || '').replace(/[^\d]/g, '')
  const message = encodeURIComponent(
    `Hola ${order.clientName || ''}, tu pedido #${order.id.slice(0, 6)} en la chicharronera Los Pirchas está: ${
      statusInfo(order.status).label
    }.`
  )
  if (!phone) return null
  return `https://wa.me/${phone}?text=${message}`
}

function itemsSummary(order) {
  if (!Array.isArray(order.items) || order.items.length === 0) return '—'
  return order.items.map((i) => `${i.qty}× ${i.nombre}${i.nota ? ` (${i.nota})` : ''}`).join(', ')
}

function serviceLabel(order) {
  if (order.tipo === 'salon') return 'En mesa'
  if (order.tipo === 'llevar') return 'Para llevar'
  if (order.tipo === 'express') return 'Express'
  return null
}

function formatColones(value) {
  return `₡${Number(value ?? 0).toLocaleString('es-CR')}`
}

function formatNumeroPedido(numero) {
  return `Pirchas #${String(numero).padStart(6, '0')}`
}

// Le asigna a un pedido un número consecutivo (1, 2, 3…) la primera vez que
// se imprime, guardado en el propio pedido para que reimprimir el mismo
// recibo no cambie el número. El correlativo vive en un documento contador
// aparte para que dos personas imprimiendo pedidos distintos a la vez no
// terminen con el mismo número.
async function asegurarNumeroPedido(order) {
  if (order.numeroPedido) return order.numeroPedido

  const contadorRef = doc(db, 'contadores', 'pedidos')
  const orderRef = doc(db, 'orders', order.id)

  const numero = await runTransaction(db, async (tx) => {
    const snap = await tx.get(contadorRef)
    const ultimo = snap.exists() ? Number(snap.data().ultimo || 0) : 0
    const siguiente = ultimo + 1
    tx.set(contadorRef, { ultimo: siguiente }, { merge: true })
    tx.update(orderRef, { numeroPedido: siguiente })
    return siguiente
  })

  return numero
}

async function printReceipt(order) {
  // Ojo: hay que abrir la ventana ANTES de cualquier "await" — si se abre
  // después de esperar datos (como el número de pedido), el navegador del
  // celular ya no lo reconoce como una acción directa del usuario y bloquea
  // el popup en silencio, sin ningún error visible ("no pasa nada").
  const printWindow = window.open('', '_blank')
  if (printWindow) {
    printWindow.document.write('<p style="font-family:sans-serif;padding:20px;">Preparando recibo…</p>')
  }

  try {
    const numeroPedido = await Promise.race([
      asegurarNumeroPedido(order),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Tardó demasiado (10s) — revisá tu conexión o los permisos de Firestore.')), 10000)),
    ])
    const itemsHtml = (order.items || [])
      .map(
        (item) =>
          `<div class="row"><span>${item.qty} × ${item.nombre}</span><span>${formatColones(
            item.precio * item.qty
          )}</span></div>`
      )
      .join('')

    // Si ya está facturado ante Hacienda, el recibo incluye los datos del
    // comprobante electrónico (clave, consecutivo, resolución) — igual que
    // trae cualquier factura o tiquete electrónico oficial.
    const facturado = order.facturaEstado === 'aceptado' && order.facturaClave
    const facturaHtml = facturado
      ? `
  <div class="factura">
    <p class="meta center"><strong>${order.facturaTipo === 'factura' ? 'Factura' : 'Tiquete'} electrónico</strong></p>
    <p class="meta center">Consecutivo: ${order.facturaConsecutivo || '—'}</p>
    <p class="clave">Clave: ${order.facturaClave}</p>
    <p class="meta center">Autorizada mediante resolución N.° MH-DGT-RES-0027-2024</p>
  </div>`
      : ''

    const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="UTF-8" />
<title>Recibo — Los Pirchas</title>
<style>
  @page { size: 58mm auto; margin: 0; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, Arial, sans-serif; color: #000; padding: 3mm 2mm; width: 54mm; margin: 0 auto; }
  .center { text-align: center; }
  h1 { font-size: 13px; margin: 2px 0; }
  .sub { font-size: 9px; margin-bottom: 8px; }
  .meta { font-size: 9px; margin: 2px 0; }
  .items { margin: 8px 0; padding: 6px 0; border-top: 1px dashed #000; border-bottom: 1px dashed #000; }
  .row { display: flex; justify-content: space-between; font-size: 10px; margin-bottom: 3px; gap: 4px; }
  .total { display: flex; justify-content: space-between; font-weight: 700; font-size: 12px; margin-bottom: 3px; }
  .payment { font-size: 9px; text-align: center; margin-top: 3px; }
  .factura { margin-top: 8px; padding-top: 6px; border-top: 1px dashed #000; }
  .clave { font-size: 7px; text-align: center; word-break: break-all; margin: 2px 0; }
</style>
</head>
<body>
  <div class="center">
    <h1>Los Pirchas</h1>
    <p class="sub">Restaurante y Chicharronera</p>
  </div>
  <p class="meta center">${formatNumeroPedido(numeroPedido)} · ${formatTime(order.createdAt)}</p>
  <p class="meta center">${order.clientName || order.mesa || ''}${order.clientPhone ? ' · ' + order.clientPhone : ''}</p>
  ${order.clientAddress ? `<p class="meta center">${order.clientAddress}</p>` : ''}
  <div class="items">${itemsHtml}</div>
  <div class="total"><span>Total</span><span>${formatColones(order.total)}</span></div>
  <p class="payment">Pago: ${order.paymentMethod || '—'}</p>
  ${facturaHtml}
  <script>window.onload = () => { window.print(); };<\/script>
</body>
</html>`

    if (!printWindow) return
    // En vez de document.write (que en Safari de iPhone a veces se pierde
    // si pasó tiempo/async antes), se navega la ventana a una URL de datos
    // con el HTML completo — más confiable en iOS.
    printWindow.location.replace('data:text/html;charset=utf-8,' + encodeURIComponent(html))
  } catch (err) {
    console.error('Error preparando el recibo:', err)
    if (printWindow) {
      printWindow.location.replace(
        'data:text/html;charset=utf-8,' +
          encodeURIComponent(
            `<p style="font-family:sans-serif;padding:20px;color:#b00;">No se pudo preparar el recibo:<br>${err.message}</p>`
          )
      )
    }
  }
}

export default function OrdersTable({ onConnectionChange, isAdmin }) {
  const [orders, setOrders] = useState([])
  const [menuItems, setMenuItems] = useState([])
  const [inventoryItems, setInventoryItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [busyId, setBusyId] = useState(null)
  const [facturandoId, setFacturandoId] = useState(null)

  useEffect(() => {
    const q = query(collection(db, 'orders'), orderBy('createdAt', 'desc'))
    const unsub = onSnapshot(
      q,
      (snapshot) => {
        setOrders(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })))
        setLoading(false)
        onConnectionChange?.(true)
      },
      (err) => {
        console.error(err)
        setError(err.message)
        setLoading(false)
        onConnectionChange?.(false)
      }
    )
    return () => unsub()
  }, [onConnectionChange])

  // Se usan para saber qué descontar del inventario cuando se entrega un pedido.
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'Menu'), (snap) => {
      setMenuItems(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    })
    return () => unsub()
  }, [])

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'inventario'), (snap) => {
      setInventoryItems(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    })
    return () => unsub()
  }, [])

  // Recorre los platos del pedido, busca su receta en el menú y arma un solo
  // batch que descuenta del inventario lo que corresponda. Devuelve la lista
  // de productos que quedaron en 5 unidades o menos (o por debajo de su
  // "minimo" propio) para avisarle al usuario al momento.
  const descontarInventario = async (order) => {
    if (!Array.isArray(order.items) || order.items.length === 0) return []

    const totalesPorProducto = new Map() // inventarioId -> cantidad a restar
    order.items.forEach((item) => {
      const plato = menuItems.find((m) => m.nombre === item.nombre)
      const receta = plato?.receta
      if (!Array.isArray(receta) || receta.length === 0) return
      receta.forEach((ing) => {
        if (!ing.inventarioId || !Number(ing.cantidad)) return
        const usado = Number(ing.cantidad) * Number(item.qty || 1)
        totalesPorProducto.set(ing.inventarioId, (totalesPorProducto.get(ing.inventarioId) || 0) + usado)
      })
    })

    if (totalesPorProducto.size === 0) return []

    const batch = writeBatch(db)
    const avisos = []
    totalesPorProducto.forEach((cantidadUsada, inventarioId) => {
      const invItem = inventoryItems.find((i) => i.id === inventarioId)
      if (!invItem) return
      const nuevaCantidad = Math.max(0, Number(invItem.cantidad || 0) - cantidadUsada)
      batch.update(doc(db, 'inventario', inventarioId), { cantidad: nuevaCantidad })
      const umbral = invItem.minimo != null ? Number(invItem.minimo) : UMBRAL_DEFECTO
      if (nuevaCantidad <= umbral) {
        avisos.push(`${invItem.nombre}: quedan ${nuevaCantidad} ${invItem.unidad || 'unidades'}`)
      }
    })
    await batch.commit()
    return avisos
  }

  const setStatus = async (orderId, newStatus) => {
    setBusyId(orderId)
    try {
      const order = orders.find((o) => o.id === orderId)
      // Solo se descuenta inventario la primera vez que un pedido pasa a
      // "Entregado" — así evitamos restar dos veces si se toca el botón otra vez.
      const debeDescontar = newStatus === 'delivered' && order?.status !== 'delivered' && !order?.stockDescontado
      let avisos = []
      if (debeDescontar) {
        avisos = await descontarInventario(order)
      }
      await writeAndContinue(
        updateDoc(doc(db, 'orders', orderId), {
          status: newStatus,
          ...(debeDescontar ? { stockDescontado: true } : {}),
        })
      )
      if (avisos.length > 0) {
        alert('⚠️ Pocas existencias tras este pedido:\n' + avisos.join('\n'))
      }
    } catch (err) {
      console.error(err)
      alert('No se pudo actualizar el pedido: ' + err.message)
    } finally {
      setBusyId(null)
    }
  }

  const removeOrder = async (order) => {
    const label = order.clientName || order.mesa || order.id.slice(0, 6)
    if (!window.confirm(`¿Eliminar el pedido de "${label}"? Esto no se puede deshacer.`)) return
    setBusyId(order.id)
    try {
      await writeAndContinue(deleteDoc(doc(db, 'orders', order.id)))
    } catch (err) {
      console.error(err)
      alert('No se pudo eliminar el pedido: ' + err.message)
    } finally {
      setBusyId(null)
    }
  }

  // Los usuarios invitados no pueden borrar pedidos — en cambio, dejan una
  // nota explicando por qué se debería eliminar, para que un admin lo revise
  // y lo elimine de verdad si corresponde.
  const requestDeletion = async (order) => {
    const nota = window.prompt('¿Por qué se debería eliminar este pedido? (esto le llega al administrador)')
    if (nota === null || !nota.trim()) return
    setBusyId(order.id)
    try {
      await writeAndContinue(
        updateDoc(doc(db, 'orders', order.id), {
          solicitudEliminacion: { nota: nota.trim(), fecha: new Date().toISOString() },
        })
      )
    } catch (err) {
      console.error(err)
      alert('No se pudo guardar la nota: ' + err.message)
    } finally {
      setBusyId(null)
    }
  }

  const facturarOrder = async (order) => {
    if (order.facturaEstado === 'aceptado') return
    if (!window.confirm(`¿Emitir comprobante electrónico para este pedido?`)) return

    // Si el pedido todavía no tiene correo/cédula del cliente, se pregunta
    // acá antes de facturar — los dos son opcionales. Con cédula se emite
    // Factura Electrónica completa; sin ella, Tiquete Electrónico (el caso
    // normal de un cliente que solo pide en la mesa). Con correo, el
    // comprobante se le manda por email apenas Hacienda lo acepte.
    let datosCliente = {}
    if (!order.clientEmail && !order.clientCedula) {
      const correo = window.prompt(
        'Correo del cliente (opcional, para mandarle la factura por email — dejá vacío si no aplica):',
        ''
      )
      if (correo === null) return // canceló el prompt, no sigue
      const cedula = window.prompt(
        'Cédula del cliente (opcional — solo si necesita Factura completa, no Tiquete):',
        ''
      )
      if (cedula === null) return
      datosCliente = {
        ...(correo.trim() ? { clientEmail: correo.trim() } : {}),
        ...(cedula.trim() ? { clientCedula: cedula.trim() } : {}),
      }
    }

    setFacturandoId(order.id)
    try {
      if (Object.keys(datosCliente).length > 0) {
        await writeAndContinue(updateDoc(doc(db, 'orders', order.id), datosCliente))
      }
      const res = await fetch('/api/facturar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: order.id }),
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error + (data.motivo ? `: ${data.motivo}` : ''))
      }
      alert(
        `Comprobante aceptado por Hacienda.\nClave: ${data.clave}` +
          (datosCliente.clientEmail ? data.correoEnviado ? '\nSe envió por correo.' : '\nNo se pudo enviar el correo.' : '')
      )
    } catch (err) {
      console.error(err)
      alert('No se pudo facturar el pedido: ' + err.message)
    } finally {
      setFacturandoId(null)
    }
  }

  if (loading) {
    return <div className="panel panel--empty">Cargando pedidos…</div>
  }

  if (error) {
    return (
      <div className="panel panel--empty">
        <p>No se pudo leer la colección "orders".</p>
        <p className="panel__hint mono">{error}</p>
      </div>
    )
  }

  if (orders.length === 0) {
    return (
      <div className="panel panel--empty">
        <p>Todavía no hay pedidos en Firestore.</p>
        <p className="panel__hint">
          En cuanto se cree un documento en la colección <span className="mono">orders</span>, va a aparecer
          aquí automáticamente.
        </p>
      </div>
    )
  }

  return (
    <div className="panel">
      <table className="orders-table">
        <colgroup>
          <col className="col-cliente" />
          <col className="col-mesa" />
          <col className="col-restaurante" />
          <col className="col-pedido" />
          <col className="col-estado" />
          <col className="col-canal" />
          <col className="col-hora" />
          <col className="col-contacto" />
          <col className="col-acciones" />
        </colgroup>
        <thead>
          <tr>
            <th>Cliente</th>
            <th>Mesa</th>
            <th>Restaurante</th>
            <th>Pedido</th>
            <th>Estado</th>
            <th>Canal</th>
            <th>Hora</th>
            <th>Contacto</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((order) => {
            const status = statusInfo(order.status)
            const origen = origenInfo(order)
            const link = whatsappLink(order)
            const factura = order.facturaEstado ? FACTURA_LABELS[order.facturaEstado] : null
            return (
              <tr key={order.id}>
                <td data-label="Cliente">
                  {order.clientName || order.clientId || '—'}
                  {order.numeroPedido && (
                    <div className="order-sub mono">{formatNumeroPedido(order.numeroPedido)}</div>
                  )}
                  {order.mesero && <div className="order-sub mono">Mesero: {order.mesero}</div>}
                </td>
                <td data-label="Mesa">{order.mesa ? order.mesa : '—'}</td>
                <td data-label="Restaurante">{order.restaurantName || order.restaurantId || '—'}</td>
                <td className="order-items" data-label="Pedido">{itemsSummary(order)}</td>
                <td data-label="Estado">
                  <span className={`badge badge--${status.tone}`}>{status.label}</span>
                  {factura && (
                    <div className="order-sub">
                      <span className={`badge badge--${factura.tone}`}>{factura.label}</span>
                    </div>
                  )}
                  {order.cierreId && (
                    <div className="order-sub">
                      <span className="badge badge--gray">En caja cerrada</span>
                    </div>
                  )}
                  {order.solicitudEliminacion && (
                    <div className="order-sub" title={order.solicitudEliminacion.nota}>
                      <span className="badge badge--red">Piden eliminar</span>
                    </div>
                  )}
                </td>
                <td data-label="Canal">
                  <span className={`badge badge--${origen.tone}`}>{origen.label}</span>
                </td>
                <td className="mono" data-label="Hora">{formatTime(order.createdAt)}</td>
                <td data-label="Contacto">
                  {order.mesa ? (
                    <span className="badge badge--gray">{serviceLabel(order)}</span>
                  ) : link ? (
                    <a className="wa-button" href={link} target="_blank" rel="noreferrer">
                      Notificar
                    </a>
                  ) : (
                    <span className="wa-button wa-button--disabled">Sin teléfono</span>
                  )}
                </td>
                <td data-label="Acciones">
                  <div className="order-actions">
                    {order.status !== 'preparing' && (
                      <button
                        type="button"
                        className="action-btn action-btn--blue"
                        disabled={busyId === order.id}
                        onClick={() => setStatus(order.id, 'preparing')}
                      >
                        Preparando
                      </button>
                    )}
                    {order.status !== 'delivered' && (
                      <button
                        type="button"
                        className="action-btn action-btn--green"
                        disabled={busyId === order.id}
                        onClick={() => setStatus(order.id, 'delivered')}
                      >
                        Entregado
                      </button>
                    )}
                    {order.status !== 'cancelled' && (
                      <button
                        type="button"
                        className="action-btn action-btn--amber"
                        disabled={busyId === order.id}
                        onClick={() => setStatus(order.id, 'cancelled')}
                      >
                        Cancelar
                      </button>
                    )}
                    <button
                      type="button"
                      className="action-btn action-btn--purple"
                      disabled={facturandoId === order.id || order.facturaEstado === 'aceptado'}
                      onClick={() => facturarOrder(order)}
                    >
                      {facturandoId === order.id
                        ? 'Facturando…'
                        : order.facturaEstado === 'aceptado'
                        ? 'Facturado ✔️'
                        : 'Facturar'}
                    </button>
                    <button
                      type="button"
                      className="action-btn action-btn--blue"
                      onClick={() => printReceipt(order)}
                    >
                      🖨️ Imprimir
                    </button>
                    {isAdmin ? (
                      <button
                        type="button"
                        className="action-btn action-btn--red"
                        disabled={busyId === order.id}
                        onClick={() => removeOrder(order)}
                      >
                        Eliminar
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="action-btn action-btn--red"
                        disabled={busyId === order.id || !!order.solicitudEliminacion}
                        onClick={() => requestDeletion(order)}
                      >
                        {order.solicitudEliminacion ? 'Ya avisaste' : 'Anular con nota'}
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
