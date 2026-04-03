import { useCallback, useEffect, useRef, useState } from 'react';
import { getWebSocketUrl } from '../utils/serverOrigin';

const UNREACHABLE_AFTER_MS = 10000;
const PING_INTERVAL_MS = 5000;

export type WsMessage = Record<string, unknown>;

export type ConnectionStatus = 'connecting' | 'connected' | 'unreachable';

export function useWebSocket(onMessage: (msg: WsMessage) => void) {
  const [ready, setReady] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('connecting');
  const [pingMs, setPingMs] = useState<number | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const onMessageRef = useRef(onMessage);
  const unreachableTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  onMessageRef.current = onMessage;

  /** Close the socket; the usual onclose handler reconnects after a short delay (fast reset). */
  const forceReconnect = useCallback(() => {
    setPingMs(null);
    try {
      wsRef.current?.close();
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const connect = () => {
      if (cancelled) return;
      setConnectionStatus('connecting');
      if (unreachableTimerRef.current) {
        clearTimeout(unreachableTimerRef.current);
        unreachableTimerRef.current = null;
      }
      unreachableTimerRef.current = setTimeout(() => {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
          setConnectionStatus('unreachable');
        }
        unreachableTimerRef.current = null;
      }, UNREACHABLE_AFTER_MS);

      const ws = new WebSocket(getWebSocketUrl());
      wsRef.current = ws;
      let pingInterval: ReturnType<typeof setInterval> | null = null;
      ws.onopen = () => {
        if (unreachableTimerRef.current) {
          clearTimeout(unreachableTimerRef.current);
          unreachableTimerRef.current = null;
        }
        setReady(true);
        setConnectionStatus('connected');
        pingInterval = setInterval(() => {
          if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ type: 'ping', t: Date.now() }));
          }
        }, PING_INTERVAL_MS);
      };
      ws.onclose = () => {
        if (pingInterval) {
          clearInterval(pingInterval);
          pingInterval = null;
        }
        setReady(false);
        setPingMs(null);
        setConnectionStatus('connecting');
        if (!cancelled) setTimeout(connect, 2000);
      };
      ws.onerror = () => {};
      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data) as WsMessage;
          if (msg.type === 'pong' && typeof msg.t === 'number') {
            setPingMs(Math.max(0, Date.now() - msg.t));
          }
          onMessageRef.current(msg);
        } catch {
          /* ignore */
        }
      };
    };
    connect();
    return () => {
      cancelled = true;
      if (unreachableTimerRef.current) clearTimeout(unreachableTimerRef.current);
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      setReady(false);
      setConnectionStatus('connecting');
      setPingMs(null);
    };
  }, []);

  /** Stable identity — VoicePanel and others subscribe to this in effect deps; must not change every render (e.g. on pingMs pong updates). */
  const send = useCallback((msg: WsMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  return { send, ready, connectionStatus, pingMs, forceReconnect };
}
