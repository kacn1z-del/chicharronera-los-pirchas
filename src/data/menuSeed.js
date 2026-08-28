// Menú completo de Los Pirchas, transcrito de las fotos del menú físico.
// Cada item se sube como un documento nuevo a la colección "Menu" de Firestore.

export const MENU_SEED = [
  // Entradas calientes
  { nombre: 'Crema de ayote', categoria: 'Entradas calientes', precio: 3500 },
  { nombre: 'Yuca frita', categoria: 'Entradas calientes', precio: 2700 },
  { nombre: 'Papas fritas', categoria: 'Entradas calientes', precio: 2700 },
  { nombre: 'Patacones', categoria: 'Entradas calientes', precio: 2700 },
  { nombre: 'Dados de queso', categoria: 'Entradas calientes', precio: 3000 },
  { nombre: 'Aros de cebolla', categoria: 'Entradas calientes', precio: 4000 },
  { nombre: 'Mozzarella sticks', categoria: 'Entradas calientes', precio: 4000 },

  // Arroces (acompañamientos: ensalada verde, papas fritas, frijoles molidos)
  { nombre: 'Arroz con cerdo', categoria: 'Arroces', precio: 4500, descripcion: 'Incluye ensalada verde, papas fritas y frijoles molidos.' },
  { nombre: 'Arroz con pollo', categoria: 'Arroces', precio: 4500, descripcion: 'Incluye ensalada verde, papas fritas y frijoles molidos.' },
  { nombre: 'Arroz especial de la casa', categoria: 'Arroces', precio: 5000, descripcion: 'Incluye ensalada verde, papas fritas y frijoles molidos.' },

  // Pastas (acompañamiento: pan de ajo)
  { nombre: 'Espaguetti a la boloñesa', categoria: 'Pastas', precio: 5200, descripcion: 'Incluye pan de ajo.' },
  { nombre: 'Espaguetti con pollo en salsa blanca', categoria: 'Pastas', precio: 5200, descripcion: 'Incluye pan de ajo.' },
  { nombre: 'Espaguetti al pesto cremoso', categoria: 'Pastas', precio: 5200, descripcion: 'Incluye pan de ajo.' },

  // Casados con (acompañamientos: arroz, frijoles, plátano maduro, picadillo, ensalada verde y fría)
  { nombre: 'Casado con chuleta a la parrilla', categoria: 'Casados', precio: 4500 },
  { nombre: 'Casado con bistec de res a la parrilla', categoria: 'Casados', precio: 4500 },
  { nombre: 'Casado con filete de pollo a la parrilla o plancha', categoria: 'Casados', precio: 4500 },
  { nombre: 'Casado con chorizo de la casa', categoria: 'Casados', precio: 4500 },
  { nombre: 'Casado con rabo en salsa', categoria: 'Casados', precio: 6500 },
  { nombre: 'Casado con costilla de cerdo a la parrilla', categoria: 'Casados', precio: 5000 },
  { nombre: 'Casado con carne en salsa', categoria: 'Casados', precio: 4500 },
  { nombre: 'Casado con lengua en salsa', categoria: 'Casados', precio: 6500 },
  { nombre: 'Casado con chicharrón de carne', categoria: 'Casados', precio: 4500 },
  { nombre: 'Casado con chicharrón de costilla', categoria: 'Casados', precio: 5000 },

  // Menú infantil
  { nombre: 'Nuggets de pollo (infantil)', categoria: 'Menú infantil', precio: 4000 },
  { nombre: 'Hamburguesa con papas (infantil)', categoria: 'Menú infantil', precio: 4000 },
  { nombre: 'Dados de queso (infantil)', categoria: 'Menú infantil', precio: 4000 },
  { nombre: 'Mozzarella sticks (infantil)', categoria: 'Menú infantil', precio: 4000 },

  // Especialidades Mexicanas
  { nombre: 'Tacos de birria', categoria: 'Especialidades Mexicanas', precio: 6000 },
  { nombre: 'Quesabirria', categoria: 'Especialidades Mexicanas', precio: 6000 },
  { nombre: 'Tacos de alambre', categoria: 'Especialidades Mexicanas', precio: 6000 },
  { nombre: 'Tacos hawaianos', categoria: 'Especialidades Mexicanas', precio: 6000 },
  { nombre: 'Tacos de lengua', categoria: 'Especialidades Mexicanas', precio: 6500 },

  // Bebidas
  { nombre: 'Batido en agua', categoria: 'Bebidas', precio: 1800, descripcion: 'Fresa, maracuyá, papaya, mora, sandía, mango, melón, piña, cas, guanábana, crema, horchata, pinolillo o resbaladera.' },
  { nombre: 'Batido en leche', categoria: 'Bebidas', precio: 2200, descripcion: 'Fresa, maracuyá, papaya, mora, sandía, mango, melón, piña, cas, guanábana, crema, horchata, pinolillo o resbaladera.' },
  { nombre: 'Limonada con hierbabuena', categoria: 'Bebidas', precio: 2200 },
  { nombre: 'Gaseosa', categoria: 'Bebidas', precio: 1450 },
  { nombre: 'Cerveza nacional', categoria: 'Bebidas', precio: 1600 },
  { nombre: 'Cerveza nacional premium', categoria: 'Bebidas', precio: 2200 },
  { nombre: 'Cerveza internacional', categoria: 'Bebidas', precio: 0, descripcion: 'Consultar precio disponible.' },
  { nombre: 'Chelada', categoria: 'Bebidas', precio: 4500 },

  // Otras Especialidades
  { nombre: 'Lengua en salsa', categoria: 'Otras Especialidades', precio: 5000 },
  { nombre: 'Rabo en salsa', categoria: 'Otras Especialidades', precio: 5000 },
  { nombre: 'Carne en salsa', categoria: 'Otras Especialidades', precio: 3500 },
  { nombre: 'Nachos de res, pollo o cerdo', categoria: 'Otras Especialidades', precio: 4500 },
  { nombre: 'Papas supremas de res o pollo', categoria: 'Otras Especialidades', precio: 4500 },
  { nombre: 'Fajitas de res o pollo', categoria: 'Otras Especialidades', precio: 4500 },
  { nombre: 'Canasta patacón con chicharrón', categoria: 'Otras Especialidades', precio: 4500 },
  { nombre: 'Burrito de res o pollo', categoria: 'Otras Especialidades', precio: 4100 },
  { nombre: 'Quesadilla de res o pollo', categoria: 'Otras Especialidades', precio: 4100 },
  { nombre: 'Nuggets de pollo', categoria: 'Otras Especialidades', precio: 4500 },
  { nombre: 'Choripan', categoria: 'Otras Especialidades', precio: 4000 },
  { nombre: 'Canasta patacón supremo', categoria: 'Otras Especialidades', precio: 4500 },
  { nombre: 'Alitas con 2 salsas al gusto', categoria: 'Otras Especialidades', precio: 6000 },

  // Para Compartir
  {
    nombre: 'Parrillada mixta (4 a 6 personas)',
    categoria: 'Para Compartir',
    precio: 30000,
    descripcion: 'Corte de res, costilla de cerdo, filete de pollo, salchichón, chorizo de la casa, papas en gajo, patacones, ensalada, pico de gallo, frijoles molidos.',
  },
  {
    nombre: 'Tabla de chicharrón mediana (2 a 3 personas)',
    categoria: 'Para Compartir',
    precio: 14500,
    descripcion: '600 gramos de chicharrón, yuca, patacones, ensalada, pico de gallo, frijoles molidos y banano.',
  },
  {
    nombre: 'Tabla de chicharrón grande (4 a 6 personas)',
    categoria: 'Para Compartir',
    precio: 25000,
    descripcion: '1200 gramos de chicharrón, yuca, patacones, ensalada, pico de gallo, frijoles molidos y banano.',
  },

  // Cortes especiales — Pollo (acompañamientos: papas fritas, ensalada verde, frijol molido)
  { nombre: 'Pollo a la naranja', categoria: 'Cortes especiales', precio: 4500, descripcion: 'Incluye papas fritas, ensalada verde y frijol molido.' },
  { nombre: 'Pollo a la parrilla o plancha', categoria: 'Cortes especiales', precio: 4500, descripcion: 'Incluye papas fritas, ensalada verde y frijol molido.' },
  { nombre: 'Cordon bleu', categoria: 'Cortes especiales', precio: 5500, descripcion: 'Incluye papas fritas, ensalada verde y frijol molido.' },
  { nombre: 'Brocheta de pollo a la parrilla', categoria: 'Cortes especiales', precio: 4500, descripcion: 'Incluye papas fritas, ensalada verde y frijol molido.' },

  // Cortes especiales — Cerdo (acompañamientos: plátano asado, piña asada, ensalada verde, yuca frita, frijoles molidos)
  { nombre: 'Chuletón a la parrilla (600-700 grs)', categoria: 'Cortes especiales', precio: 6000, descripcion: '3 acompañamientos: plátano asado, piña asada, ensalada verde, yuca frita, frijoles molidos.' },
  { nombre: 'Costilla a la parrilla (500-600 grs)', categoria: 'Cortes especiales', precio: 6000, descripcion: '3 acompañamientos: plátano asado, piña asada, ensalada verde, yuca frita, frijoles molidos.' },
  { nombre: 'Chicharrón de costilla (corte especial)', categoria: 'Cortes especiales', precio: 4800 },
  { nombre: 'Chicharrón de carne (corte especial)', categoria: 'Cortes especiales', precio: 4800 },
  { nombre: 'Chifrijo', categoria: 'Cortes especiales', precio: 4500 },

  // Cortes especiales — Res (3 acompañamientos: papa en gajo, ensalada verde, piña asada, plátano asado)
  { nombre: 'Rib eye 350 grs', categoria: 'Cortes especiales', precio: 12000, descripcion: '3 acompañamientos: papa en gajo, ensalada verde, piña asada, plátano asado.' },
  { nombre: 'New York 350 grs', categoria: 'Cortes especiales', precio: 12000, descripcion: '3 acompañamientos: papa en gajo, ensalada verde, piña asada, plátano asado.' },
  { nombre: 'Picaña', categoria: 'Cortes especiales', precio: 12000, descripcion: '3 acompañamientos: papa en gajo, ensalada verde, piña asada, plátano asado.' },
  { nombre: 'Filete mignon', categoria: 'Cortes especiales', precio: 12000, descripcion: '3 acompañamientos: papa en gajo, ensalada verde, piña asada, plátano asado.' },
  { nombre: 'Brocheta de lomito', categoria: 'Cortes especiales', precio: 12000, descripcion: '3 acompañamientos: papa en gajo, ensalada verde, piña asada, plátano asado.' },
  { nombre: 'Mar y tierra', categoria: 'Cortes especiales', precio: 22000, descripcion: '3 acompañamientos: papa en gajo, ensalada verde, piña asada, plátano asado.' },

  // Hamburguesas (acompañamiento: papas fritas, papas en gajo o aros de cebolla)
  {
    nombre: 'Bacon Lovers',
    categoria: 'Hamburguesas',
    precio: 7500,
    descripcion: 'Pan artesanal, triple torta de carne 150 grs, queso cheddar, doble tocino, lechuga, tomate, cebolla, pepinillos, salsa de tomate y mayonesa.',
  },
  {
    nombre: 'Queso Burguesa',
    categoria: 'Hamburguesas',
    precio: 6500,
    descripcion: 'Pan artesanal, torta de carne 150 grs, queso cheddar, queso mozzarella, queso americano, mozzarella stick, lechuga, tomate, cebolla, salsa de tomate y mayonesa.',
  },
  {
    nombre: 'Pulled Pork',
    categoria: 'Hamburguesas',
    precio: 6500,
    descripcion: 'Pan artesanal, pulled pork, piña asada, cebolla caramelizada y salsa BBQ.',
  },
  {
    nombre: 'La Texana',
    categoria: 'Hamburguesas',
    precio: 6500,
    descripcion: 'Pan artesanal, aros de cebolla, torta de carne 150 grs, tocineta, hongos salteados, salsa BBQ, lechuga, tomate, cebolla, pepinillos y queso cheddar.',
  },
  {
    nombre: 'Coronel Burguer',
    categoria: 'Hamburguesas',
    precio: 6500,
    descripcion: 'Pan artesanal, 2 pechugas de pollo empanizadas, queso mozzarella, tocineta, lechuga, tomate, pepinillos y ranch en el pan.',
  },

  // Plato Ejecutivo (lunes a viernes, 11am a 4pm — incluye refresco y postre del día)
  {
    nombre: 'Plato Ejecutivo — Opción 1',
    categoria: 'Plato Ejecutivo',
    precio: 3500,
    descripcion: 'Arroz, frijoles, picadillo, plátano maduro, ensalada, chuleta, pollo, bistec o chorizo. Incluye refresco y postre del día. Lunes a viernes, 11am–4pm.',
  },
  {
    nombre: 'Plato Ejecutivo — Opción 2',
    categoria: 'Plato Ejecutivo',
    precio: 3500,
    descripcion: 'Bistec, pollo o chuleta, con papas fritas, ensalada, frijoles molidos y tortilla tostada. Incluye refresco y postre del día. Lunes a viernes, 11am–4pm.',
  },
  {
    nombre: 'Plato Ejecutivo — Opción 3',
    categoria: 'Plato Ejecutivo',
    precio: 3500,
    descripcion: 'Espagueti en salsa pesto cremoso, boloñesa o salsa blanca, con pan de ajo, postre y refresco del día. Lunes a viernes, 11am–4pm.',
  },
]

