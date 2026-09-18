// Reestructuración de menú pedida por el cliente. Orden y ortografía tal
// cual las pasó el cliente, sin corregir nada (ej. "Espresso machiato").
// No incluye los ítems que ya existían con un nombre parecido — esos se
// renombran en vez de duplicarse, ver REEMPLAZOS_SEED más abajo.
// Los ítems sin precio confirmado quedan en 0 con nota — hay que
// completarlos después en el MenuEditor.

const SIN_PRECIO = 'Precio pendiente de definir.'

export const RESTRUCTURACION_SEED = [
  // Órdenes (nuevas — orden exacto que pasó el cliente)
  { nombre: 'Orden de aguacate', categoria: 'Órdenes', precio: 0, descripcion: SIN_PRECIO },
  { nombre: 'Orden de guacamole', categoria: 'Órdenes', precio: 0, descripcion: SIN_PRECIO },
  { nombre: 'Orden de pico de gallo', categoria: 'Órdenes', precio: 0, descripcion: SIN_PRECIO },
  { nombre: 'Orden de carne en salsa', categoria: 'Órdenes', precio: 0, descripcion: SIN_PRECIO },
  { nombre: 'Orden de arroz', categoria: 'Órdenes', precio: 0, descripcion: SIN_PRECIO },
  { nombre: 'Orden de ensalada', categoria: 'Órdenes', precio: 0, descripcion: SIN_PRECIO },
  { nombre: 'Orden de tuétano', categoria: 'Órdenes', precio: 0, descripcion: SIN_PRECIO },
  { nombre: 'Orden de fruta', categoria: 'Órdenes', precio: 0, descripcion: SIN_PRECIO },
  { nombre: 'Orden de hierbabuena', categoria: 'Órdenes', precio: 0, descripcion: SIN_PRECIO },
  { nombre: 'Orden de yucas', categoria: 'Órdenes', precio: 0, descripcion: SIN_PRECIO },

  // Postres (nuevos — la categoría "Helados" se renombra aparte)
  { nombre: 'Helado', categoria: 'Postres', precio: 0, descripcion: SIN_PRECIO },
  { nombre: 'Cono pequeño', categoria: 'Postres', precio: 0, descripcion: SIN_PRECIO },
  { nombre: 'Cono grande', categoria: 'Postres', precio: 0, descripcion: SIN_PRECIO },
  { nombre: 'Copa helado', categoria: 'Postres', precio: 0, descripcion: SIN_PRECIO },
  { nombre: 'Canasta de frutas', categoria: 'Postres', precio: 0, descripcion: SIN_PRECIO },

  // Café (nuevos)
  { nombre: 'Mokaccino', categoria: 'Café', precio: 0, descripcion: SIN_PRECIO },
  { nombre: 'Capuchino', categoria: 'Café', precio: 0, descripcion: SIN_PRECIO },
  { nombre: 'Latte', categoria: 'Café', precio: 0, descripcion: SIN_PRECIO },
  { nombre: 'Aguadulce', categoria: 'Café', precio: 0, descripcion: SIN_PRECIO },
  { nombre: 'Té', categoria: 'Café', precio: 0, descripcion: SIN_PRECIO },

  // Menú de café (categoría nueva, va después de Menú infantil)
  { nombre: 'Sándwich de Pollo', categoria: 'Menú de café', precio: 0, descripcion: SIN_PRECIO },
  { nombre: 'Sándwich de Carne', categoria: 'Menú de café', precio: 0, descripcion: SIN_PRECIO },
  { nombre: 'Sándwich de Jamón y queso', categoria: 'Menú de café', precio: 0, descripcion: SIN_PRECIO },
  { nombre: 'Empanada de Carne', categoria: 'Menú de café', precio: 0, descripcion: SIN_PRECIO },
  { nombre: 'Empanada de Pollo', categoria: 'Menú de café', precio: 0, descripcion: SIN_PRECIO },
  { nombre: 'Empanada de Frijol con queso', categoria: 'Menú de café', precio: 0, descripcion: SIN_PRECIO },
  { nombre: 'Empanada de Queso', categoria: 'Menú de café', precio: 0, descripcion: SIN_PRECIO },
  { nombre: 'Tortillas con natilla', categoria: 'Menú de café', precio: 0, descripcion: SIN_PRECIO },
]

// Ítems que ya existían en Firestore con un nombre distinto al que dio el
// cliente esta vez. En vez de duplicarlos, se renombran para que el texto
// quede exactamente como lo pidió el cliente (no se toca el precio).
export const REEMPLAZOS_SEED = [
  { viejo: 'Mozzarella sticks', nuevo: 'Mozzarella richs' },
  { viejo: 'Mozzarella sticks (infantil)', nuevo: 'Mozzarella richs (infantil)' },
  { viejo: 'Orden de frijol molido', nuevo: 'Orden frijoles molidos' },
  { viejo: 'Orden jalapeño', nuevo: 'Orden de jalapeños' },
  { viejo: 'Orden tortillas', nuevo: 'Orden de tortillas' },
  { viejo: 'Orden doraditas', nuevo: 'Orden de doraditas' },
  { viejo: 'Expresso americano', nuevo: 'Espresso americano' },
  { viejo: 'Expresso cortado', nuevo: 'Espresso cortado' },
  { viejo: 'Expresso maquiato', nuevo: 'Espresso machiato' },
  { viejo: 'Chocolate caliente', nuevo: 'Chocolate' },
]
