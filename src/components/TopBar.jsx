const TITLES = {
  resumen: ['Resumen', 'Lo que está pasando ahora mismo en Los Pirchas'],
  pedidos: ['Pedidos', 'Pedidos activos y su estado en tiempo real'],
  restaurantes: ['Restaurantes', 'Locales registrados en la plataforma'],
  repartidores: ['Repartidores', 'Ubicación y disponibilidad del equipo de entrega'],
  usuarios: ['Usuarios', 'Clientes registrados en Los Pirchas'],
  menu: ['Menú', 'Importar y administrar los platos del menú'],
}

export default function TopBar({ section, connected }) {
  const [title, subtitle] = TITLES[section] ?? TITLES.resumen

  return (
    <header className="topbar">
      <div>
        <h1 className="topbar__title">{title}</h1>
        <p className="topbar__subtitle">{subtitle}</p>
      </div>
      <div className={`topbar__status ${connected ? 'is-live' : 'is-offline'}`}>
        <span className="topbar__dot" aria-hidden="true" />
        {connected ? 'Conectado en vivo' : 'Sin conexión con Firestore'}
      </div>
    </header>
  )
}

