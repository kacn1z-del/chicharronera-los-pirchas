const NAV_ITEMS = [
  { id: 'resumen', label: 'Resumen', icon: '◧' },
  { id: 'pedidos', label: 'Pedidos', icon: '☰' },
  { id: 'restaurantes', label: 'Restaurantes', icon: '⌂' },
  { id: 'repartidores', label: 'Repartidores', icon: '➜' },
  { id: 'usuarios', label: 'Usuarios', icon: '◎' },
  { id: 'menu', label: 'Menú', icon: '🍽' },
]

export default function Sidebar({ active, onNavigate }) {
  return (
    <aside className="sidebar">
      <div className="sidebar__brand">
        <img className="sidebar__mark" src="/logo.jpeg" alt="Los Pirchas" />
        <div>
          <p className="sidebar__title">Los Pirchas</p>
          <p className="sidebar__subtitle">Panel Admin</p>
        </div>
      </div>

      <nav className="sidebar__nav">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.id}
            className={`sidebar__link ${active === item.id ? 'is-active' : ''}`}
            onClick={() => onNavigate(item.id)}
            aria-current={active === item.id ? 'page' : undefined}
          >
            <span className="sidebar__icon" aria-hidden="true">
              {item.icon}
            </span>
            {item.label}
          </button>
        ))}
      </nav>

      <div className="sidebar__footer">
        <p>Conectado a</p>
        <p className="mono sidebar__project">acosta-food (Los Pirchas)</p>
      </div>
    </aside>
  )
}

