import React from 'react';

export function ActivityFeed({ topPurchasers }) {
  if (!topPurchasers?.length) {
    return (
      <div className="text-xs text-gray-500 mt-2">No purchases yet</div>
    );
  }
  return (
    <div className="mt-2 pt-2 border-t border-gray-200">
      <div className="text-xs font-medium text-gray-600 mb-1">Recent purchasers</div>
      <ul className="text-xs text-gray-500 space-y-0.5">
        {topPurchasers.map((p, i) => (
          <li key={i}>
            <span className="font-medium text-gray-700">{p.username}</span>
            {' · '}
            {new Date(p.purchasedAt).toLocaleString()}
          </li>
        ))}
      </ul>
    </div>
  );
}
