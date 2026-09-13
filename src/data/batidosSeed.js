// Cada sabor de "Batido en agua" y "Batido en leche" como plato individual
// del menú, en vez de un solo plato genérico con los sabores listados en la
// descripción. Mismos 14 sabores que ya estaban en la descripción original,
// mismo precio base (₡1.800 en agua, ₡2.200 en leche) para todos.

const SABORES = [
  'fresa',
  'maracuyá',
  'papaya',
  'mora',
  'sandía',
  'mango',
  'melón',
  'piña',
  'cas',
  'guanábana',
  'crema',
  'horchata',
  'pinolillo',
  'resbaladera',
]

export const BATIDOS_SEED = [
  ...SABORES.map((sabor) => ({
    nombre: `Batido en agua de ${sabor}`,
    categoria: 'Bebidas',
    precio: 1800,
  })),
  ...SABORES.map((sabor) => ({
    nombre: `Batido en leche de ${sabor}`,
    categoria: 'Bebidas',
    precio: 2200,
  })),
]
