// Órdenes (acompañamientos a la carta), Café y Adicionales, transcritos del
// sistema de punto de venta viejo que usaba Los Pirchas. No incluye los
// platos que ya existían en el menú nuevo con el mismo nombre y precio
// (yuca frita, papas fritas, patacones, aros de cebolla, mozzarella
// sticks/richs) para no duplicarlos.

export const EXTRAS_SEED = [
  // Órdenes (acompañamientos sueltos)
  { nombre: 'Orden de frijol con doraditas', categoria: 'Órdenes', precio: 1000 },
  { nombre: 'Orden de frijol molido', categoria: 'Órdenes', precio: 500 },
  { nombre: 'Orden papas en gajo', categoria: 'Órdenes', precio: 2700 },
  { nombre: 'Orden doraditas', categoria: 'Órdenes', precio: 2700 },
  { nombre: 'Orden familiar patacones', categoria: 'Órdenes', precio: 5000 },
  { nombre: 'Orden frijoles', categoria: 'Órdenes', precio: 1500 },
  { nombre: 'Orden jalapeño', categoria: 'Órdenes', precio: 1000 },
  { nombre: 'Orden tortillas', categoria: 'Órdenes', precio: 1000 },

  // Café
  { nombre: 'Café con leche', categoria: 'Café', precio: 1500 },
  { nombre: 'Café negro', categoria: 'Café', precio: 1500 },
  { nombre: 'Café frío', categoria: 'Café', precio: 3000 },
  { nombre: 'Expresso americano', categoria: 'Café', precio: 3000 },
  { nombre: 'Expresso cortado', categoria: 'Café', precio: 3000 },
  { nombre: 'Expresso maquiato', categoria: 'Café', precio: 2500 },

  // Adicionales
  { nombre: 'Adicional de arroz', categoria: 'Adicionales', precio: 1000 },
  { nombre: 'Adicional de carne', categoria: 'Adicionales', precio: 1000 },
  { nombre: 'Adicional ensalada', categoria: 'Adicionales', precio: 1000 },
  { nombre: 'Adicional queso', categoria: 'Adicionales', precio: 1000 },
  { nombre: 'Adicional de papas', categoria: 'Adicionales', precio: 0 },
  { nombre: 'Adicional filet de pollo', categoria: 'Adicionales', precio: 3500 },
  { nombre: 'Adicional', categoria: 'Adicionales', precio: 500 },
  { nombre: 'Adicional', categoria: 'Adicionales', precio: 1500 },
  { nombre: 'Adicional', categoria: 'Adicionales', precio: 2000 },
  { nombre: 'Adicional', categoria: 'Adicionales', precio: 3000 },
]
