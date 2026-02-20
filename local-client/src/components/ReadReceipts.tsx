import { useState, useEffect, useRef } from 'react';
import { apiClient } from '../services/api-client';

interface ReadReceiptsProps {
  channelId: number;
  messageId: number;
  currentUserId?: number;
}

interface ReadState {
  userId: number;
  username: string;
  readAt: Date;
}

export default function ReadReceipts({ channelId, messageId, currentUserId }: ReadReceiptsProps) {
  const [readers, setReaders] = useState<ReadState[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (channelId && messageId) {
      loadReadReceipts();
    }
  }, [channelId, messageId]);

  const loadReadReceipts = async () => {
    setLoading(true);
    try {
      // In a real implementation, this would query which users have read up to this message
      // For now, we'll show the current user's read state
      const readState = await apiClient.getChannelReadState(channelId);
      if (readState.message_id && readState.read_at) {
        const hasRead = messageId <= readState.message_id;
        if (hasRead) {
          setReaders([{
            userId: currentUserId || 0,
            username: 'You',
            readAt: new Date(readState.read_at)
          }]);
        } else {
          setReaders([]);
        }
      }
    } catch (err) {
      console.error('Failed to load read receipts:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading || readers.length === 0) {
    return null;
  }

  return (
    <div className="read-receipts">
      <span className="read-icon">✓✓</span>
      <span className="read-count">
        {readers.length === 1 ? '1 read' : `${readers.length} reads`}
      </span>
    </div>
  );
}

// Hook for tracking read state in a channel
export function useReadReceipts(channelId: number | null, messageId: number) {
  const [unreadCount, setUnreadCount] = useState(0);
  const [lastReadMessageId, setLastReadMessageId] = useState<number | null>(null);

  useEffect(() => {
    if (!channelId) return;
    loadReadState();
  }, [channelId]);

  useEffect(() => {
    if (lastReadMessageId && messageId) {
      setUnreadCount(messageId - lastReadMessageId);
    }
  }, [messageId, lastReadMessageId]);

  const loadReadState = async () => {
    if (!channelId) return;
    try {
      const readState = await apiClient.getChannelReadState(channelId);
      setLastReadMessageId(readState.message_id);
    } catch (err) {
      console.error('Failed to load read state:', err);
    }
  };

  const markAsRead = async (messageId: number) => {
    if (!channelId) return;
    try {
      await apiClient.markChannelRead(channelId, messageId);
      setLastReadMessageId(messageId);
      setUnreadCount(0);
    } catch (err) {
      console.error('Failed to mark as read:', err);
    }
  };

  return {
    unreadCount,
    lastReadMessageId,
    markAsRead,
  };
}
