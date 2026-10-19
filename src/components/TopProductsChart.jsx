import React, { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { db } from '../firebase';
import { collection, query, where, getDocs, Timestamp } from 'firebase/firestore';

export default function TopProductsChart() {
  const [dayData, setDayData] = useState([]);
  const [weekData, setWeekData] = useState([]);
  const [activeTab, setActiveTab] = useState('day');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchProductStats();
    const interval = setInterval(fetchProductStats, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const fetchProductStats = async () => {
    setLoading(true);
    setError(null);
    try {
      const dayStats = await getTopProducts('day');
      setDayData(dayStats);
      const weekStats = await getTopProducts('week');
      setWeekData(weekStats);
    } catch (err) {
      console.error('Error:', err);
      setError('Error al cargar datos');
    }
    setLoading(false);
  };

  const getTopProducts = async (period) => {
    const now = new Date();
    let startDate = new Date();
    
    if (period === 'day') {
      startDate.setHours(0, 0, 0, 0);
    } else {
      const dayOfWeek = now.getDay();
      startDate.setDate(now.getDate() - dayOfWeek);
      startDate.setHours(0, 0, 0, 0);
    }

    try {
      // Buscar órdenes que NO tengan cierreId (están abiertas/activas)
      const q = query(
        collection(db, 'orders'),
        where('createdAt', '>=', Timestamp.fromDate(startDate))
      );
      
      const snapshot = await getDocs(q);
      const productMap = {};

      snapshot.docs.forEach(doc => {
        const order = doc.data();
        
        // Solo contar si NO tiene cierreId (no está cerrada aún)
        // O si quieres contar TODAS, quita esta línea
        if (!order.cierreId && order.items && Array.isArray(order.items)) {
          order.items.forEach(item => {
            const productName = item.nombre || 'Producto desconocido';
            const quantity = parseInt(item.qty) || 1;

            if (!productMap[productName]) {
              productMap[productName] = 0;
            }
            productMap[productName] += quantity;
          });
        }
      });

      return Object.entries(productMap)
        .map(([name, quantity]) => ({
          name: name.length > 22 ? name.substring(0, 22) + '...' : name,
          fullName: name,
          cantidad: quantity
        }))
        .sort((a, b) => b.cantidad - a.cantidad)
        .slice(0, 10);
    } catch (error) {
      console.error(`Error:`, error);
      return [];
    }
  };

  const currentData = activeTab === 'day' ? dayData : weekData;
  const totalVendido = currentData.reduce((sum, item) => sum + item.cantidad, 0);

  const styles = {
    container: {
      width: '100%',
      backgroundColor: '#fff',
      border: '1px solid #e5e7eb',
      borderRadius: '8px',
      padding: '20px',
      boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
      fontFamily: 'system-ui, -apple-system, sans-serif'
    },
    header: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: '20px',
      gap: '16px',
      flexWrap: 'wrap'
    },
    title: {
      fontSize: '18px',
      fontWeight: 'bold',
      color: '#111827',
      margin: '0 0 8px 0',
      display: 'flex',
      alignItems: 'center',
      gap: '8px'
    },
    subtitle: {
      fontSize: '12px',
      color: '#6b7280',
      margin: '8px 0 0 0'
    },
    tabGroup: {
      display: 'flex',
      gap: '8px',
      backgroundColor: '#f3f4f6',
      padding: '4px',
      borderRadius: '8px'
    },
    tab: (isActive) => ({
      padding: '10px 16px',
      borderRadius: '6px',
      fontWeight: '500',
      fontSize: '14px',
      border: 'none',
      cursor: 'pointer',
      transition: 'all 0.2s',
      backgroundColor: isActive ? '#f97316' : 'transparent',
      color: isActive ? '#fff' : '#4b5563',
      boxShadow: isActive ? '0 4px 6px rgba(249, 115, 22, 0.2)' : 'none'
    }),
    loading: {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '48px 20px',
      gap: '8px'
    },
    spinner: {
      width: '32px',
      height: '32px',
      border: '4px solid #fed7aa',
      borderTop: '4px solid #f97316',
      borderRadius: '50%',
      animation: 'spin 1s linear infinite'
    },
    error: {
      backgroundColor: '#fef2f2',
      border: '1px solid #fecaca',
      color: '#991b1b',
      padding: '12px 16px',
      borderRadius: '8px',
      fontSize: '14px'
    },
    chartContainer: {
      width: '100%',
      height: '320px',
      backgroundColor: '#f9fafb',
      borderRadius: '8px',
      padding: '12px',
      marginBottom: '32px'
    },
    ranking: {
      borderTop: '1px solid #e5e7eb',
      paddingTop: '16px'
    },
    rankingTitle: {
      fontSize: '14px',
      fontWeight: 'bold',
      color: '#374151',
      marginBottom: '12px',
      display: 'flex',
      alignItems: 'center',
      gap: '8px'
    },
    rankingItem: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '12px',
      backgroundColor: 'linear-gradient(to right, #fff7ed, transparent)',
      borderRadius: '8px',
      border: '1px solid #fed7aa',
      marginBottom: '8px',
      transition: 'box-shadow 0.2s'
    },
    rankingLeft: {
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      flex: 1
    },
    rankingMedal: {
      fontSize: '24px'
    },
    rankingName: {
      fontSize: '14px',
      fontWeight: '500',
      color: '#111827'
    },
    rankingRight: {
      textAlign: 'right'
    },
    rankingValue: {
      fontSize: '20px',
      fontWeight: 'bold',
      color: '#f97316'
    },
    rankingUnit: {
      fontSize: '11px',
      color: '#6b7280'
    },
    refreshBtn: {
      marginTop: '16px',
      display: 'flex',
      justifyContent: 'center'
    },
    refreshLink: {
      fontSize: '12px',
      color: '#6b7280',
      cursor: 'pointer',
      padding: '8px 12px',
      borderRadius: '6px',
      border: 'none',
      backgroundColor: 'transparent',
      transition: 'all 0.2s',
      display: 'flex',
      alignItems: 'center',
      gap: '4px'
    }
  };

  return (
    <div style={styles.container}>
      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>

      <div style={styles.header}>
        <div>
          <h3 style={styles.title}>🏆 Productos Más Vendidos</h3>
          <p style={styles.subtitle}>
            Total: <span style={{fontWeight: 'bold', color: '#f97316'}}>{totalVendido}</span> unidades
          </p>
        </div>
        <div style={styles.tabGroup}>
          <button
            onClick={() => setActiveTab('day')}
            style={styles.tab(activeTab === 'day')}
          >
            📅 Hoy
          </button>
          <button
            onClick={() => setActiveTab('week')}
            style={styles.tab(activeTab === 'week')}
          >
            📊 Semana
          </button>
        </div>
      </div>

      {loading && (
        <div style={styles.loading}>
          <div style={styles.spinner}></div>
          <p style={{fontSize: '14px', color: '#6b7280', margin: 0}}>Cargando...</p>
        </div>
      )}

      {error && <div style={styles.error}>⚠️ {error}</div>}

      {!loading && !error && currentData.length === 0 && (
        <div style={{textAlign: 'center', padding: '48px 20px', color: '#6b7280'}}>
          Sin datos disponibles
        </div>
      )}

      {!loading && !error && currentData.length > 0 && (
        <>
          <div style={styles.chartContainer}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={currentData}
                margin={{ top: 20, right: 30, left: 0, bottom: 80 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                <XAxis
                  dataKey="name"
                  angle={-45}
                  textAnchor="end"
                  height={120}
                  tick={{ fontSize: 11, fill: '#6b7280' }}
                  interval={0}
                />
                <YAxis tick={{ fontSize: 11, fill: '#6b7280' }} />
                <Tooltip
                  formatter={(value) => [`${value} unid.`, 'Vendidas']}
                  labelFormatter={(label) => `Producto: ${label}`}
                  contentStyle={{
                    backgroundColor: '#fff',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    padding: '8px 12px',
                    fontSize: '12px',
                    boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
                  }}
                />
                <Bar
                  dataKey="cantidad"
                  fill="#f97316"
                  radius={[8, 8, 0, 0]}
                  animationDuration={600}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div style={styles.ranking}>
            <h4 style={styles.rankingTitle}>🥇 Top 5 Productos</h4>
            {currentData.slice(0, 5).map((product, idx) => {
              const medals = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣'];
              return (
                <div key={product.fullName} style={styles.rankingItem}>
                  <div style={styles.rankingLeft}>
                    <span style={styles.rankingMedal}>{medals[idx]}</span>
                    <p style={styles.rankingName}>{product.fullName}</p>
                  </div>
                  <div style={styles.rankingRight}>
                    <p style={styles.rankingValue}>{product.cantidad}</p>
                    <p style={styles.rankingUnit}>unidades</p>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {!loading && (
        <div style={styles.refreshBtn}>
          <button
            onClick={fetchProductStats}
            style={styles.refreshLink}
            onMouseEnter={(e) => e.target.style.backgroundColor = '#f3f4f6'}
            onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
          >
            <span>🔄</span> Actualizar ahora
          </button>
        </div>
      )}
    </div>
  );
}
