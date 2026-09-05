const NAV_ITEMS = [
  { id: 'resumen', label: 'Resumen', icon: '◧' },
  { id: 'salon', label: 'Salón', icon: '⛶' },
  { id: 'pedidos', label: 'Pedidos', icon: '☰' },
  { id: 'caja', label: 'Cierre de caja', icon: '💵' },
  { id: 'restaurantes', label: 'Restaurantes', icon: '⌂' },
  { id: 'repartidores', label: 'Repartidores', icon: '➜' },
  { id: 'usuarios', label: 'Usuarios', icon: '◎' },
  { id: 'menu', label: 'Menú', icon: '🍽' },
  { id: 'inventario', label: 'Inventario', icon: '📦' },
]

const ADMIN_ONLY_NAV_ITEM = { id: 'equipo', label: 'Equipo', icon: '🔑' }

export default function Sidebar({ active, onNavigate, isAdmin, nombre, onLogout }) {
  const items = isAdmin ? [...NAV_ITEMS, ADMIN_ONLY_NAV_ITEM] : NAV_ITEMS

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
        {items.map((item) => (
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
        {nombre && (
          <>
            <p>Conectado como</p>
            <p className="mono sidebar__project">{nombre}</p>
            <button className="btn-secondary" style={{ marginTop: '8px' }} onClick={onLogout}>
              Cerrar sesión
            </button>
          </>
        )}
      </div>
    </aside>
  )
}

