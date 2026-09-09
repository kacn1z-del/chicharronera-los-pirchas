import { useEffect, useState } from 'react'
import { collection, deleteDoc, doc, getDoc, onSnapshot, orderBy, query, runTransaction, updateDoc, writeBatch } from 'firebase/firestore'
import { db, auth, writeAndContinue } from '../firebase'

const STATUS_LABELS = {
  pending: { label: 'Pendiente', tone: 'amber' },
  preparing: { label: 'Preparando', tone: 'blue' },
  listo: { label: 'Listo en cocina', tone: 'green' },
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

// Normaliza un teléfono de Costa Rica al formato que necesita wa.me:
// código de país (506) + los 8 dígitos, sin espacios ni guiones. Sin el
// código de país, WhatsApp intenta adivinar el país del número y a veces
// arma un número inválido/recortado (el bug que reportó el cliente).
function normalizeCrPhone(raw) {
  let phone = (raw || '').replace(/[^\d]/g, '')
  if (!phone) return null
  // Ya viene con código de país (506 + 8 dígitos = 11 en total).
  if (phone.length === 11 && phone.startsWith('506')) return phone
  // Caso normal: 8 dígitos locales -> le anteponemos 506.
  if (phone.length === 8) return `506${phone}`
  // Algunos capturan con un 0 pegado adelante por error (08888-1234).
  if (phone.length === 9 && phone.startsWith('0')) return `506${phone.slice(1)}`
  // Cualquier otro largo es un número mal cargado — mejor no armar un
  // link roto que abra el chat de otra persona; se oculta el botón.
  return null
}

function whatsappLink(order) {
  const phone = normalizeCrPhone(order.clientPhone)
  if (!phone) return null
  const message = encodeURIComponent(
    `Hola ${order.clientName || ''}, tu pedido #${order.id.slice(0, 6)} en la chicharronera Los Pirchas está: ${
      statusInfo(order.status).label
    }.`
  )
  return `https://wa.me/${phone}?text=${message}`
}

// Enlace de WhatsApp para mandarle al cliente los datos del comprobante ya
// aceptado (clave, consecutivo, total) — se usa una vez facturado, junto al
// correo automático.
function whatsappFacturaLink(order) {
  const phone = normalizeCrPhone(order.clientPhone)
  if (!phone || !order.facturaClave) return null
  const tipoTexto = order.facturaTipo === 'factura' ? 'Factura electrónica' : 'Tiquete electrónico'
  const message = encodeURIComponent(
    `Hola ${order.clientName || ''}, aquí tenés el comprobante de tu pedido en Los Pirchas.\n\n` +
      `${tipoTexto}\n` +
      `Consecutivo: ${order.facturaConsecutivo}\n` +
      `Clave: ${order.facturaClave}\n` +
      `Total: ${formatColones(order.total)}`
  )
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
  .logo { width: 100%; display: block; margin: 0 auto 4px; }
  .sub { font-size: 9px; margin-bottom: 8px; }
  .meta { font-size: 9px; margin: 2px 0; }
  .items { margin: 8px 0; padding: 6px 0; border-top: 1px dashed #000; border-bottom: 1px dashed #000; }
  .row { display: flex; justify-content: space-between; font-size: 10px; margin-bottom: 3px; gap: 4px; }
  .total { display: flex; justify-content: space-between; font-weight: 700; font-size: 12px; margin-bottom: 3px; }
  .payment { font-size: 9px; text-align: center; margin-top: 3px; }
  .factura { margin-top: 8px; padding-top: 6px; border-top: 1px dashed #000; }
  .clave { font-size: 7px; text-align: center; word-break: break-all; margin: 2px 0; }
  .gracias { display: flex; align-items: center; justify-content: center; gap: 6px; margin: 10px 0 6px; }
  .gracias img { width: 15mm; height: auto; }
  .gracias span { font-size: 10px; font-style: italic; }
  .iconrow { width: 100%; display: block; margin-top: 6px; }
</style>
</head>
<body>
  <div class="center">
    <img class="logo" src="/receipt/ticket-logo.jpg" alt="Los Pirchas" />
    <p class="sub">Restaurante y Chicharronera</p>
  </div>
  <p class="meta center">${formatNumeroPedido(numeroPedido)} · ${formatTime(order.createdAt)}</p>
  <p class="meta center">${order.clientName || order.mesa || ''}${order.clientPhone ? ' · ' + order.clientPhone : ''}</p>
  ${order.clientAddress ? `<p class="meta center">${order.clientAddress}</p>` : ''}
  <div class="items">${itemsHtml}</div>
  <div class="total"><span>Total</span><span>${formatColones(order.total)}</span></div>
  <p class="payment">Pago: ${order.paymentMethod || '—'}</p>
  ${facturaHtml}
  <div class="gracias">
    <img src="/receipt/ticket-burger.jpg" alt="" />
    <span>¡Gracias por su preferencia!</span>
    <img src="/receipt/ticket-fries.jpg" alt="" />
  </div>
  <img class="iconrow" src="/receipt/ticket-iconrow.png" alt="" />
</body>
</html>`

    // En vez de abrir una ventana nueva (bloqueada o restringida de formas
    // impredecibles por Safari/Chrome en el celular), se imprime desde un
    // iframe invisible dentro de la misma página — no depende de popups.
    const iframeAnterior = document.getElementById('recibo-print-frame')
    if (iframeAnterior) iframeAnterior.remove()

    const iframe = document.createElement('iframe')
    iframe.id = 'recibo-print-frame'
    iframe.style.position = 'fixed'
    iframe.style.right = '0'
    iframe.style.bottom = '0'
    iframe.style.width = '0'
    iframe.style.height = '0'
    iframe.style.border = '0'
    iframe.onload = () => {
      try {
        iframe.contentWindow.focus()
        iframe.contentWindow.print()
      } catch (printErr) {
        console.error('Error al imprimir:', printErr)
        alert('No se pudo abrir el diálogo de impresión: ' + printErr.message)
      }
    }
    document.body.appendChild(iframe)
    iframe.srcdoc = html
  } catch (err) {
    console.error('Error preparando el recibo:', err)
    alert('No se pudo preparar el recibo: ' + err.message)
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
  const [reenviandoId, setReenviandoId] = useState(null)
  const [facturaModalOrder, setFacturaModalOrder] = useState(null)
  const [cobroOrder, setCobroOrder] = useState(null)

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

  const facturarOrder = (order) => {
    if (order.facturaEstado === 'aceptado') return
    setFacturaModalOrder(order)
  }

  // Cobrar/cerrar un pedido con método de pago (y, si corresponde, dividido
  // entre varias personas) — mismo resultado final que "Entregado" (status
  // delivered + descuento de inventario), pero guardando además cómo se
  // pagó. "datosPago" viene armado por CobroModal, ya sea:
  //   { paymentMethod: 'efectivo' | 'sinpe' | 'tarjeta' }   — cobro simple
  //   { paymentMethod: 'dividido', splitPayment: true, payments: [...] }  — dividido
  const confirmarCobro = async (order, datosPago) => {
    setCobroOrder(null)
    setBusyId(order.id)
    try {
      const debeDescontar = order.status !== 'delivered' && !order.stockDescontado
      let avisos = []
      if (debeDescontar) {
        avisos = await descontarInventario(order)
      }
      await writeAndContinue(
        updateDoc(doc(db, 'orders', order.id), {
          status: 'delivered',
          ...datosPago,
          ...(debeDescontar ? { stockDescontado: true } : {}),
        })
      )
      if (avisos.length > 0) {
        alert('⚠️ Pocas existencias tras este pedido:\n' + avisos.join('\n'))
      }
    } catch (err) {
      console.error(err)
      alert('No se pudo cobrar el pedido: ' + err.message)
    } finally {
      setBusyId(null)
    }
  }

  const confirmarFactura = async (order, datosCliente) => {
    setFacturaModalOrder(null)
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
          (datosCliente.clientEmail ? (data.correoEnviado ? '\nSe envió por correo.' : '\nNo se pudo enviar el correo.') : '')
      )
    } catch (err) {
      console.error(err)
      alert('No se pudo facturar el pedido: ' + err.message)
    } finally {
      setFacturandoId(null)
    }
  }

  // Reenvía por correo el mismo comprobante (imagen con marca + XML) que ya
  // se mandó automático al facturar — no vuelve a facturar ni a hablar con
  // Hacienda, solo reenvía lo que ya está guardado en el pedido.
  const reenviarCorreo = async (order) => {
    setReenviandoId(order.id)
    try {
      const res = await fetch('/api/reenviar-correo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: order.id }),
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error + (data.motivo ? `: ${data.motivo}` : ''))
      }
      alert('Correo reenviado correctamente.')
    } catch (err) {
      console.error(err)
      alert('No se pudo reenviar el correo: ' + err.message)
    } finally {
      setReenviandoId(null)
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

  const diagnosticoPermisos = async () => {
    const uid = auth.currentUser?.uid
    if (!uid) {
      alert('DIAGNÓSTICO: no hay ninguna sesión activa (auth.currentUser es null).')
      return
    }
    let resultado = `DIAGNÓSTICO\n\nUID de la sesión activa:\n${uid}\n\n`
    try {
      const snap = await getDoc(doc(db, 'staff', uid))
      if (!snap.exists()) {
        resultado += `❌ No existe ningún documento en /staff/${uid}`
      } else {
        resultado += `✅ Documento encontrado en /staff/${uid}\nDatos: ${JSON.stringify(snap.data())}`
      }
    } catch (err) {
      resultado += `❌ Error al leer /staff/${uid}:\n${err.message}`
    }
    alert(resultado)
  }

  return (
    <div className="panel">
      <button
        type="button"
        className="btn-secondary"
        style={{ margin: '12px' }}
        onClick={diagnosticoPermisos}
      >
        🔍 Diagnóstico de permisos (temporal)
      </button>
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
                    {order.status !== 'preparing' && order.status !== 'listo' && (
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
                    {order.status !== 'delivered' && order.status !== 'cancelled' && (
                      <button
                        type="button"
                        className="action-btn action-btn--purple"
                        disabled={busyId === order.id}
                        onClick={() => setCobroOrder(order)}
                      >
                        💳 Cobrar
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
                    {whatsappFacturaLink(order) && (
                      <a
                        className="action-btn action-btn--green"
                        href={whatsappFacturaLink(order)}
                        target="_blank"
                        rel="noreferrer"
                      >
                        📱 Comprobante WhatsApp
                      </a>
                    )}
                    {order.facturaEstado === 'aceptado' && order.clientEmail && (
                      <button
                        type="button"
                        className="action-btn action-btn--blue"
                        disabled={reenviandoId === order.id}
                        onClick={() => reenviarCorreo(order)}
                      >
                        {reenviandoId === order.id ? 'Enviando…' : '✉️ Reenviar correo'}
                      </button>
                    )}
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
      {facturaModalOrder && (
        <FacturaModal
          order={facturaModalOrder}
          onCancel={() => setFacturaModalOrder(null)}
          onConfirm={(datos) => confirmarFactura(facturaModalOrder, datos)}
        />
      )}
      {cobroOrder && (
        <CobroModal
          order={cobroOrder}
          onCancel={() => setCobroOrder(null)}
          onConfirm={(datosPago) => confirmarCobro(cobroOrder, datosPago)}
        />
      )}
    </div>
  )
}

// Formulario para completar los datos del cliente antes de facturar: nombre,
// cédula, correo y dirección (para la Factura/Tiquete electrónico en sí) y
// teléfono (para poder mandarle el comprobante por WhatsApp después). Todos
// los campos son opcionales — sin cédula sale Tiquete en vez de Factura.
function FacturaModal({ order, onCancel, onConfirm }) {
  const [form, setForm] = useState({
    nombre: order.clientName || '',
    cedula: order.clientCedula || '',
    correo: order.clientEmail || '',
    direccion: order.clientAddress || '',
    telefono: order.clientPhone || '',
  })

  const set = (campo) => (e) => setForm((f) => ({ ...f, [campo]: e.target.value }))

  const handleSubmit = (e) => {
    e.preventDefault()
    const datos = {
      ...(form.nombre.trim() ? { clientName: form.nombre.trim() } : {}),
      ...(form.cedula.trim() ? { clientCedula: form.cedula.trim() } : {}),
      ...(form.correo.trim() ? { clientEmail: form.correo.trim() } : {}),
      ...(form.direccion.trim() ? { clientAddress: form.direccion.trim() } : {}),
      ...(form.telefono.trim() ? { clientPhone: form.telefono.trim() } : {}),
    }
    onConfirm(datos)
  }

  return (
    <div className="modal-overlay">
      <div className="modal-card">
        <h3>Datos para el comprobante</h3>
        <p className="dish-form__hint">
          Todos son opcionales. Con cédula se emite Factura completa (si no, Tiquete). Con correo se
          manda por email; con teléfono, además podés mandarlo por WhatsApp.
        </p>
        <form onSubmit={handleSubmit} className="dish-form">
          <label>
            Nombre del cliente
            <input value={form.nombre} onChange={set('nombre')} placeholder="Opcional" />
          </label>
          <label>
            Cédula
            <input value={form.cedula} onChange={set('cedula')} placeholder="Opcional — para Factura completa" />
          </label>
          <label>
            Correo electrónico
            <input
              type="email"
              value={form.correo}
              onChange={set('correo')}
              placeholder="Opcional — para mandarlo por email"
            />
          </label>
          <label>
            Dirección
            <input value={form.direccion} onChange={set('direccion')} placeholder="Opcional" />
          </label>
          <label>
            Teléfono (WhatsApp)
            <input value={form.telefono} onChange={set('telefono')} placeholder="Opcional — 8888-8888" />
          </label>
          <div className="dish-form__actions">
            <button type="button" className="btn-secondary" onClick={onCancel}>
              Cancelar
            </button>
            <button type="submit" className="btn-primary">
              Facturar
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// Colores por persona para distinguir a simple vista quién paga qué —
// mismos colores que usa la app de meseros, para que sea consistente.
const PERSONA_COLORS = ['#d9391f', '#3f9868', '#2b6cb0', '#a83279', '#b58900', '#6b46c1', '#0f9b8e', '#c2410c']
const PAGO_OPTIONS = [
  { key: 'efectivo', label: 'Efectivo' },
  { key: 'sinpe', label: 'SINPE' },
  { key: 'tarjeta', label: 'Tarjeta' },
]

// Modal de cobro: cobrar todo junto con un método de pago, o dividir la
// cuenta asignando cada plato a una persona específica (igual que en la
// app de meseros) y elegir el método de pago de cada una por separado.
function CobroModal({ order, onCancel, onConfirm }) {
  const items = order.items || []
  const [modo, setModo] = useState('junto') // 'junto' | 'dividir'
  const [paymentMethod, setPaymentMethod] = useState('efectivo')
  const [personas, setPersonas] = useState([
    { id: 1, metodo: 'efectivo' },
    { id: 2, metodo: 'efectivo' },
  ])
  const [personaSeq, setPersonaSeq] = useState(2)
  const [activePersonaId, setActivePersonaId] = useState(1)
  const [assignments, setAssignments] = useState({}) // { [nombre]: [personaId|null, ...] }

  const getAssignments = (nombre, qty) => {
    const arr = (assignments[nombre] || []).slice(0, qty)
    while (arr.length < qty) arr.push(null)
    return arr
  }

  const personaTotal = (personaId) => {
    let total = 0
    items.forEach((it) => {
      getAssignments(it.nombre, it.qty).forEach((pid) => {
        if (pid === personaId) total += it.precio
      })
    })
    return total
  }

  const unassignedCount = () => {
    let count = 0
    items.forEach((it) => {
      getAssignments(it.nombre, it.qty).forEach((pid) => {
        if (pid === null) count++
      })
    })
    return count
  }

  const addPersona = () => {
    if (personas.length >= 8) return
    const seq = personaSeq + 1
    setPersonas([...personas, { id: seq, metodo: 'efectivo' }])
    setPersonaSeq(seq)
    setActivePersonaId(seq)
  }

  const removePersona = (id) => {
    if (personas.length <= 2) return
    const nuevasAssignments = {}
    Object.keys(assignments).forEach((nombre) => {
      nuevasAssignments[nombre] = assignments[nombre].map((pid) => (pid === id ? null : pid))
    })
    const nuevasPersonas = personas.filter((p) => p.id !== id)
    setAssignments(nuevasAssignments)
    setPersonas(nuevasPersonas)
    if (activePersonaId === id) setActivePersonaId(nuevasPersonas[0].id)
  }

  const setPersonaMetodo = (id, metodo) => {
    setPersonas(personas.map((p) => (p.id === id ? { ...p, metodo } : p)))
  }

  const assignUnit = (nombre, qty, idx) => {
    const arr = getAssignments(nombre, qty)
    arr[idx] = arr[idx] === activePersonaId ? null : activePersonaId
    setAssignments({ ...assignments, [nombre]: arr })
  }

  const restantes = unassignedCount()

  const handleConfirmDividir = () => {
    if (restantes > 0) return
    const payments = personas
      .map((p, idx) => {
        const monto = personaTotal(p.id)
        const itemsPersona = items
          .map((it) => {
            const qty = getAssignments(it.nombre, it.qty).filter((pid) => pid === p.id).length
            return qty > 0 ? { nombre: it.nombre, precio: it.precio, qty } : null
          })
          .filter(Boolean)
        return { persona: `Persona ${idx + 1}`, metodo: p.metodo, monto, items: itemsPersona }
      })
      .filter((p) => p.monto > 0)
    onConfirm({ paymentMethod: 'dividido', splitPayment: true, payments })
  }

  return (
    <div className="modal-overlay">
      <div className="modal-card">
        <h3>Cobrar {order.mesa ? `Mesa ${order.mesa}` : order.clientName || 'pedido'}</h3>
        <p className="dish-form__hint">Total: {formatColones(order.total)}</p>

        <div className="split-toggle">
          <button type="button" className={modo === 'junto' ? 'active' : ''} onClick={() => setModo('junto')}>
            Cobrar todo junto
          </button>
          <button type="button" className={modo === 'dividir' ? 'active' : ''} onClick={() => setModo('dividir')}>
            Dividir entre varios
          </button>
        </div>

        {modo === 'junto' ? (
          <>
            <div className="pay-row">
              {PAGO_OPTIONS.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  className={`pay-chip ${paymentMethod === p.key ? 'active' : ''}`}
                  onClick={() => setPaymentMethod(p.key)}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <div className="dish-form__actions">
              <button type="button" className="btn-secondary" onClick={onCancel}>
                Cancelar
              </button>
              <button type="button" className="btn-primary" onClick={() => onConfirm({ paymentMethod })}>
                Cobrar {formatColones(order.total)}
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="split-hint">Elegí quién paga y tocá los platos que le tocan a esa persona.</p>
            <div className="split-personas">
              {personas.map((p, idx) => (
                <button
                  key={p.id}
                  type="button"
                  className={`persona-chip ${activePersonaId === p.id ? 'active' : ''}`}
                  onClick={() => setActivePersonaId(p.id)}
                >
                  {personas.length > 2 && (
                    <span
                      className="persona-chip__remove"
                      onClick={(e) => {
                        e.stopPropagation()
                        removePersona(p.id)
                      }}
                    >
                      ✕
                    </span>
                  )}
                  <span className="p-name">
                    <span className="p-dot" style={{ background: PERSONA_COLORS[idx % PERSONA_COLORS.length] }} />
                    Persona {idx + 1}
                  </span>
                  <span className="p-total">{formatColones(personaTotal(p.id))}</span>
                </button>
              ))}
              <button type="button" className="persona-add" onClick={addPersona}>
                + Persona
              </button>
            </div>

            {restantes > 0 && (
              <p className="split-warning">
                ⚠️ Faltan {restantes} unidad{restantes === 1 ? '' : 'es'} por asignar
              </p>
            )}

            {items.map((it) => {
              const arr = getAssignments(it.nombre, it.qty)
              return (
                <div key={it.nombre} className="split-item">
                  <div className="split-item__head">
                    <span className="name">{it.nombre}</span>
                    <span className="price">{formatColones(it.precio)} c/u</span>
                  </div>
                  <div className="unit-chips">
                    {arr.map((pid, idx) => {
                      const pIdx = personas.findIndex((p) => p.id === pid)
                      const color = pIdx >= 0 ? PERSONA_COLORS[pIdx % PERSONA_COLORS.length] : undefined
                      return (
                        <button
                          key={idx}
                          type="button"
                          className={`unit-chip ${pid !== null ? 'assigned' : ''}`}
                          style={pid !== null ? { background: color } : undefined}
                          onClick={() => assignUnit(it.nombre, it.qty, idx)}
                        >
                          {pIdx >= 0 ? pIdx + 1 : '–'}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })}

            <div className="split-summary">
              <div className="section-title" style={{ marginTop: 14 }}>
                Método de pago por persona
              </div>
              {personas.map((p, idx) => (
                <div key={p.id} className="persona-pay">
                  <div className="persona-pay__row">
                    <span className="persona-pay__name">
                      <span className="p-dot" style={{ background: PERSONA_COLORS[idx % PERSONA_COLORS.length] }} />
                      Persona {idx + 1}
                    </span>
                    <span className="persona-pay__total">{formatColones(personaTotal(p.id))}</span>
                  </div>
                  <div className="pay-row">
                    {PAGO_OPTIONS.map((opt) => (
                      <button
                        key={opt.key}
                        type="button"
                        className={`pay-chip ${p.metodo === opt.key ? 'active' : ''}`}
                        onClick={() => setPersonaMetodo(p.id, opt.key)}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="dish-form__actions">
              <button type="button" className="btn-secondary" onClick={onCancel}>
                Cancelar
              </button>
              <button type="button" className="btn-primary" disabled={restantes > 0} onClick={handleConfirmDividir}>
                Cobrar {formatColones(order.total)}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
