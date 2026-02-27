import React from 'react';

export function StockDisplay({ stock, connected }) {
  return (
    <div className="flex items-center gap-2">
      <span
        className={`inline-flex items-center px-2 py-0.5 rounded text-sm font-medium ${
          stock === 0 ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'
        }`}
      >
        {stock} in stock
      </span>
      {connected && (
        <span className="inline-flex items-center gap-1 text-xs text-green-600" title="Live updates">
          <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          Live
        </span>
      )}
    </div>
  );
}
