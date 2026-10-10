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
    
    // Refresh cada 5 minutos
    const interval = setInterval(fetchProductStats, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const fetchProductStats = async () => {
    setLoading(true);
    setError(null);
    try {
      // Estadísticas del día
      const dayStats = await getTopProducts('day');
      setDayData(dayStats);

      // Estadísticas de la semana
      const weekStats = await getTopProducts('week');
      setWeekData(weekStats);
    } catch (err) {
      console.error('Error al obtener estadísticas:', err);
      setError('Error al cargar los datos');
    }
    setLoading(false);
  };

  const getTopProducts = async (period) => {
    const now = new Date();
    let startDate = new Date();

    // Calcular fecha de inicio según período
    if (period === 'day') {
      // Hoy desde las 00:00
      startDate.setHours(0, 0, 0, 0);
    } else if (period === 'week') {
      // Desde el domingo de esta semana a las 00:00
      const dayOfWeek = now.getDay();
      startDate.setDate(now.getDate() - dayOfWeek);
      startDate.setHours(0, 0, 0, 0);
    }

    try {
      // Query: órdenes completadas después de la fecha de inicio
      const q = query(
        collection(db, 'orders'),
        where('status', '==', 'completed'),
        where('timestamp', '>=', Timestamp.fromDate(startDate))
      );

      const snapshot = await getDocs(q);
      const productMap = {};

      // Procesar cada orden y sumar cantidades por producto
      snapshot.docs.forEach(doc => {
        const order = doc.data();
        
        if (order.items && Array.isArray(order.items)) {
          order.items.forEach(item => {
            const productName = item.name || 'Producto desconocido';
            const quantity = parseInt(item.quantity) || 1;

            if (!productMap[productName]) {
              productMap[productName] = 0;
            }
            productMap[productName] += quantity;
          });
        }
      });

      // Convertir a array, ordenar y limitar a top 10
      const sorted = Object.entries(productMap)
        .map(([name, quantity]) => ({
          name: name.length > 22 ? name.substring(0, 22) + '...' : name,
          fullName: name,
          cantidad: quantity
        }))
        .sort((a, b) => b.cantidad - a.cantidad)
        .slice(0, 10);

      return sorted;
    } catch (error) {
      console.error(`Error en getTopProducts (${period}):`, error);
      return [];
    }
  };

  const currentData = activeTab === 'day' ? dayData : weekData;
  const totalVendido = currentData.reduce((sum, item) => sum + item.cantidad, 0);

  return (
    <div className="w-full bg-white border border-gray-200 rounded-lg p-5 shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <span>🏆</span>
            Productos Más Vendidos
          </h3>
          <p className="text-xs text-gray-500 mt-1">
            Total: <span className="font-semibold text-orange-600">{totalVendido}</span> unidades
          </p>
        </div>

        {/* Botones Día/Semana */}
        <div className="flex gap-2 bg-gray-100 p-1 rounded-lg">
          <button
            onClick={() => setActiveTab('day')}
            className={`px-4 py-2 rounded font-medium text-sm transition-all ${
              activeTab === 'day'
                ? 'bg-orange-500 text-white shadow-md'
                : 'bg-transparent text-gray-600 hover:text-gray-900'
            }`}
          >
            📅 Hoy
          </button>
          <button
            onClick={() => setActiveTab('week')}
            className={`px-4 py-2 rounded font-medium text-sm transition-all ${
              activeTab === 'week'
                ? 'bg-orange-500 text-white shadow-md'
                : 'bg-transparent text-gray-600 hover:text-gray-900'
            }`}
          >
            📊 Semana
          </button>
        </div>
      </div>

      {/* Estados */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <div className="flex flex-col items-center gap-2">
            <div className="w-8 h-8 border-4 border-orange-200 border-t-orange-500 rounded-full animate-spin"></div>
            <p className="text-sm text-gray-500">Cargando...</p>
          </div>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
          ⚠️ {error}
        </div>
      )}

      {!loading && !error && currentData.length === 0 && (
        <div className="text-center py-12">
          <p className="text-gray-500">Sin datos disponibles</p>
        </div>
      )}

      {/* Gráfico de Barras */}
      {!loading && !error && currentData.length > 0 && (
        <div className="mb-8">
          <div className="w-full h-80 bg-gray-50 rounded-lg p-3">
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
                <YAxis
                  tick={{ fontSize: 11, fill: '#6b7280' }}
                />
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
                  isAnimationActive={true}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Tabla de Ranking */}
      {!loading && !error && currentData.length > 0 && (
        <div className="border-t pt-4">
          <h4 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-2">
            <span>🥇</span>
            Top 5 Productos
          </h4>
          <div className="space-y-2">
            {currentData.slice(0, 5).map((product, idx) => {
              const medals = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣'];
              return (
                <div
                  key={product.fullName}
                  className="flex justify-between items-center p-3 bg-gradient-to-r from-orange-50 to-transparent rounded-lg border border-orange-100 hover:shadow-sm transition"
                >
                  <div className="flex items-center gap-3 flex-1">
                    <span className="text-lg">{medals[idx]}</span>
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        {product.fullName}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold text-orange-600">
                      {product.cantidad}
                    </p>
                    <p className="text-xs text-gray-500">unidades</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Botón Refresh */}
      {!loading && (
        <div className="mt-4 flex justify-center">
          <button
            onClick={fetchProductStats}
            className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1 px-3 py-1 rounded hover:bg-gray-100 transition"
          >
            <span>🔄</span>
            Actualizar ahora
          </button>
        </div>
      )}
    </div>
  );
}
