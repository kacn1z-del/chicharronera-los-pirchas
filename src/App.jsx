import { useEffect, useState } from 'react'
import { collection, onSnapshot } from 'firebase/firestore'
import { db } from './firebase'
import Sidebar from './components/Sidebar'
import TopBar from './components/TopBar'
import MetricCard from './components/MetricCard'
import OrdersTable from './components/OrdersTable'
import RestaurantsPanel from './components/RestaurantsPanel'
import RidersPanel from './components/RidersPanel'
import UsersPanel from './components/UsersPanel'
import './App.css'

function useCollectionCount(name) {
  const [count, setCount] = useState(null)
  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, name),
      (snapshot) => setCount(snapshot.size),
      () => setCount(null)
    )
    return () => unsub()
  }, [name])
  return count
}

export default function App() {
  const [section, setSection] = useState('resumen')
  const [connected, setConnected] = useState(true)

  const ordersCount = useCollectionCount('orders')
  const restaurantsCount = useCollectionCount('restaurants')
  const usersCount = useCollectionCount('users')

  return (
    <div className="app-shell">
      <div className="canopy canopy--one" aria-hidden="true" />
      <div className="canopy canopy--two" aria-hidden="true" />

      <Sidebar active={section} onNavigate={setSection} />

      <div className="app-main">
        <TopBar section={section} connected={connected} />

        <main className="app-content">
          {section === 'resumen' && (
            <>
              <div className="metrics-grid">
                <MetricCard
                  label="Pedidos totales"
                  value={ordersCount ?? '—'}
                  hint="Documentos en la colección orders"
                />
                <MetricCard
                  label="Restaurantes"
                  value={restaurantsCount ?? '—'}
                  hint="Locales registrados"
                  tone="mint"
                />
                <MetricCard
                  label="Usuarios"
                  value={usersCount ?? '—'}
                  hint="Clientes registrados"
                  tone="amber"
                />
              </div>

              <section className="section-block">
                <h2 className="section-block__title">Pedidos recientes</h2>
                <OrdersTable onConnectionChange={setConnected} />
              </section>
            </>
          )}

          {section === 'pedidos' && (
            <section className="section-block">
              <h2 className="section-block__title">Todos los pedidos</h2>
              <OrdersTable onConnectionChange={setConnected} />
            </section>
          )}

          {section === 'restaurantes' && (
            <section className="section-block">
              <h2 className="section-block__title">Restaurantes registrados</h2>
              <RestaurantsPanel />
            </section>
          )}

          {section === 'repartidores' && (
            <section className="section-block">
              <h2 className="section-block__title">Repartidores en línea</h2>
              <RidersPanel />
            </section>
          )}

          {section === 'usuarios' && (
            <section className="section-block">
              <h2 className="section-block__title">Usuarios registrados</h2>
              <UsersPanel />
            </section>
          )}
        </main>
      </div>
    </div>
  )
}
