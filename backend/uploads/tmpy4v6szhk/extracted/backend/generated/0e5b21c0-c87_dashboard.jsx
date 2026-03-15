import React, { useState, useEffect } from 'react';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, LineElement, PointElement, Title, Tooltip, Legend, ArcElement } from 'chart.js';
import { Bar, Line, Pie } from 'react-chartjs-2';

ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, Title, Tooltip, Legend, ArcElement);

const Dashboard = () => {
  const [data, setData] = useState([]);
  const [stats, setStats] = useState({
    totalUsers: 1250,
    activeUsers: 890,
    revenue: 45670,
    growth: 12.5
  });

  useEffect(() => {
    // Симуляция загрузки данных
    const mockData = [
      { id: 1, name: 'Продукт A', sales: 450, revenue: 12500, category: 'Электроника' },
      { id: 2, name: 'Продукт B', sales: 320, revenue: 8900, category: 'Одежда' },
      { id: 3, name: 'Продукт C', sales: 280, revenue: 6700, category: 'Книги' },
      { id: 4, name: 'Продукт D', sales: 190, revenue: 4500, category: 'Продукты' },
      { id: 5, name: 'Продукт E', sales: 150, revenue: 3200, category: 'Спорт' },
      { id: 6, name: 'Продукт F', sales: 380, revenue: 9800, category: 'Электроника' },
      { id: 7, name: 'Продукт G', sales: 220, revenue: 5600, category: 'Одежда' },
      { id: 8, name: 'Продукт H', sales: 310, revenue: 7800, category: 'Книги' }
    ];
    setData(mockData);
  }, []);

  // Данные для графика продаж
  const salesChartData = {
    labels: ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн'],
    datasets: [
      {
        label: 'Продажи',
        data: [12000, 19000, 15000, 25000, 22000, 30000],
        backgroundColor: 'rgba(54, 162, 235, 0.5)',
        borderColor: 'rgba(54, 162, 235, 1)',
        borderWidth: 2,
      },
      {
        label: 'Прибыль',
        data: [8000, 12000, 10000, 18000, 15000, 22000],
        backgroundColor: 'rgba(75, 192, 192, 0.5)',
        borderColor: 'rgba(75, 192, 192, 1)',
        borderWidth: 2,
      }
    ]
  };

  // Данные для линейного графика
  const lineChartData = {
    labels: ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'],
    datasets: [
      {
        label: 'Посетители',
        data: [650, 890, 720, 940, 1100, 850, 600],
        borderColor: 'rgba(255, 99, 132, 1)',
        backgroundColor: 'rgba(255, 99, 132, 0.2)',
        tension: 0.4,
      },
      {
        label: 'Просмотры',
        data: [2800, 3200, 2900, 3500, 4200, 3100, 2400],
        borderColor: 'rgba(54, 162, 235, 1)',
        backgroundColor: 'rgba(54, 162, 235, 0.2)',
        tension: 0.4,
      }
    ]
  };

  // Данные для круговой диаграммы
  const pieChartData = {
    labels: ['Электроника', 'Одежда', 'Книги', 'Продукты', 'Спорт'],
    datasets: [
      {
        data: [35, 25, 20, 12, 8],
        backgroundColor: [
          'rgba(255, 99, 132, 0.8)',
          'rgba(54, 162, 235, 0.8)',
          'rgba(255, 206, 86, 0.8)',
          'rgba(75, 192, 192, 0.8)',
          'rgba(153, 102, 255, 0.8)',
        ],
        borderWidth: 2,
        borderColor: '#fff',
      }
    ]
  };

  const chartOptions = {
    responsive: true,
    plugins: {
      legend: {
        position: 'top',
      },
      title: {
        display: true,
        text: 'Статистика продаж',
      },
    },
  };

  return (
    <div style={{ padding: '20px', fontFamily: 'Arial, sans-serif', backgroundColor: '#f5f5f5' }}>
      <h1 style={{ textAlign: 'center', color: '#333', marginBottom: '30px' }}>Аналитический Дашборд</h1>
      
      {/* Статистические карточки */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px', marginBottom: '30px' }}>
        <div style={{ backgroundColor: '#fff', padding: '20px', borderRadius: '10px', boxShadow: '0 2px 10px rgba(0,0,0,0.1)' }}>
          <h3 style={{ color: '#666', margin: '0 0 10px 0' }}>Всего пользователей</h3>
          <p style={{ fontSize: '24px', fontWeight: 'bold', color: '#333', margin: '0' }}>{stats.totalUsers.toLocaleString()}</p>
        </div>
        <div style={{ backgroundColor: '#fff', padding: '20px', borderRadius: '10px', boxShadow: '0 2px 10px rgba(0,0,0,0.1)' }}>
          <h3 style={{ color: '#666', margin: '0 0 10px 0' }}>Активные пользователи</h3>
          <p style={{ fontSize: '24px', fontWeight: 'bold', color: '#4CAF50', margin: '0' }}>{stats.activeUsers.toLocaleString()}</p>
        </div>
        <div style={{ backgroundColor: '#fff', padding: '20px', borderRadius: '10px', boxShadow: '0 2px 10px rgba(0,0,0,0.1)' }}>
          <h3 style={{ color: '#666', margin: '0 0 10px 0' }}>Доход</h3>
          <p style={{ fontSize: '24px', fontWeight: 'bold', color: '#2196F3', margin: '0' }}>${stats.revenue.toLocaleString()}</p>
        </div>
        <div style={{ backgroundColor: '#fff', padding: '20px', borderRadius: '10px', boxShadow: '0 2px 10px rgba(0,0,0,0.1)' }}>
          <h3 style={{ color: '#666', margin: '0 0 10px 0' }}>Рост</h3>
          <p style={{ fontSize: '24px', fontWeight: 'bold', color: '#FF9800', margin: '0' }}>{stats.growth}%</p>
        </div>
      </div>

      {/* Графики */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '20px', marginBottom: '30px' }}>
        <div style={{ backgroundColor: '#fff', padding: '20px', borderRadius: '10px', boxShadow: '0 2px 10px rgba(0,0,0,0.1)' }}>
          <h3 style={{ color: '#333', marginBottom: '15px''>График продаж</h3>
          <Bar data={salesChartData} options={chartOptions} />
        </div>
        <div style={{ backgroundColor: '#fff', padding: '20px', borderRadius: '10px', boxShadow: '0 2px 10px rgba(0,0,0,0.1)' }}>
          <h3 style={{ color: '#333', marginBottom: '15px' }}>Посетители и просмотры</h3>
          <Line data={lineChartData} options={chartOptions} />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '20px', marginBottom: '30px' }}>
        <div style={{ backgroundColor: '#fff', padding: '20px', borderRadius: '10px', boxShadow: '0 2px 10px rgba(0,0,0,0.1)' }}>
          <h3 style={{ color: '#333', marginBottom: '15px' }}>Распределение по категориям</h3>
          <Pie data={pieChartData} options={chartOptions} />
        </div>
        <div style={{ backgroundColor: '#fff', padding: '20px', borderRadius: '10px', boxShadow: '0 2px 10px rgba(0,0,0,0.1)' }}>
          <h3 style={{ color: '#333', marginBottom: '15px' }}>Быстрая статистика</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
            <div style={{ textAlign: 'center', padding: '15px', backgroundColor: '#f8f9fa', borderRadius: '8px' }}>
              <p style={{ margin: '0', color: '#666' }}>Конверсия</p>
              <p style={{ margin: '5px 0 0 0', fontSize: '20px', fontWeight: 'bold', color: '#4CAF50' }}>3.2%</p>
            </div>
            <div style={{ textAlign: 'center', padding: '15px', backgroundColor: '#f8f9fa', borderRadius: '8px' }}>
              <p style={{ margin: '0', color: '#666' }}>Отказы</p>
              <p style={{ margin: '5px 0 0 0', fontSize: '20px', fontWeight: 'bold', color: '#f44336' }}>24%</p>
            </div>
            <div style={{ textAlign: 'center', padding: '15px', backgroundColor: '#f8f9fa', borderRadius: '8px' }}>
              <p style={{ margin: '0', color: '#666' }}>Ср. чек</p>
              <p style={{ margin: '5px 0 0 0', fontSize: '20px', fontWeight: 'bold', color: '#2196F3' }}>$156</p>
            </div>
            <div style={{ textAlign: 'center', padding: '15px', backgroundColor: '#f8f9fa', borderRadius: '8px' }}>
              <p style={{ margin: '0', color: '#666' }}>LTV</p>
              <p style={{ margin: '5px 0 0 0', fontSize: '20px', fontWeight: 'bold', color: '#FF9800' }}>$892</p>
            </div>
          </div>
        </div>
      </div>

      {/* Таблица данных */}
      <div style={{ backgroundColor: '#fff', padding: '20px', borderRadius: '10px', boxShadow: '0 2px 10px rgba(0,0,0,0.1)' }}>
        <h3 style={{ color: '#333', marginBottom: '15px' }}>Детальная информация о продуктах</h3>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '600px' }}>
            <thead>
              <tr style={{ backgroundColor: '#f8f9fa' }}>
                <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #dee2e6', color: '#495057' }}>ID</th>
                <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #dee2e6', color: '#495057' }}>Название</th>
                <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #dee2e6', color: '#495057' }}>Продажи</th>
                <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #dee2e6', color: '#495057' }}>Доход</th>
                <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #dee2e6', color: '#495057' }}>Категория</th>
              </tr>
            </thead>
            <tbody>
              {data.map((item) => (
                <tr key={item.id} style={{ borderBottom: '1px solid #dee2e6', '&:hover': { backgroundColor: '#f8f9fa' } }}>
                  <td style={{ padding: '12px', color: '#495057' }}>{item.id}</td>
                  <td style={{ padding: '12px', color: '#495057', fontWeight: '500' }}>{item.name}</td>
                  <td style={{ padding: '12px', color: '#495057' }}>{item.sales}</td>
                  <td style={{ padding: '12px', color: '#495057' }}>${item.revenue.toLocaleString()}</td>
                  <td style={{ padding: '12px' }}>
                    <span style={{ 
                      padding: '4px 8px', 
                      borderRadius: '4px', 
                      fontSize: '12px',
                      backgroundColor: '#e9ecef',
                      color: '#495057'
                    }}>
                      {item.category}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;