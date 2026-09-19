// Las 4 categorías de bebida que existen hoy en el menú (después de la
// reestructuración: antes todo vivía bajo una sola categoría "Bebidas").
// Usado por CocinaView (para sacar las bebidas de lo que hay que cocinar) y
// BebidasView (para quedarse solo con las bebidas).
export const CATEGORIAS_BEBIDA = ['bebidas', 'bebidas calientes', 'batidos en agua', 'batidos en leche']

export function normalizarTexto(text) {
  return (text || '')
    .toString()
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}
