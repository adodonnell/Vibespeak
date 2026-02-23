import React, { useState, useEffect, useCallback, useRef } from 'react';
import { SidePane, ChannelPane, MainPane, RightDrawer, UserPanel, ChannelCategory, ChatMessage, Member } from './layout';
import { LoginScreen, ServerSetupScreen } from './auth';
import { AuthProvider, useAuth } from '../stores/AuthContext';
import { serverClient } from '../services/server-client';
import { apiClient } from '../services/api-client';
import { voiceClient } from '../services/voice-client';
import { realtimeClient } from '../services/websocket-client';
import { audioEngine } from '../utils/audioEngine';
import { useToast } from '../contexts/ToastContext';
import AppSettings from './AppSettings';
import { SearchModal } from './SearchModal';
import { ServerDiscovery } from './ServerDiscovery';
import PresenceIndicator, { StatusSelector } from './PresenceIndicator';
import { useReadReceipts } from './ReadReceipts';

interface Server {
  id: number;
  name: string;
  icon?: string;
  owner_id?: number;
}

const VibeSpeakAppContent: React.FC = () => {
  const { user, isAuthenticated, isRestoring, logout } = useAuth();

  const [servers, setServers] = useState<Server[]>([]);
  const [activeServerId, setActiveServerId] = useState<number | null>(null);
  const [categories, setCategories] = useState<ChannelCategory[]>([]);
  const [currentChannelId, setCurrentChannelId] = useState<number | null>(null);
  const [currentChannelName, setCurrentChannelName] = useState('');
  const [viewMode, setViewMode] = useState<'text' | 'voice'>('text');
  const [messageInput, setMessageInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);
  const [rightDrawerOpen, setRightDrawerOpen] = useState(true);
  const [rightDrawerMode, setRightDrawerMode] = useState<'members' | 'profile'>('members');

  const [replyingTo, setReplyingTo] = useState<{ id: string; sender: string; content: string } | null>(null);
  const [searchResults, setSearchResults] = useState<ChatMessage[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [pinsOpen, setPinsOpen] = useState(false);
  const [pinnedMessages, setPinnedMessages] = useState<ChatMessage[]>([]);

  // Typing indicator state
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const typingTimeoutsRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const [isInVoice, setIsInVoice] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isDeafened, setIsDeafened] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string>(() => localStorage.getItem('disorder:avatar') || '');
  const [voiceChannels, setVoiceChannels] = useState<any[]>([]);
  const [currentVoiceChannelName, setCurrentVoiceChannelName] = useState<string | undefined>(undefined);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [currentUserStatus, setCurrentUserStatus] = useState<'online' | 'idle' | 'dnd' | 'offline'>('online');
  
  // Refs to track current voice state for handlers (avoids stale closures)
  const isInVoiceRef = useRef(isInVoice);
  const currentVoiceChannelNameRef = useRef(currentVoiceChannelName);
  const userRef = useRef(user);
  
  // Keep refs in sync with state
  useEffect(() => { isInVoiceRef.current = isInVoice; }, [isInVoice]);
  useEffect(() => { currentVoiceChannelNameRef.current = currentVoiceChannelName; }, [currentVoiceChannelName]);
  useEffect(() => { userRef.current = user; }, [user]);

  // Support multiple simultaneous screen shares: Map of userId -> stream info
  const [screenShares, setScreenShares] = useState<Map<string, {
    stream: MediaStream;
    presenterName: string;
    isLocal: boolean;
  }>>(new Map());
  
  // Currently featured/visible screen share (null = show all in grid)
  const [featuredScreenShareId, setFeaturedScreenShareId] = useState<string | null>(null);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [searchModalOpen, setSearchModalOpen] = useState(false);
  const [serverDiscoveryOpen, setServerDiscoveryOpen] = useState(false);

  // Create-server modal (replaces prompt() — not supported in Electron)
  const [createServerOpen, setCreateServerOpen] = useState(false);
  const [newServerName, setNewServerName] = useState('');

  const { unreadCount, markAsRead } = useReadReceipts(currentChannelId, messages.length);

  /**
   * Set of real message IDs we sent optimistically.
   * When the WS echo arrives we skip it (we already have the message in state).
   */
  const ownEchoIds = useRef<Set<string>>(new Set());

  // Ctrl+K shortcut for search
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); setSearchModalOpen(true); }
    };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, []);

  // Speaking detection - propagate local speaking state to voice users
  useEffect(() => {
    if (!isInVoice || !user) return;
    
    const updateSpeaking = () => {
      const speaking = voiceClient.isVoiceActivityDetected();
      const muted = voiceClient.isMuted(); // Don't show speaking when muted
      setIsSpeaking(speaking && !muted);
      
      // Update the local user's speaking state in voiceChannels
      if (currentVoiceChannelName) {
        setVoiceChannels(prev => prev.map((vc: any) => {
          if (vc.channelId !== currentVoiceChannelName) return vc;
          return {
            ...vc,
            users: vc.users.map((u: any) => {
              const username = typeof u === 'string' ? u : u.username;
              if (username === user.username) {
                return { ...u, isSpeaking: speaking && !muted, isMuted: muted };
              }
              return u;
            })
          };
        }));
      }
    };
    
    const interval = setInterval(updateSpeaking, 50); // Check every 50ms
    return () => clearInterval(interval);
  }, [isInVoice, user, currentVoiceChannelName]);

  // ── WebSocket lifecycle ────────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;

    apiClient.getVoiceChannels().then(data => {
      if (Array.isArray(data)) {
        setVoiceChannels(data);
      } else {
        console.warn('[VibeSpeakApp] getVoiceChannels returned non-array:', data);
        setVoiceChannels([]);
      }
    }).catch(() => {});
    realtimeClient.connect(user.username).catch(() => {});

    const unsubVoice = realtimeClient.onVoiceChannelUpdate((channels) => {
      // Server sends users as { clientId, username }[] — map to VoiceChannelUser objects
      // Use refs to get current values (avoids stale closure issues)
      const currentUser = userRef.current;
      const currentChannel = currentVoiceChannelNameRef.current;
      const inVoice = isInVoiceRef.current;
      
      setVoiceChannels(prev => {
        // Validate channels is an array
        if (!Array.isArray(channels)) {
          console.warn('[VibeSpeakApp] onVoiceChannelUpdate received non-array:', channels);
          return prev;
        }
        
        // Build a map of channel -> deduplicated users by username
        let newChannels = channels.map(ch => {
          // Deduplicate users by username in each channel
          const seenUsernames = new Set<string>();
          const dedupedUsers: any[] = [];
          
          for (const u of (ch.users || [])) {
            const username = typeof u === 'string' ? u : (u.username || u.clientId || 'Unknown');
            const clientId = typeof u === 'string' ? u : (u.clientId || u.username || 'unknown');
            
            if (!seenUsernames.has(username)) {
              seenUsernames.add(username);
              dedupedUsers.push({ clientId, username, displayName: username });
            }
          }
          
          return {
            channelId: ch.channelId,
            users: dedupedUsers,
          };
        });
        
        // If we're in a voice channel, manage local user presence across all channels
        if (currentUser && inVoice) {
          // Remove local user from ALL channels first (handles channel switches)
          newChannels = newChannels.map(ch => ({
            ...ch,
            users: ch.users.filter((u: any) => u.username !== currentUser.username)
          }));
          
          // Then add local user to their CURRENT channel only
          const localChannelIdx = newChannels.findIndex(
            (ch: any) => ch.channelId === currentChannel
          );
          
          if (localChannelIdx >= 0 && currentChannel) {
            newChannels[localChannelIdx] = {
              ...newChannels[localChannelIdx],
              users: [
                ...newChannels[localChannelIdx].users,
                { clientId: `local-${currentUser.username}`, username: currentUser.username, displayName: currentUser.username }
              ]
            };
          }
        }
        
        // Filter out empty channels to keep state clean
        return newChannels.filter(ch => ch.users.length > 0);
      });
    });

    // Typing events from other users
    const unsubTypingStart = realtimeClient.onTypingStart(({ username, channelId }) => {
      if (channelId !== currentChannelId || username === user.username) return;
      setTypingUsers(prev => prev.includes(username) ? prev : [...prev, username]);
      // Auto-remove after 5s if no stop event
      const existing = typingTimeoutsRef.current.get(username);
      if (existing) clearTimeout(existing);
      const t = setTimeout(() => {
        setTypingUsers(prev => prev.filter(u => u !== username));
        typingTimeoutsRef.current.delete(username);
      }, 5000);
      typingTimeoutsRef.current.set(username, t);
    });

    const unsubTypingStop = realtimeClient.onTypingStop(({ username }) => {
      setTypingUsers(prev => prev.filter(u => u !== username));
      const t = typingTimeoutsRef.current.get(username);
      if (t) { clearTimeout(t); typingTimeoutsRef.current.delete(username); }
    });

    // Store handler references so we can remove them on cleanup
    const handleUserJoined = (_uid: string) => playSound('join');
    const handleUserLeft = (_uid: string) => playSound('leave');
    
    // Handle incoming screen share from another user
    const handleIncomingScreenShare = (userId: string, stream: MediaStream) => {
      setScreenShares(prev => {
        const newMap = new Map(prev);
        newMap.set(userId, { stream, presenterName: userId, isLocal: false });
        return newMap;
      });
    };
    
    // Handle local screen share start
    const handleScreenShareStart = (stream: MediaStream) => {
      if (!user) return;
      setScreenShares(prev => {
        const newMap = new Map(prev);
        newMap.set(user.username, { stream, presenterName: user.username, isLocal: true });
        return newMap;
      });
    };
    
    // Handle screen share stop (local or remote)
    const handleScreenShareStop = () => {
      if (!user) return;
      setScreenShares(prev => {
        const newMap = new Map(prev);
        newMap.delete(user.username);
        return newMap;
      });
    };

    voiceClient.onUserJoined(handleUserJoined);
    voiceClient.onUserLeft(handleUserLeft);
    voiceClient.onIncomingScreenShare(handleIncomingScreenShare);
    voiceClient.onScreenShareStart(handleScreenShareStart);
    voiceClient.onScreenShareStop(handleScreenShareStop);

    return () => {
      unsubVoice(); unsubTypingStart(); unsubTypingStop();
      // Clear all typing timeouts
      typingTimeoutsRef.current.forEach(t => clearTimeout(t));
      typingTimeoutsRef.current.clear();
      // Remove voice client handlers to prevent memory leaks and duplicate events
      voiceClient.offUserJoined(handleUserJoined);
      voiceClient.offUserLeft(handleUserLeft);
      voiceClient.leaveVoiceChannel();
      realtimeClient.disconnect();
    };
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  // Clear typing users on channel switch
  useEffect(() => {
    setTypingUsers([]);
    typingTimeoutsRef.current.forEach(t => clearTimeout(t));
    typingTimeoutsRef.current.clear();
  }, [currentChannelId]);

  // ── Channel room join ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!currentChannelId) return;
    realtimeClient.joinChannelRoom(currentChannelId);
  }, [currentChannelId]);

  // ── Real-time message subscriptions ───────────────────────────────────────
  useEffect(() => {
    const unsubMsg = realtimeClient.onMessage((msg) => {
      if (msg.channel_id !== currentChannelId) return;
      const realId = msg.id.toString();

      setMessages(prev => {
        // Already have this exact real message — skip (idempotent)
        if (prev.some(m => m.id === realId)) return prev;

        // Look for a pending optimistic (temp) message from the same user
        // with identical content — covers the race where WS arrives before
        // the API response can register the ID in ownEchoIds.
        const tempIdx = prev.findIndex(
          m => m.id.startsWith('temp_') &&
               m.senderId === msg.user_id &&
               m.content === (msg.content ?? '')
        );
        if (tempIdx !== -1) {
          // Promote the temp message to the confirmed real one in-place
          // and register the real ID so the subsequent API response no-ops.
          ownEchoIds.current.add(realId);
          const updated = [...prev];
          updated[tempIdx] = {
            ...updated[tempIdx],
            id: realId,
            timestamp: new Date(msg.created_at).getTime(),
          };
          return updated;
        }

        // Fresh message from another user — append normally
        return [...prev, {
          id: realId,
          sender: msg.username || 'Unknown',
          senderId: msg.user_id,
          content: msg.content ?? '',
          timestamp: new Date(msg.created_at).getTime(),
        }];
      });
    });
    const unsubEdit = realtimeClient.onMessageUpdated(({ messageId, content }) => {
      setMessages(prev => prev.map(m =>
        m.id === messageId.toString() ? { ...m, content, edited: true } : m
      ));
    });
    const unsubDel = realtimeClient.onMessageDeleted(({ messageId }) => {
      setMessages(prev => prev.filter(m => m.id !== messageId.toString()));
    });
    return () => { unsubMsg(); unsubEdit(); unsubDel(); };
  }, [currentChannelId]);

  // Sound effects — use singleton audio engine
  const playSound = (type: 'join' | 'leave') => {
    audioEngine.playBeep(type);
  };

  // Fetch channels when server changes
  useEffect(() => {
    if (!activeServerId) return;
    apiClient.getChannels(activeServerId).then(channels => {
      if (!Array.isArray(channels)) {
        console.warn('[VibeSpeakApp] getChannels returned non-array:', channels);
        return;
      }
      const textChs = channels.filter((ch: any) => ch.type === 'text');
      const voiceChs = channels.filter((ch: any) => ch.type === 'voice');
      setCategories([
        { id: 'text-channels', name: 'Text Channels', isExpanded: true, channels: textChs.map((ch: any) => ({ id: ch.id, name: ch.name, type: 'text' as const })) },
        { id: 'voice-channels', name: 'Voice Channels', isExpanded: true, channels: voiceChs.map((ch: any) => ({ id: ch.id, name: ch.name, type: 'voice' as const })) },
      ]);
      if (textChs.length > 0) {
        setCurrentChannelId(textChs[0].id);
        setCurrentChannelName(textChs[0].name);
        setViewMode('text');
      }
    }).catch(console.error);
  }, [activeServerId]);

  // Fetch messages when channel changes
  useEffect(() => {
    if (!currentChannelId || viewMode !== 'text') return;
    apiClient.getMessages(currentChannelId).then(msgs => {
      const messageArray = Array.isArray(msgs) ? msgs : [];
      setMessages(messageArray.map((msg: any) => ({
        id: msg.id.toString(),
        sender: msg.username || msg.display_name || 'Unknown',
        senderId: msg.user_id,
        content: msg.content ?? '',
        timestamp: new Date(msg.created_at).getTime(),
      })));
    }).catch(console.error);
  }, [currentChannelId, viewMode]);

  // Fetch members when server changes
  useEffect(() => {
    if (!activeServerId) return;
    apiClient.getMembers(activeServerId).then(data => {
      if (!Array.isArray(data)) {
        console.warn('[VibeSpeakApp] getMembers returned non-array:', data);
        return;
      }
      setMembers(data.map((m: any) => ({ id: m.id, username: m.username, status: m.status || 'offline', roles: m.roles || [] })));
    }).catch(console.error);
  }, [activeServerId]);

  // Fetch servers on auth
  useEffect(() => {
    if (!isAuthenticated) return;
    apiClient.getServers().then(data => {
      if (!Array.isArray(data)) {
        console.warn('[VibeSpeakApp] getServers returned non-array:', data);
        return;
      }
      setServers(data);
      if (data.length > 0 && activeServerId === null) setActiveServerId(data[0].id);
    }).catch(console.error);
  }, [isAuthenticated]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleChannelSelect = useCallback((channelId: number, type: 'text' | 'voice') => {
    setCurrentChannelId(channelId);
    const ch = categories.flatMap(c => c.channels).find(c => c.id === channelId);
    if (ch) { setCurrentChannelName(ch.name); setViewMode(type); }
  }, [categories]);

  const handleChannelDoubleClick = useCallback(async (channel: any) => {
    if (channel.type !== 'voice') return;
    if (isInVoice && currentVoiceChannelName === channel.name) return;
    if (isInVoice && user && currentVoiceChannelName) {
      voiceClient.leaveVoiceChannel();
      setVoiceChannels(prev => prev.map((vc: any) =>
        vc.channelId === currentVoiceChannelName
          ? { ...vc, users: vc.users.filter((u: any) => (typeof u === 'string' ? u : u.username) !== user.username) }
          : vc
      ));
      setIsInVoice(false); setCurrentVoiceChannelName(undefined);
    }
    try {
      await voiceClient.joinVoiceChannel(channel.name, undefined, user?.username);
      setIsInVoice(true); setCurrentVoiceChannelName(channel.name);
      if (user) {
        const newUser = { clientId: `local-${user.username}`, username: user.username, displayName: user.username };
        setVoiceChannels(prev => {
          const ex = prev.find((vc: any) => vc.channelId === channel.name);
          if (ex) {
            const already = ex.users.some((u: any) => (typeof u === 'string' ? u : u.username) === user.username);
            if (already) return prev;
            return prev.map((vc: any) => vc.channelId === channel.name ? { ...vc, users: [...vc.users, newUser] } : vc);
          }
          return [...prev, { channelId: channel.name, users: [newUser] }];
        });
      }
    } catch (err) { console.error('Failed to join voice:', err); }
  }, [user, isInVoice, currentVoiceChannelName]);

  const handleToggleCategory = useCallback((categoryId: string) => {
    setCategories(prev => prev.map(cat => cat.id === categoryId ? { ...cat, isExpanded: !cat.isExpanded } : cat));
  }, []);

  const handleSendMessage = useCallback(async (content: string, replyTo?: string) => {
    if (!currentChannelId || !user) return;
    const tempId = `temp_${Date.now()}`;
    const newMsg: ChatMessage = {
      id: tempId, sender: user.username, senderId: user.id,
      content, timestamp: Date.now(), parentId: replyTo || null,
    };
    setMessages(prev => [...prev, newMsg]);
    setMessageInput(''); setReplyingTo(null);
    try {
      const res: any = await apiClient.sendMessage(currentChannelId, content, replyTo ? parseInt(replyTo, 10) : undefined);
      const realId = res.id.toString();
      // Register the real ID so the WS echo is silently dropped
      ownEchoIds.current.add(realId);
      // Auto-clean after 5s (failsafe)
      setTimeout(() => ownEchoIds.current.delete(realId), 5000);
      setMessages(prev => prev.map(m => m.id === tempId ? { ...m, id: realId } : m));
    } catch (err) {
      console.error('Failed to send message:', err);
      setMessages(prev => prev.filter(m => m.id !== tempId));
    }
  }, [currentChannelId, user]);

  // Typing events sent to WS
  const handleTypingStart = useCallback(() => {
    if (currentChannelId) realtimeClient.sendTypingStart(currentChannelId);
  }, [currentChannelId]);

  const handleTypingStop = useCallback(() => {
    if (currentChannelId) realtimeClient.sendTypingStop(currentChannelId);
  }, [currentChannelId]);

  // Reply handler
  const handleReplyTo = useCallback((message: ChatMessage) => {
    setReplyingTo({ id: message.id, sender: message.sender, content: message.content });
  }, []);

  const handleCancelReply = useCallback(() => setReplyingTo(null), []);

  const handleEditMessage = useCallback(async (messageId: string, newContent: string) => {
    try {
      await apiClient.editMessage(parseInt(messageId), newContent);
      setMessages(prev => prev.map(msg => msg.id === messageId ? { ...msg, content: newContent, edited: true } : msg));
    } catch (err) { console.error('Failed to edit message:', err); }
  }, []);

  const handleDeleteMessage = useCallback(async (messageId: string) => {
    try {
      await apiClient.deleteMessage(parseInt(messageId));
      setMessages(prev => prev.filter(msg => msg.id !== messageId));
    } catch (err) { console.error('Failed to delete message:', err); }
  }, []);

  const handleReactMessage = useCallback(async (messageId: string, emoji: string) => {
    try { await apiClient.addReaction(parseInt(messageId), emoji); }
    catch (err) { console.error('Failed to add reaction:', err); }
  }, []);

  const handleSearchMessages = useCallback(async (query: string) => {
    if (!currentChannelId) return;
    setIsSearching(true);
    try {
      const results = await apiClient.searchMessages(query);
      setSearchResults(results.map((msg: any) => ({
        id: msg.id.toString(), sender: msg.username, senderId: msg.user_id,
        content: msg.content, timestamp: new Date(msg.created_at).getTime(),
      })));
    } catch (err) { console.error('Failed to search:', err); }
    finally { setIsSearching(false); }
  }, [currentChannelId]);

  // Helper to refresh pinned messages from API
  const refreshPinnedMessages = useCallback(async () => {
    if (!currentChannelId) return;
    try {
      const pins = await apiClient.getPinnedMessages(currentChannelId);
      setPinnedMessages(pins.map((msg: any) => ({
        id: (msg.message_id ?? msg.id ?? Math.random()).toString(),
        sender: msg.username || msg.display_name || 'Unknown',
        content: msg.message_content || msg.content || '',
        timestamp: msg.pinned_at ? new Date(msg.pinned_at).getTime() : msg.created_at ? new Date(msg.created_at).getTime() : Date.now(),
        pinned: true,
      })));
    } catch (err) { console.error('Failed to refresh pins:', err); }
  }, [currentChannelId]);

  const handlePinMessage = useCallback(async (messageId: string) => {
    if (!currentChannelId) return;
    try {
      await apiClient.pinMessage(currentChannelId, parseInt(messageId));
      setMessages(prev => prev.map(msg => msg.id === messageId ? { ...msg, pinned: true } : msg));
      // Refresh pinned messages list so pinboard updates immediately
      refreshPinnedMessages();
    } catch (err) { console.error('Failed to pin:', err); }
  }, [currentChannelId, refreshPinnedMessages]);

  const handleUnpinMessage = useCallback(async (messageId: string) => {
    if (!currentChannelId) return;
    try {
      await apiClient.unpinMessage(currentChannelId, parseInt(messageId));
      setMessages(prev => prev.map(msg => msg.id === messageId ? { ...msg, pinned: false } : msg));
      // Refresh pinned messages list so pinboard updates immediately
      refreshPinnedMessages();
    } catch (err) { console.error('Failed to unpin:', err); }
  }, [currentChannelId, refreshPinnedMessages]);

  const handleOpenPins = useCallback(async () => {
    if (!currentChannelId) return;
    await refreshPinnedMessages();
    setPinsOpen(true);
  }, [currentChannelId, refreshPinnedMessages]);

  const handleToggleMute = useCallback(() => {
    voiceClient.toggleMute(); setIsMuted(v => !v);
  }, []);

  const handleToggleDeafen = useCallback(() => {
    setIsDeafened(v => {
      const next = !v;
      voiceClient.setDeafened(next);
      setIsMuted(next);
      return next;
    });
  }, []);

  const handleServerSelect = useCallback((id: number | string | null | undefined) => {
    setActiveServerId(id != null ? Number(id) : null);
  }, []);

  const handleLogout = useCallback(async () => {
    try { serverClient.logout(); } catch { }
    logout();
  }, [logout]);

  const handleAddServer = useCallback(() => {
    // prompt() is not supported in Electron — use the React modal instead
    setNewServerName('');
    setCreateServerOpen(true);
  }, []);

  const handleCreateServerConfirm = useCallback(async () => {
    const name = newServerName.trim();
    if (!name) return;
    setCreateServerOpen(false);
    try {
      const server = await apiClient.createServer(name);
      setServers(prev => [...prev, server]);
      setActiveServerId(server.id);
    } catch (err) { console.error('Failed to create server:', err); }
  }, [newServerName]);

  const handleHomeClick = useCallback(() => {
    setActiveServerId(null); setCategories([]); setCurrentChannelId(null);
  }, []);

  const addLocalUserToVoice = useCallback((channelName: string, username: string) => {
    const newUser = { clientId: `local-${username}`, username, displayName: username };
    setVoiceChannels(prev => {
      const ex = prev.find((vc: any) => vc.channelId === channelName);
      if (ex) {
        const alreadyIn = ex.users.some((u: any) =>
          (typeof u === 'string' ? u : u.username) === username
        );
        if (alreadyIn) return prev;
        return prev.map((vc: any) =>
          vc.channelId === channelName ? { ...vc, users: [...vc.users, newUser] } : vc
        );
      }
      return [...prev, { channelId: channelName, users: [newUser] }];
    });
  }, []);

  const removeLocalUserFromVoice = useCallback((channelName: string, username: string) => {
    setVoiceChannels(prev => prev.map((vc: any) =>
      vc.channelId === channelName
        ? { ...vc, users: vc.users.filter((u: any) => (typeof u === 'string' ? u : u.username) !== username) }
        : vc
    ));
  }, []);

  const handleJoinVoice = useCallback(async () => {
    if (!user) return;
    try {
      await voiceClient.joinVoiceChannel(currentChannelName, undefined, user.username);
      setIsInVoice(true); setCurrentVoiceChannelName(currentChannelName);
      addLocalUserToVoice(currentChannelName, user.username);
    } catch (err) { console.error('Failed to join voice:', err); }
  }, [currentChannelName, user, addLocalUserToVoice]);

  const handleLeaveVoice = useCallback(async () => {
    if (!user) return;
    voiceClient.leaveVoiceChannel();
    if (currentVoiceChannelName) removeLocalUserFromVoice(currentVoiceChannelName, user.username);
    setIsInVoice(false); setCurrentVoiceChannelName(undefined);
  }, [user, currentVoiceChannelName, removeLocalUserFromVoice]);

  const handleStartScreenShare = useCallback(async () => {
    try { await voiceClient.startScreenShare(); }
    catch (err) { console.error('Failed to start screen share:', err); }
  }, []);

  const handleStopScreenShare = useCallback(() => { voiceClient.stopScreenShare(); }, []);

  const handleMembersClick = useCallback(() => {
    setRightDrawerMode('members'); setRightDrawerOpen(true);
  }, []);

  const handleMemberClick = useCallback((member: Member) => {
    setSelectedMember(member); setRightDrawerMode('profile'); setRightDrawerOpen(true);
  }, []);

  // Moderation handlers
  const handleKickUser = useCallback(async (member: Member) => {
    if (!activeServerId) return;
    try {
      await apiClient.kickUser(activeServerId, member.id);
      // Refresh members list
      const data = await apiClient.getMembers(activeServerId);
      setMembers(data.map((m: any) => ({ id: m.id, username: m.username, status: m.status || 'offline', roles: m.roles || [] })));
    } catch (err) { console.error('Failed to kick user:', err); }
  }, [activeServerId]);

  const handleBanUser = useCallback(async (member: Member) => {
    if (!activeServerId) return;
    try {
      await apiClient.banUser(activeServerId, member.id);
      // Refresh members list
      const data = await apiClient.getMembers(activeServerId);
      setMembers(data.map((m: any) => ({ id: m.id, username: m.username, status: m.status || 'offline', roles: m.roles || [] })));
    } catch (err) { console.error('Failed to ban user:', err); }
  }, [activeServerId]);

  const handleMuteUser = useCallback(async (member: Member, durationMinutes?: number) => {
    if (!activeServerId) return;
    try {
      await apiClient.muteUser(activeServerId, member.id, undefined, durationMinutes);
    } catch (err) { console.error('Failed to mute user:', err); }
  }, [activeServerId]);

  // Status change handler
  const handleStatusChange = useCallback(async (newStatus: 'online' | 'idle' | 'dnd' | 'offline') => {
    setCurrentUserStatus(newStatus);
    try {
      await apiClient.updatePresence(newStatus);
    } catch (err) { console.error('Failed to update status:', err); }
  }, []);

  // ── Derived values ─────────────────────────────────────────────────────────
  const currentServer = servers.find(s => s.id === activeServerId);
  const serverName = currentServer?.name || 'Select a Server';

  const currentVoiceChannel = categories.flatMap(cat => cat.channels)
    .find(ch => ch.id === currentChannelId && ch.type === 'voice');
  const voiceUsersForChannel = currentVoiceChannel
    ? (voiceChannels.find(vc => vc.channelId === currentVoiceChannel.name)?.users || []).map((u: any) => ({
        id: typeof u === 'string' ? u : (u.clientId || u.username || ''),
        username: typeof u === 'string' ? u : (u.username || u.clientId || 'Unknown'),
        isMuted: typeof u === 'string' ? false : (u.isMuted ?? false),
        isSpeaking: typeof u === 'string' ? false : (u.isSpeaking ?? false),
        isDeafened: typeof u === 'string' ? false : (u.isDeafened ?? false),
      }))
    : [];

  // Derive screen share values from the Map for backward compatibility with MainPane
  // Get the first (or featured) screen share for single-stream view
  const screenShareEntries = Array.from(screenShares.entries());
  const featuredEntry = featuredScreenShareId 
    ? screenShares.get(featuredScreenShareId) 
    : screenShareEntries[0]?.[1];
  const screenShareStream = featuredEntry?.stream ?? null;
  const screenSharePresenter = featuredEntry?.presenterName ?? '';
  const isLocalScreenShare = featuredEntry?.isLocal ?? false;

  // ── Render ─────────────────────────────────────────────────────────────────
  if (isRestoring) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: '100vh', width: '100vw', background: '#1E1F22',
        color: '#B5BAC1', fontSize: '1.5rem', fontWeight: 600, letterSpacing: '0.05em',
      }}>
        VibeSpeak…
      </div>
    );
  }

  if (!isAuthenticated || !user) return <LoginScreen />;

  return (
    <div className="app-container">
      <SidePane
        servers={servers}
        activeServerId={activeServerId}
        onServerSelect={handleServerSelect}
        onAddServer={handleAddServer}
        onHomeClick={handleHomeClick}
        onExploreServers={() => setServerDiscoveryOpen(true)}
      />

      <ChannelPane
        serverName={serverName}
        categories={categories}
        currentChannelId={currentChannelId}
        onChannelSelect={handleChannelSelect}
        onChannelDoubleClick={handleChannelDoubleClick}
        onToggleCategory={handleToggleCategory}
        onSettingsClick={() => setSettingsOpen(true)}
        voiceChannels={voiceChannels}
        currentUserVoiceChannel={currentVoiceChannelName}
        currentUsername={user.username}
        currentUserAvatarUrl={avatarUrl || undefined}
        currentUserStatus={currentUserStatus}
        isMuted={isMuted}
        isDeafened={isDeafened}
        onMuteToggle={handleToggleMute}
        onDeafenToggle={handleToggleDeafen}
        onUserSettingsClick={() => setSettingsOpen(true)}
        onStatusChange={handleStatusChange}
      />

      <MainPane
        viewMode={viewMode}
        channelName={currentChannelName}
        channelId={currentChannelId || undefined}
        messages={messages}
        searchResults={searchResults}
        voiceUsers={voiceUsersForChannel}
        messageInput={messageInput}
        replyingTo={replyingTo}
        typingUsers={typingUsers}
        onMessageInputChange={setMessageInput}
        onSendMessage={handleSendMessage}
        onCancelReply={handleCancelReply}
        onEditMessage={handleEditMessage}
        onDeleteMessage={handleDeleteMessage}
        onReactMessage={handleReactMessage}
        onPinMessage={handlePinMessage}
        onUnpinMessage={handleUnpinMessage}
        onReplyTo={handleReplyTo}
        onSearchMessages={handleSearchMessages}
        onOpenPins={handleOpenPins}
        onJoinVoice={handleJoinVoice}
        onLeaveVoice={handleLeaveVoice}
        onMembersClick={handleMembersClick}
        isInVoice={isInVoice}
        currentUserId={user.id}
        screenShareStream={screenShareStream}
        screenSharePresenter={screenSharePresenter}
        isLocalScreenShare={isLocalScreenShare}
        onStartScreenShare={handleStartScreenShare}
        onStopScreenShare={handleStopScreenShare}
        onTypingStart={handleTypingStart}
        onTypingStop={handleTypingStop}
      />

      <RightDrawer
        isOpen={rightDrawerOpen}
        mode={rightDrawerMode}
        members={members}
        selectedMember={selectedMember}
        onClose={() => setRightDrawerOpen(false)}
        onMemberClick={handleMemberClick}
        serverId={activeServerId ?? undefined}
        currentUserId={user?.id}
        isServerOwner={currentServer?.owner_id === user?.id}
        onKickUser={handleKickUser}
        onBanUser={handleBanUser}
        onMuteUser={handleMuteUser}
      />

      <style>{`
        .app-container { display: flex; height: 100vh; width: 100vw; overflow: hidden; }
      `}</style>

      {/* Settings */}
      {settingsOpen && (
        <AppSettings
          isOpen={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          settings={{
            theme: 'dark', fontSize: 'medium',
            appearance: { theme: 'dark', fontSize: 'medium' },
            notifications: { enabled: true, sound: true, soundVolume: 0.5, desktop: true, mentions: true },
            voice: { inputDevice: 'default', outputDevice: 'default', inputVolume: 1, outputVolume: 1, noiseSuppression: true, echoCancellation: true },
            privacy: { showOnlineStatus: true, allowServerInvites: true },
          }}
          username={user.username}
          onLogout={handleLogout}
          onSave={(s) => { console.log('Settings saved:', s); setSettingsOpen(false); }}
          onAvatarChange={setAvatarUrl}
        />
      )}

      <SearchModal
        isOpen={searchModalOpen}
        onClose={() => setSearchModalOpen(false)}
        onSelectResult={(result) => {
          if (result.type === 'server') setActiveServerId(result.id as number);
          else if (result.type === 'user') { setRightDrawerMode('profile'); setRightDrawerOpen(true); }
        }}
        currentChannelId={currentChannelId || undefined}
      />

      <ServerDiscovery
        isOpen={serverDiscoveryOpen}
        onClose={() => setServerDiscoveryOpen(false)}
        onJoinServer={(serverId) => setActiveServerId(Number(serverId))}
      />

      {/* Create Server modal — replaces prompt() for Electron compatibility */}
      {createServerOpen && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
        }} onClick={() => setCreateServerOpen(false)}>
          <div style={{
            background: '#313338', borderRadius: 8, padding: 24, width: 440,
            boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
          }} onClick={e => e.stopPropagation()}>
            <h2 style={{ margin: '0 0 4px', color: '#F2F3F5', fontSize: 20, fontWeight: 700 }}>Create a server</h2>
            <p style={{ margin: '0 0 20px', color: '#B5BAC1', fontSize: 14 }}>Give your server a name</p>
            <label style={{ display: 'block', marginBottom: 8, color: '#B5BAC1', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Server name
            </label>
            <input
              autoFocus
              type="text"
              value={newServerName}
              onChange={e => setNewServerName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleCreateServerConfirm(); if (e.key === 'Escape') setCreateServerOpen(false); }}
              placeholder="My awesome server"
              style={{
                width: '100%', boxSizing: 'border-box',
                background: '#1E1F22', border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 4, padding: '10px 12px', color: '#DBDEE1', fontSize: 16,
                outline: 'none', marginBottom: 24,
              }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button onClick={() => setCreateServerOpen(false)} style={{
                background: 'transparent', border: 'none', color: '#DBDEE1',
                padding: '10px 20px', borderRadius: 4, cursor: 'pointer', fontSize: 14, fontWeight: 500,
              }}>Cancel</button>
              <button onClick={handleCreateServerConfirm} disabled={!newServerName.trim()} style={{
                background: newServerName.trim() ? '#5865F2' : '#4e5058',
                border: 'none', color: '#fff', padding: '10px 24px', borderRadius: 4,
                cursor: newServerName.trim() ? 'pointer' : 'not-allowed', fontSize: 14, fontWeight: 600,
              }}>Create</button>
            </div>
          </div>
        </div>
      )}

      {/* Pinned messages drawer */}
      {pinsOpen && (
        <div style={{
          position: 'fixed', top: 0, right: rightDrawerOpen ? 240 : 0, width: 360, height: '100vh',
          background: '#2B2D31', borderLeft: '1px solid rgba(0,0,0,0.2)',
          display: 'flex', flexDirection: 'column', zIndex: 300, boxShadow: '-4px 0 12px rgba(0,0,0,0.3)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px', height: 48, borderBottom: '1px solid rgba(0,0,0,0.2)', flexShrink: 0 }}>
            <span style={{ fontWeight: 700, fontSize: 15, color: '#F2F3F5' }}>📌 Pinned Messages</span>
            <button onClick={() => setPinsOpen(false)} style={{ background: 'none', border: 'none', color: '#80848E', cursor: 'pointer', fontSize: 18, padding: '4px 8px', borderRadius: 4 }}>✕</button>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
            {pinnedMessages.length === 0 ? (
              <div style={{ padding: 24, color: '#80848E', textAlign: 'center', fontSize: 14 }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>📌</div>
                No pinned messages yet.
              </div>
            ) : pinnedMessages.map(msg => (
              <div key={msg.id} style={{ padding: '8px 16px', borderBottom: '1px solid rgba(255,255,255,0.04)', cursor: 'pointer' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.04)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <div style={{ width: 24, height: 24, borderRadius: '50%', background: '#5865F2', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#fff' }}>
                    {msg.sender.charAt(0).toUpperCase()}
                  </div>
                  <span style={{ fontWeight: 600, fontSize: 13, color: '#F2F3F5' }}>{msg.sender}</span>
                  <span style={{ fontSize: 11, color: '#80848E', marginLeft: 'auto' }}>{new Date(msg.timestamp).toLocaleDateString()}</span>
                </div>
                <p style={{ margin: 0, fontSize: 14, color: '#DBDEE1', lineHeight: 1.4, paddingLeft: 32 }}>{msg.content}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

const VibeSpeakApp: React.FC = () => {
  const [serverConfigured, setServerConfigured] = useState<boolean>(
    () => localStorage.getItem('disorder:server-configured') === 'true'
  );

  if (!serverConfigured) {
    return (
      <ServerSetupScreen
        onConnected={() => {
          localStorage.setItem('disorder:server-configured', 'true');
          setServerConfigured(true);
        }}
      />
    );
  }

  return (
    <AuthProvider>
      <VibeSpeakAppContent />
    </AuthProvider>
  );
};

export default VibeSpeakApp;