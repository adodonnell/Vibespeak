import React, { useEffect, useState } from 'react';
import { apiClient } from '../../services/api-client';

export interface PinnedMessage {
  id: number;
  message_id: number;
  message_content: string;
  username: string;
  display_name: string | null;
  pinned_at: string;
}

interface PinboardProps {
  channelId: number | null;
  isOpen: boolean;
  onToggle?: () => void;
  onUnpin?: (messageId: number) => void;
}

const Pinboard: React.FC<PinboardProps> = ({
  channelId,
  isOpen,
  onToggle,
  onUnpin,
}) => {
  const [pinnedMessages, setPinnedMessages] = useState<PinnedMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch pinned messages when channel changes
  useEffect(() => {
    if (channelId && isOpen) {
      loadPinnedMessages();
    }
  }, [channelId, isOpen]);

  const loadPinnedMessages = async () => {
    if (!channelId) return;
    setLoading(true);
    setError(null);
    try {
      const pins = await apiClient.getPinnedMessages(channelId);
      setPinnedMessages(pins);
    } catch (err) {
      console.error('Failed to load pinned messages:', err);
      setError('Failed to load pinned messages');
    } finally {
      setLoading(false);
    }
  };

  const handleUnpin = async (messageId: number) => {
    if (!channelId) return;
    try {
      await apiClient.unpinMessage(channelId, messageId);
      setPinnedMessages(prev => prev.filter(p => p.message_id !== messageId));
      onUnpin?.(messageId);
    } catch (err) {
      console.error('Failed to unpin message:', err);
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  if (!isOpen) {
    return (
      <div 
        className="pinboard collapsed"
        onClick={onToggle}
        style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      >
        <span style={{ writingMode: 'vertical-rl', textOrientation: 'mixed', color: 'var(--text-muted)' }}>
          📌 Pinboard {pinnedMessages.length > 0 && `(${pinnedMessages.length})`}
        </span>
      </div>
    );
  }

  return (
    <div className="pinboard">
      <div className="pinboard-header">
        <span>📌 Pinboard {pinnedMessages.length > 0 && `(${pinnedMessages.length})`}</span>
        <button className="pinboard-toggle" onClick={onToggle}>
          ◀
        </button>
      </div>
      
      <div className="pinboard-content">
        {loading && (
          <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '20px', fontSize: '12px' }}>
            Loading...
          </div>
        )}
        
        {error && (
          <div style={{ textAlign: 'center', color: 'var(--text-danger)', padding: '20px', fontSize: '12px' }}>
            {error}
          </div>
        )}

        {!loading && !error && pinnedMessages.length === 0 && (
          <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '20px', fontSize: '12px' }}>
            <p>No pinned messages</p>
            <p style={{ marginTop: '8px', opacity: 0.7 }}>Click the pin icon on a message to pin it here</p>
          </div>
        )}

        {!loading && !error && pinnedMessages.map(pin => (
          <div key={pin.id} className="pinboard-item" style={{
            padding: '10px',
            borderBottom: '1px solid var(--bg-modifier-accent)',
            position: 'relative'
          }}>
            <div className="pinboard-item-header" style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '6px'
            }}>
              <span className="pinboard-item-author" style={{
                fontSize: '12px',
                fontWeight: 600,
                color: 'var(--text-normal)'
              }}>
                {pin.display_name || pin.username}
              </span>
              <button
                onClick={() => handleUnpin(pin.message_id)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  fontSize: '11px',
                  padding: '2px 6px',
                  borderRadius: '3px'
                }}
                title="Unpin message"
              >
                ✕
              </button>
            </div>
            <div className="pinboard-item-content" style={{
              fontSize: '12px',
              color: 'var(--text-normal)',
              wordBreak: 'break-word',
              lineHeight: 1.4
            }}>
              {pin.message_content}
            </div>
            <div className="pinboard-item-date" style={{
              fontSize: '10px',
              color: 'var(--text-muted)',
              marginTop: '6px'
            }}>
              Pinned {formatDate(pin.pinned_at)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Pinboard;