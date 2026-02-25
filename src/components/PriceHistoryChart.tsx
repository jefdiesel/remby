'use client';

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import type { Sale } from '@/types/database';

interface PriceHistoryChartProps {
  sales: Sale[];
}

export function PriceHistoryChart({ sales }: PriceHistoryChartProps) {
  if (sales.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6">
        <h3 className="text-lg font-semibold mb-4">Price History</h3>
        <p className="text-gray-500">No sales data available for chart.</p>
      </div>
    );
  }

  // Sort by date ascending for the chart
  const sortedSales = [...sales]
    .sort((a, b) => new Date(a.sale_date).getTime() - new Date(b.sale_date).getTime())
    .map(sale => ({
      date: new Date(sale.sale_date).toLocaleDateString('en-US', {
        month: 'short',
        year: '2-digit',
      }),
      price: sale.sale_price,
      fullDate: new Date(sale.sale_date).toLocaleDateString(),
    }));

  const formatPrice = (value: number) => {
    if (value >= 1000000) {
      return `$${(value / 1000000).toFixed(1)}M`;
    } else if (value >= 1000) {
      return `$${(value / 1000).toFixed(0)}K`;
    }
    return `$${value}`;
  };

  const CustomTooltip = ({ active, payload }: { active?: boolean; payload?: Array<{ payload: { fullDate: string; price: number } }> }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3">
          <p className="text-sm text-gray-600">{payload[0].payload.fullDate}</p>
          <p className="text-lg font-bold text-blue-600">
            ${payload[0].payload.price.toLocaleString()}
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h3 className="text-lg font-semibold mb-4">Price History</h3>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={sortedSales} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 12 }}
              stroke="#9ca3af"
            />
            <YAxis
              tickFormatter={formatPrice}
              tick={{ fontSize: 12 }}
              stroke="#9ca3af"
              width={60}
            />
            <Tooltip content={<CustomTooltip />} />
            <Line
              type="monotone"
              dataKey="price"
              stroke="#3b82f6"
              strokeWidth={2}
              dot={{ fill: '#3b82f6', strokeWidth: 2, r: 4 }}
              activeDot={{ r: 6, fill: '#2563eb' }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
