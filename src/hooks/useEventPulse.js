/**
 * useEventPulse.js
 * React hook connecting to the real-time Live Event Pulse WebSocket stream (/ws/events).
 * Manages automatic reconnection with exponential backoff, dead connection handling,
 * and audio debouncing.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { getAuthToken } from '../api';

export function useEventPulse({ onEvent, onSync, soundEnabled = false } = {}) {
  const [isConnected, setIsConnected] = useState(false);
  const [daemonStatus, setDaemonStatus] = useState(null);
  const wsRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const retryCountRef = useRef(0);
  const lastSoundTimeRef = useRef(0);

  // Play audio alert with debouncing (max once per 3s)
  const triggerAudioAlert = useCallback((severity) => {
    if (!soundEnabled) return;
    const now = Date.now();
    if (now - lastSoundTimeRef.current < 3000) return;
    lastSoundTimeRef.current = now;

    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();

      osc.type = severity === 'critical' ? 'sawtooth' : 'sine';
      osc.frequency.setValueAtTime(severity === 'critical' ? 880 : 587, audioCtx.currentTime);
      gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.4);

      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.4);
    } catch {}
  }, [soundEnabled]);

  useEffect(() => {
    let isMounted = true;

    const connectWebSocket = () => {
      if (!isMounted) return;

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = window.location.host;
      const token = getAuthToken() || '';
      const wsUrl = `${protocol}//${host}/ws/events?token=${encodeURIComponent(token)}`;

      try {
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          if (!isMounted) return;
          setIsConnected(true);
          retryCountRef.current = 0;
        };

        ws.onmessage = (event) => {
          if (!isMounted) return;
          try {
            const parsed = JSON.parse(event.data);

            if (parsed.type === 'sync') {
              if (parsed.data?.status) {
                setDaemonStatus(parsed.data.status);
              }
              if (typeof onSync === 'function') {
                onSync(parsed.data);
              }
            } else if (parsed.type === 'event') {
              const eventData = parsed.data;
              if (eventData.severity === 'critical') {
                triggerAudioAlert(eventData.severity);
              }
              if (typeof onEvent === 'function') {
                onEvent(eventData);
              }
            }
          } catch (err) {
            console.warn('[useEventPulse] Ошибка разбора WebSocket сообщения:', err);
          }
        };

        ws.onclose = (event) => {
          if (!isMounted) return;
          setIsConnected(false);
          wsRef.current = null;

          // Exponential backoff with random jitter (1s - 15s)
          const baseDelay = Math.min(1000 * Math.pow(1.5, retryCountRef.current), 15000);
          const jitter = baseDelay * (0.8 + Math.random() * 0.4);
          retryCountRef.current++;

          reconnectTimeoutRef.current = setTimeout(connectWebSocket, jitter);
        };

        ws.onerror = () => {
          ws.close();
        };
      } catch (err) {
        console.warn('[useEventPulse] Ошибка подключения к /ws/events:', err);
      }
    };

    connectWebSocket();

    return () => {
      isMounted = false;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close(1000, 'Unmounted');
        wsRef.current = null;
      }
    };
  }, [onEvent, onSync, triggerAudioAlert]);

  return {
    isConnected,
    daemonStatus
  };
}
