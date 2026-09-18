// Reestructuración de menú: nuevos ítems para Órdenes, Café, Postres y el
// nuevo "Menú de café". No incluye los ítems que ya existían con un nombre
// parecido (ver extrasSeed.js) para no duplicarlos.
// Los ítems sin precio confirmado quedan en 0 con nota — hay que completarlos
// después en el MenuEditor.

const SIN_PRECIO = 'Precio pendiente de definir.'

export const RESTRUCTURACION_SEED = [
  // Órdenes (nuevas, no incluye las que ya existían con otro nombre)
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

  // Café (nuevos, no incluye los que ya existían con otro nombre)
  { nombre: 'Mokaccino', categoria: 'Café', precio: 0, descripcion: SIN_PRECIO },
  { nombre: 'Capuchino', categoria: 'Café', precio: 0, descripcion: SIN_PRECIO },
  { nombre: 'Latte', categoria: 'Café', precio: 0, descripcion: SIN_PRECIO },
  { nombre: 'Aguadulce', categoria: 'Café', precio: 0, descripcion: SIN_PRECIO },
  { nombre: 'Té', categoria: 'Café', precio: 0, descripcion: SIN_PRECIO },

  // Postres (categoría nueva — los ítems viejos de "Helados" se renombran
  // aparte, ver botón "Renombrar Helados → Postres" en MenuImportPanel)
  { nombre: 'Helado', categoria: 'Postres', precio: 0, descripcion: SIN_PRECIO },
  { nombre: 'Cono pequeño', categoria: 'Postres', precio: 0, descripcion: SIN_PRECIO },
  { nombre: 'Cono grande', categoria: 'Postres', precio: 0, descripcion: SIN_PRECIO },
  { nombre: 'Copa helado', categoria: 'Postres', precio: 0, descripcion: SIN_PRECIO },
  { nombre: 'Canasta de frutas', categoria: 'Postres', precio: 0, descripcion: SIN_PRECIO },

  // Menú de café (categoría nueva, va después de Menú infantil)
  { nombre: 'Sándwich de pollo', categoria: 'Menú de café', precio: 0, descripcion: SIN_PRECIO },
  { nombre: 'Sándwich de carne', categoria: 'Menú de café', precio: 0, descripcion: SIN_PRECIO },
  { nombre: 'Sándwich de jamón y queso', categoria: 'Menú de café', precio: 0, descripcion: SIN_PRECIO },
  { nombre: 'Empanada de carne', categoria: 'Menú de café', precio: 0, descripcion: SIN_PRECIO },
  { nombre: 'Empanada de pollo', categoria: 'Menú de café', precio: 0, descripcion: SIN_PRECIO },
  { nombre: 'Empanada de frijol con queso', categoria: 'Menú de café', precio: 0, descripcion: SIN_PRECIO },
  { nombre: 'Empanada de queso', categoria: 'Menú de café', precio: 0, descripcion: SIN_PRECIO },
  { nombre: 'Tortillas con natilla', categoria: 'Menú de café', precio: 0, descripcion: SIN_PRECIO },
]
