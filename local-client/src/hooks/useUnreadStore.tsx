// Unread message tracking store - VibeSpeak unread indicators
// Tracks unread counts per channel and server
// Uses plain objects instead of Map for better Zustand compatibility

import React from 'react';
import { create } from 'zustand';

interface ChannelUnread {
  channelId: number;
  lastReadMessageId: number | null;
  unreadCount: number;
  mentioned: boolean;
}

interface ServerUnreads {
  [channelId: number]: ChannelUnread;
}

interface UnreadState {
  // Plain object map: serverId -> channelId -> ChannelUnread
  unreads: Record<number, ServerUnreads>;
  
  // Total unread mentions
  totalMentions: number;
  
  // Actions
  markChannelRead: (serverId: number, channelId: number, lastMessageId: number) => void;
  incrementUnread: (serverId: number, channelId: number, isMention: boolean) => void;
  getChannelUnread: (serverId: number, channelId: number) => ChannelUnread | undefined;
  getServerUnreadCount: (serverId: number) => number;
  getServerHasMentions: (serverId: number) => boolean;
  clearServerUnreads: (serverId: number) => void;
  clearAllUnreads: () => void;
}

export const useUnreadStore = create<UnreadState>((set, get) => ({
  unreads: {},
  totalMentions: 0,

  markChannelRead: (serverId, channelId, lastMessageId) => {
    set((state) => {
      const serverUnreads = state.unreads[serverId];
      if (!serverUnreads || !serverUnreads[channelId]) {
        return state; // Nothing to mark
      }
      
      const channelUnread = serverUnreads[channelId];
      const wasMentioned = channelUnread.mentioned;
      
      return {
        unreads: {
          ...state.unreads,
          [serverId]: {
            ...serverUnreads,
            [channelId]: {
              ...channelUnread,
              lastReadMessageId: lastMessageId,
              unreadCount: 0,
              mentioned: false,
            },
          },
        },
        totalMentions: wasMentioned ? Math.max(0, state.totalMentions - 1) : state.totalMentions,
      };
    });
  },

  incrementUnread: (serverId, channelId, isMention) => {
    set((state) => {
      const serverUnreads = state.unreads[serverId] || {};
      const existing = serverUnreads[channelId];
      
      const newChannelUnread: ChannelUnread = {
        channelId,
        lastReadMessageId: existing?.lastReadMessageId ?? null,
        unreadCount: (existing?.unreadCount ?? 0) + 1,
        mentioned: existing?.mentioned || isMention,
      };
      
      const wasAlreadyMentioned = existing?.mentioned;
      const newTotalMentions = isMention && !wasAlreadyMentioned 
        ? state.totalMentions + 1 
        : state.totalMentions;
      
      return {
        unreads: {
          ...state.unreads,
          [serverId]: {
            ...serverUnreads,
            [channelId]: newChannelUnread,
          },
        },
        totalMentions: newTotalMentions,
      };
    });
  },

  getChannelUnread: (serverId, channelId) => {
    return get().unreads[serverId]?.[channelId];
  },

  getServerUnreadCount: (serverId) => {
    const serverUnreads = get().unreads[serverId];
    if (!serverUnreads) return 0;
    
    return Object.values(serverUnreads).reduce(
      (sum, channel) => sum + channel.unreadCount, 
      0
    );
  },

  getServerHasMentions: (serverId) => {
    const serverUnreads = get().unreads[serverId];
    if (!serverUnreads) return false;
    
    return Object.values(serverUnreads).some(channel => channel.mentioned);
  },

  clearServerUnreads: (serverId) => {
    set((state) => {
      const serverUnreads = state.unreads[serverId];
      if (!serverUnreads) return state;
      
      // Count mentions being cleared
      const mentionsCleared = Object.values(serverUnreads).filter(c => c.mentioned).length;
      
      const { [serverId]: _, ...remainingUnreads } = state.unreads;
      
      return {
        unreads: remainingUnreads,
        totalMentions: Math.max(0, state.totalMentions - mentionsCleared),
      };
    });
  },

  clearAllUnreads: () => {
    set({ unreads: {}, totalMentions: 0 });
  },
}));

// Selective subscriptions for performance
export const useTotalMentions = () => useUnreadStore(state => state.totalMentions);
export const useServerUnreads = (serverId: number) => useUnreadStore(state => state.unreads[serverId] || {});

// Helper component to display unread badge
export function UnreadBadge({ count, mentioned }: { count: number; mentioned?: boolean }) {
  if (count === 0) return null;
  
  const displayCount = count > 99 ? '99+' : count.toString();
  
  return (
    <span
      style={{
        minWidth: 18,
        height: 18,
        borderRadius: 9,
        padding: '0 4px',
        fontSize: 12,
        fontWeight: 700,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: mentioned ? 'var(--status-dnd)' : 'var(--status-idle)',
        color: '#fff',
      }}
    >
      {displayCount}
    </span>
  );
}