import React, { useState, useEffect, useCallback } from 'react';
import { ToastProvider, useToast } from './context/ToastContext';
import { DropCard } from './components/DropCard';
import { api } from './api/client';
import { useSocket } from './hooks/useSocket';

function AppContent() {
  const [drops, setDrops] = useState([]);
  const [username, setUsername] = useState(() => localStorage.getItem('sneaker_username') || '');
  const [loading, setLoading] = useState(true);
  const { addToast } = useToast();

  const fetchDrops = useCallback(async () => {
    try {
      const data = await api.getDrops(username || undefined);
      setDrops(data.drops || []);
    } catch (err) {
      addToast('Failed to load drops', 'error');
      setDrops([]);
    } finally {
      setLoading(false);
    }
  }, [username, addToast]);

  useEffect(() => {
    if (username) localStorage.setItem('sneaker_username', username);
  }, [username]);

  useEffect(() => {
    fetchDrops();
  }, [fetchDrops]);

  const handleStockUpdate = useCallback(({ dropId, availableStock }) => {
    setDrops((prev) =>
      prev.map((d) => (d.id === dropId ? { ...d, availableStock } : d))
    );
  }, []);

  const handlePurchaseCompleted = useCallback(({ dropId, topPurchasers }) => {
    setDrops((prev) =>
      prev.map((d) => (d.id === dropId ? { ...d, topPurchasers } : d))
    );
  }, []);

  const { connected } = useSocket(handleStockUpdate, handlePurchaseCompleted);

  const handleReserved = useCallback(() => {
    fetchDrops();
  }, [fetchDrops]);

  const handlePurchased = useCallback(() => {
    fetchDrops();
  }, [fetchDrops]);

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <h1 className="text-2xl font-bold text-gray-900">Limited Edition Sneaker Drop</h1>
          <div className="mt-2 flex items-center gap-4">
            <label className="text-sm text-gray-600">Your username:</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter username"
              className="border border-gray-300 rounded px-3 py-1.5 text-sm w-48"
            />
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6">
        {loading ? (
          <div className="text-gray-500">Loading drops...</div>
        ) : drops.length === 0 ? (
          <div className="bg-white rounded-lg p-8 text-center text-gray-500">
            No active drops. Use the API to create one: POST /api/drops
          </div>
        ) : (
          <div className="grid gap-4">
            {drops.map((drop) => (
              <DropCard
                key={drop.id}
                drop={drop}
                stock={drop.availableStock}
                connected={connected}
                username={username}
                userReservation={drop.userReservation}
                onReserved={handleReserved}
                onPurchased={handlePurchased}
                onStockUpdate={() => fetchDrops()}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <AppContent />
    </ToastProvider>
  );
}
