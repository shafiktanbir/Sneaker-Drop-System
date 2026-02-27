import React, { useState } from 'react';
import { StockDisplay } from './StockDisplay';
import { ActivityFeed } from './ActivityFeed';
import { api } from '../api/client';
import { useToast } from '../context/ToastContext';

export function DropCard({
  drop,
  stock,
  connected,
  username,
  userReservation,
  onReserved,
  onPurchased,
  onStockUpdate,
}) {
  const [reserveLoading, setReserveLoading] = useState(false);
  const [purchaseLoading, setPurchaseLoading] = useState(false);
  const [countdown, setCountdown] = useState(null);
  const countdownRef = React.useRef(null);
  const { addToast } = useToast();

  const hasReservation = userReservation?.id;
  const expiresAt = userReservation?.expiresAt;

  React.useEffect(() => {
    if (!hasReservation || !expiresAt) {
      setCountdown(null);
      if (countdownRef.current) clearInterval(countdownRef.current);
      return;
    }
    const update = () => {
      const diff = new Date(expiresAt) - Date.now();
      if (diff <= 0) {
        setCountdown(0);
        clearInterval(countdownRef.current);
        onStockUpdate?.();
        return;
      }
      setCountdown(Math.ceil(diff / 1000));
    };
    update();
    countdownRef.current = setInterval(update, 1000);
    return () => clearInterval(countdownRef.current);
  }, [hasReservation, expiresAt, onStockUpdate]);

  const handleReserve = async () => {
    if (!username?.trim()) {
      addToast('Enter your username to reserve', 'error');
      return;
    }
    setReserveLoading(true);
    try {
      const data = await api.reserve(drop.id, username.trim());
      if (data.success) {
        addToast('Reserved! Complete purchase within 60 seconds.', 'success');
        onReserved?.(data.reservation);
      } else {
        addToast(data.message || data.error || 'Reserve failed', 'error');
      }
    } catch (err) {
      addToast(err.message || err.error || 'Reserve failed', 'error');
    } finally {
      setReserveLoading(false);
    }
  };

  const handlePurchase = async () => {
    if (!userReservation?.id || !username?.trim()) return;
    setPurchaseLoading(true);
    try {
      const data = await api.purchase(userReservation.id, username.trim());
      if (data.success) {
        addToast('Purchase completed!', 'success');
        onPurchased?.();
      } else {
        addToast(data.message || data.error || 'Purchase failed', 'error');
        if (data.error === 'RESERVATION_EXPIRED') onReserved?.(null);
      }
    } catch (err) {
      addToast(err.message || err.error || 'Purchase failed', 'error');
      if (err.status === 410) onReserved?.(null);
    } finally {
      setPurchaseLoading(false);
    }
  };

  return (
    <div className="border border-gray-200 rounded-lg p-4 bg-white shadow-sm hover:shadow-md transition-shadow">
      <div className="flex justify-between items-start">
        <div>
          <h3 className="font-semibold text-lg text-gray-900">{drop.name}</h3>
          <p className="text-gray-600 mt-1">${Number(drop.price).toFixed(2)}</p>
        </div>
        <StockDisplay stock={stock} connected={connected} />
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {!hasReservation ? (
          <button
            onClick={handleReserve}
            disabled={stock === 0 || reserveLoading}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
          >
            {reserveLoading ? 'Reserving...' : 'Reserve'}
          </button>
        ) : (
          <>
            <button
              onClick={handlePurchase}
              disabled={purchaseLoading || countdown === 0}
              className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
            >
              {purchaseLoading ? 'Processing...' : 'Complete Purchase'}
            </button>
            {countdown !== null && (
              <span
                className={`px-3 py-2 rounded text-sm ${
                  countdown <= 10 ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-700'
                }`}
              >
                {countdown}s left
              </span>
            )}
          </>
        )}
      </div>

      <ActivityFeed topPurchasers={drop.topPurchasers} />
    </div>
  );
}
