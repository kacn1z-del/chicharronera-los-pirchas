import { doc, runTransaction } from 'firebase/firestore'
import { db } from '../firebase'

export function formatNumeroPedido(numero) {
  return `Pirchas #${String(numero).padStart(6, '0')}`
}

// Le asigna a un pedido un número consecutivo (1, 2, 3…) la primera vez que
// alguien lo necesita — ya sea cocina (apenas llega) o el admin (al
// imprimir) — guardado en el propio pedido para que no cambie después. El
// correlativo vive en un documento contador aparte para que dos personas
// viendo pedidos distintos a la vez no terminen con el mismo número.
export async function asegurarNumeroPedido(order) {
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
