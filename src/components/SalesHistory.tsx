'use client';

import type { Sale } from '@/types/database';

interface SalesHistoryProps {
  sales: Sale[];
  lastUpdated: string | null;
}

export function SalesHistory({ sales, lastUpdated }: SalesHistoryProps) {
  if (sales.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6">
        <h3 className="text-lg font-semibold mb-4">Sales History</h3>
        <p className="text-gray-500">No recorded sales found.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold">Sales History</h3>
        <a
          href="https://data.cityofnewyork.us/City-Government/ACRIS-Real-Property-Master/bnx9-e6tj"
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-blue-600 hover:underline"
        >
          View on NYC Open Data
        </a>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b">
              <th className="text-left py-2 pr-4 text-sm font-medium text-gray-500">Date</th>
              <th className="text-right py-2 pr-4 text-sm font-medium text-gray-500">Price</th>
              <th className="text-left py-2 pr-4 text-sm font-medium text-gray-500">Seller</th>
              <th className="text-left py-2 text-sm font-medium text-gray-500">Buyer</th>
            </tr>
          </thead>
          <tbody>
            {sales.slice(0, 5).map((sale, idx) => (
              <tr key={sale.document_id || idx} className="border-b border-gray-100">
                <td className="py-3 pr-4">
                  {new Date(sale.sale_date).toLocaleDateString()}
                </td>
                <td className="py-3 pr-4 text-right font-semibold">
                  ${sale.sale_price.toLocaleString()}
                </td>
                <td className="py-3 pr-4 text-sm text-gray-600 max-w-[150px] truncate">
                  {sale.seller_name || '-'}
                </td>
                <td className="py-3 text-sm text-gray-600 max-w-[150px] truncate">
                  {sale.buyer_name || '-'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {lastUpdated && (
        <div className="mt-4 text-xs text-gray-400">
          Data as of {new Date(lastUpdated).toLocaleDateString()}
        </div>
      )}
    </div>
  );
}
