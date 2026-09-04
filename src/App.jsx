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
import MenuImportPanel from './components/MenuImportPanel'
import MenuEditor from './components/MenuEditor'
import InventoryPanel from './components/InventoryPanel'
import FloorPlanPanel from './components/FloorPlanPanel'
import CashClosingPanel from './components/CashClosingPanel'
import PhoneOrderPanel from './components/PhoneOrderPanel'
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
  const [firestoreConnected, setFirestoreConnected] = useState(true)
  const [browserOnline, setBrowserOnline] = useState(navigator.onLine)
  const [showPhoneOrder, setShowPhoneOrder] = useState(false)

  useEffect(() => {
    const goOnline = () => setBrowserOnline(true)
    const goOffline = () => setBrowserOnline(false)
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [])

  // "Conectado" solo si el navegador tiene señal Y Firestore confirma que
  // está recibiendo datos en vivo — cualquiera de los dos fallando cuenta
  // como sin conexión.
  const connected = browserOnline && firestoreConnected

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
                <OrdersTable onConnectionChange={setFirestoreConnected} />
              </section>
            </>
          )}

          {section === 'salon' && (
            <section className="section-block">
              <h2 className="section-block__title">Distribución del salón</h2>
              <FloorPlanPanel />
            </section>
          )}

          {section === 'pedidos' && (
            <section className="section-block">
              <div className="section-block__head">
                <h2 className="section-block__title">Todos los pedidos</h2>
                <button className="btn-primary" onClick={() => setShowPhoneOrder((v) => !v)}>
                  {showPhoneOrder ? 'Cancelar' : '+ Pedido telefónico'}
                </button>
              </div>
              {showPhoneOrder && (
                <PhoneOrderPanel
                  onCreated={() => setShowPhoneOrder(false)}
                  onCancel={() => setShowPhoneOrder(false)}
                />
              )}
              <OrdersTable onConnectionChange={setFirestoreConnected} />
            </section>
          )}

          {section === 'caja' && (
            <section className="section-block">
              <h2 className="section-block__title">Cierre de caja</h2>
              <CashClosingPanel />
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

          {section === 'menu' && (
            <section className="section-block">
              <h2 className="section-block__title">Administrar menú</h2>
              <MenuImportPanel />
              <div style={{ height: '20px' }} />
              <MenuEditor />
            </section>
          )}

          {section === 'inventario' && (
            <section className="section-block">
              <h2 className="section-block__title">Inventario de productos</h2>
              <InventoryPanel />
            </section>
          )}
        </main>
      </div>
    </div>
  )
}
