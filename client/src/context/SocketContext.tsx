import { createContext, useCallback, useContext, useRef, useState } from 'react';
import { useWebSocket, type ConnectionStatus } from '../hooks/useWebSocket';

type Listener = (msg: Record<string, unknown>) => void;
const SocketContext = createContext<{
  send: (msg: Record<string, unknown>) => void;
  ready: boolean;
  connectionStatus: ConnectionStatus;
  pingMs: number | null;
  forceReconnect: () => void;
  subscribe: (listener: Listener) => () => void;
  clientId: string | null;
} | null>(null);

export function SocketProvider({ children }: { children: React.ReactNode }) {
  const listenersRef = useRef<Set<Listener>>(new Set());
  const [clientId, setClientId] = useState<string | null>(null);
  const broadcast = useCallback((msg: Record<string, unknown>) => {
    if (msg.type === 'hello' && typeof msg.clientId === 'string') {
      setClientId(msg.clientId);
    }
    listenersRef.current.forEach((fn) => fn(msg));
  }, []);
  const { send, ready, connectionStatus, pingMs, forceReconnect } = useWebSocket(broadcast);

  const subscribe = useCallback((listener: Listener) => {
    listenersRef.current.add(listener);
    return () => listenersRef.current.delete(listener);
  }, []);

  return (
    <SocketContext.Provider value={{ send, ready, connectionStatus, pingMs, forceReconnect, subscribe, clientId }}>
      {children}
    </SocketContext.Provider>
  );
}

export function useSocket() {
  const ctx = useContext(SocketContext);
  if (!ctx) throw new Error('useSocket must be used inside SocketProvider');
  return ctx;
}
