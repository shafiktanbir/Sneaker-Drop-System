import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || '';

export function useSocket(onStockUpdated, onPurchaseCompleted) {
  const [connected, setConnected] = useState(false);
  const socketRef = useRef(null);
  const onStockRef = useRef(onStockUpdated);
  const onPurchaseRef = useRef(onPurchaseCompleted);
  onStockRef.current = onStockUpdated;
  onPurchaseRef.current = onPurchaseCompleted;

  useEffect(() => {
    const url = SOCKET_URL || window.location.origin;
    const socket = io(url, { transports: ['websocket', 'polling'] });
    socketRef.current = socket;

    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));
    socket.on('stockUpdated', (p) => onStockRef.current?.(p));
    socket.on('purchaseCompleted', (p) => onPurchaseRef.current?.(p));

    return () => {
      socket.off('connect');
      socket.off('disconnect');
      socket.off('stockUpdated');
      socket.off('purchaseCompleted');
      socket.disconnect();
      socketRef.current = null;
    };
  }, []);

  return { connected, socket: socketRef.current };
}
