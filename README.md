# Los Pirchas — Panel Admin

Panel de administración web para **Los Pirchas, Restaurante y Chicharronera**.
Muestra en tiempo real los pedidos, repartidores y clientes registrados en Firebase
(proyecto técnico `acosta-food` — el nombre del proyecto en Firebase no cambió, pero
todo el branding visible ahora es Los Pirchas).

## Qué incluye

- **Resumen**: métricas generales (pedidos, restaurantes, usuarios) conectadas en vivo a Firestore.
- **Pedidos**: tabla en tiempo real de la colección `orders`, con botón para notificar al cliente por WhatsApp (enlace `wa.me`, gratis, sin necesidad de aprobación de Meta).
- **Restaurantes**: tarjetas con los documentos de la colección `restaurants` (por ahora solo Los Pirchas, pero la estructura queda lista si algún día se suma otro local).
- **Repartidores**: ubicación en vivo desde la Realtime Database (nodo `deliveries`), si está activada.
- **Usuarios**: listado de la colección `users`.

Todas las secciones muestran un mensaje claro si la colección todavía no existe o está vacía —
no hay que crear datos de prueba para que el panel funcione.

## Identidad visual

- **Colores**: negro carbón de fondo, con degradados de fuego (rojo `#D9391F`, naranja `#E8792B`, ámbar `#F2A53A`) inspirados en el logo de Los Pirchas.
- **Tipografía**: Bricolage Grotesque para títulos, IBM Plex Sans para texto, IBM Plex Mono para números y datos.
- **Logo**: `public/logo.jpeg` — usado como favicon y en el sidebar.

## Estructura de datos esperada en Firestore

**Colección `orders`**
```
{
  clientId: string,
  clientName: string,       // opcional, se usa en el mensaje de WhatsApp
  clientPhone: string,      // opcional, con o sin +506 — sin este campo no aparece el botón de WhatsApp
  restaurantId: string,
  restaurantName: string,   // opcional
  status: "pending" | "preparing" | "on_the_way" | "delivered" | "cancelled",
  createdAt: Timestamp
}
```

**Colección `restaurants`**
```
{
  nombre: string,
  categoria: string,
  activo: boolean   // o "disponible", ambos se leen
}
```

**Colección `users`**
```
{
  nombre: string,
  telefono: string,
  email: string
}
```

**Realtime Database, nodo `deliveries/{riderId}`**
```
{
  lat: number,
  lng: number,
  timestamp: number
}
```

## Cómo subir esto a GitHub desde el iPhone

1. Creá un repo nuevo en GitHub (ej. `los-pirchas-admin`).
2. Desde el editor web de GitHub, subí todos estos archivos manteniendo la misma
   estructura de carpetas (`src/`, `src/components/`, `public/`).
3. Conectá el repo a Vercel — al hacer push, Vercel detecta que es un proyecto Vite
   automáticamente (build command: `npm run build`, output: `dist`).

## Pendiente: factura electrónica

Se acordó que la factura electrónica de Hacienda va para el **cliente final** que hace
el pedido (no para la contabilidad interna del negocio). El negocio ya tiene el
certificado digital (.p12) tramitado en ATV. Esto se integra **después** de tener listo
el flujo completo de pedidos del cliente — el certificado nunca debe vivir en el
frontend, solo en un backend seguro (Cloud Function) que firme el XML.

## Notas de seguridad

Las credenciales en `src/firebase.js` (`apiKey`, etc.) son las de configuración pública
del proyecto Firebase — es normal y seguro que viajen en el código del frontend. Lo que
protege tus datos son las **reglas de seguridad de Firestore** (pestaña "Reglas" en la
consola), no ocultar estas credenciales. Si el panel Admin va a manejar datos sensibles,
conviene agregar autenticación (Firebase Auth) antes de publicarlo, para que no cualquiera
con la URL pueda ver los pedidos.
