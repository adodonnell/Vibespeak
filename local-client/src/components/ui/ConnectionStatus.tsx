import React, { memo, useEffect, useState } from 'react';
import './ConnectionStatus.css';

export type ConnectionState = 'connected' | 'connecting' | 'disconnected' | 'reconnecting';

interface ConnectionStatusProps {
  state: ConnectionState;
  reconnectAttempts?: number;
}

export const ConnectionStatus: React.FC<ConnectionStatusProps> = memo(({ state, reconnectAttempts = 0 }) => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Show when not connected
    if (state !== 'connected') {
      setVisible(true);
    } else {
      // Fade out after connection
      const timer = setTimeout(() => setVisible(false), 500);
      return () => clearTimeout(timer);
    }
  }, [state]);

  if (!visible) return null;

  return (
    <div className={`connection-status connection-status-${state}`}>
      {state === 'connecting' && (
        <>
          <div className="connection-spinner" />
          <span>Connecting…</span>
        </>
      )}
      {state === 'disconnected' && (
        <>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M23.64 7c-.45-.34-4.93-4-11.64-4-1.5 0-2.89.19-4.15.48L18.18 13.8 23.64 7zm-6.6 8.22L3.27 1.44 2 2.72l2.05 2.06C1.91 5.76.59 6.82.36 7L12 21.5l3.04-3.91 3.79 3.79L20 19.77l-2.96-3.55z"/>
          </svg>
          <span>Disconnected</span>
        </>
      )}
      {state === 'reconnecting' && (
        <>
          <div className="connection-spinner" />
          <span>Reconnecting ({reconnectAttempts})…</span>
        </>
      )}
    </div>
  );
});

ConnectionStatus.displayName = 'ConnectionStatus';

export default ConnectionStatus;