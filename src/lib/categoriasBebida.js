// Antes esto era una lista corta de nombres exactos de categoría, y se
// quedó afuera "Gaseosas y refrescos" (existe en el menú pero no estaba en
// la lista) — las gaseosas terminaban llegando a cocina como si fueran
// comida. Para que esto no se rompa cada vez que aparezca una categoría de
// bebida que no anticipamos, se detecta por palabra clave completa (no por
// texto exacto de la categoría entera).
const PALABRAS_CLAVE_BEBIDA = [
  'bebida', 'bebidas',
  'batido', 'batidos',
  'gaseosa', 'gaseosas',
  'refresco', 'refrescos',
  'cerveza', 'cervezas',
  'licor', 'licores',
  'jugo', 'jugos',
  'cafe',
  'te',
  'chocolate',
  'aguadulce',
  'smoothie', 'smoothies',
]

export function esCategoriaBebida(categoria) {
  const palabras = normalizarTexto(categoria).split(/\s+/)
  return palabras.some((p) => PALABRAS_CLAVE_BEBIDA.includes(p))
}

export function normalizarTexto(text) {
  return (text || '')
    .toString()
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}
