/**
 * VibeSpeak Global App Store
 * Centralized state management using Zustand for high performance
 * Optimized with shallow comparisons and selective subscriptions
 */

import { create } from 'zustand';
import { devtools, subscribeWithSelector } from 'zustand/middleware';

// ── Types ───────────────────────────────────────────────────────────────────

export interface User {
  id: number;
  username: string;
  display_name?: string;
  avatar_url?: string;
  status: 'online' | 'idle' | 'dnd' | 'offline';
}

export interface Server {
  id: number;
  name: string;
  icon?: string;
  owner_id?: number;
}

export interface Channel {
  id: number;
  name: string;
  type: 'text' | 'voice';
  topic?: string;
  server_id: number;
}

export interface Message {
  id: string;
  sender: string;
  senderId: number;
  content: string;
  timestamp: number;
  edited?: boolean;
  pinned?: boolean;
  parentId?: string | null;
  reactions?: { emoji: string; count: number; users: number[] }[];
}

export interface Member {
  id: number;
  username: string;
  status: string;
  roles: string[];
}

export interface VoiceUser {
  clientId: string;
  username: string;
  isMuted?: boolean;
  isSpeaking?: boolean;
  isDeafened?: boolean;
}

export interface VoiceChannel {
  channelId: string;
  users: VoiceUser[];
}

// ── Store State ─────────────────────────────────────────────────────────────

interface AppState {
  // Auth
  user: User | null;
  isAuthenticated: boolean;
  isRestoring: boolean;
  
  // Servers
  servers: Server[];
  activeServerId: number | null;
  
  // Channels
  channels: Channel[];
  activeChannelId: number | null;
  activeChannelName: string;
  viewMode: 'text' | 'voice';
  
  // Messages
  messages: Record<number, Message[]>; // channelId -> messages
  typingUsers: Record<number, string[]>; // channelId -> usernames
  
  // Members
  members: Member[];
  
  // Voice
  voiceChannels: VoiceChannel[];
  currentVoiceChannel: string | null;
  isInVoice: boolean;
  isMuted: boolean;
  isDeafened: boolean;
  isSpeaking: boolean;
  
  // UI State
  rightDrawerOpen: boolean;
  rightDrawerMode: 'members' | 'profile';
  selectedMember: Member | null;
  replyingTo: { id: string; sender: string; content: string } | null;
  settingsOpen: boolean;
  searchModalOpen: boolean;
  
  // Connection
  isConnecting: boolean;
  connectionError: string | null;
}

// ── Store Actions ───────────────────────────────────────────────────────────

interface AppActions {
  // Auth
  setUser: (user: User | null) => void;
  setAuthenticated: (isAuthenticated: boolean) => void;
  setRestoring: (isRestoring: boolean) => void;
  logout: () => void;
  
  // Servers
  setServers: (servers: Server[]) => void;
  setActiveServer: (serverId: number | null) => void;
  addServer: (server: Server) => void;
  
  // Channels
  setChannels: (channels: Channel[]) => void;
  setActiveChannel: (channelId: number | null, channelName?: string) => void;
  setViewMode: (mode: 'text' | 'voice') => void;
  
  // Messages
  setMessages: (channelId: number, messages: Message[]) => void;
  addMessage: (channelId: number, message: Message) => void;
  updateMessage: (channelId: number, messageId: string, updates: Partial<Message>) => void;
  deleteMessage: (channelId: number, messageId: string) => void;
  prependMessages: (channelId: number, messages: Message[]) => void; // For loading more
  
  // Typing
  setTypingUsers: (channelId: number, users: string[]) => void;
  addTypingUser: (channelId: number, username: string) => void;
  removeTypingUser: (channelId: number, username: string) => void;
  
  // Members
  setMembers: (members: Member[]) => void;
  
  // Voice
  setVoiceChannels: (channels: VoiceChannel[]) => void;
  joinVoice: (channelName: string) => void;
  leaveVoice: () => void;
  toggleMute: () => void;
  toggleDeafen: () => void;
  setSpeaking: (isSpeaking: boolean) => void;
  updateVoiceChannelUsers: (channelId: string, users: VoiceUser[]) => void;
  
  // UI
  toggleRightDrawer: () => void;
  setRightDrawerMode: (mode: 'members' | 'profile') => void;
  setSelectedMember: (member: Member | null) => void;
  setReplyingTo: (reply: { id: string; sender: string; content: string } | null) => void;
  setSettingsOpen: (open: boolean) => void;
  setSearchModalOpen: (open: boolean) => void;
  
  // Connection
  setConnecting: (isConnecting: boolean) => void;
  setConnectionError: (error: string | null) => void;
  
  // Reset
  reset: () => void;
}

// ── Initial State ───────────────────────────────────────────────────────────

const initialState: AppState = {
  // Auth
  user: null,
  isAuthenticated: false,
  isRestoring: true,
  
  // Servers
  servers: [],
  activeServerId: null,
  
  // Channels
  channels: [],
  activeChannelId: null,
  activeChannelName: '',
  viewMode: 'text',
  
  // Messages
  messages: {},
  typingUsers: {},
  
  // Members
  members: [],
  
  // Voice
  voiceChannels: [],
  currentVoiceChannel: null,
  isInVoice: false,
  isMuted: false,
  isDeafened: false,
  isSpeaking: false,
  
  // UI
  rightDrawerOpen: true,
  rightDrawerMode: 'members',
  selectedMember: null,
  replyingTo: null,
  settingsOpen: false,
  searchModalOpen: false,
  
  // Connection
  isConnecting: false,
  connectionError: null,
};

// ── Store Creation ──────────────────────────────────────────────────────────

export const useAppStore = create<AppState & AppActions>()(
  devtools(
    subscribeWithSelector((set, get) => ({
      ...initialState,
      
      // ── Auth Actions ───────────────────────────────────────────────────────
      
      setUser: (user) => set({ user }, false, 'setUser'),
      
      setAuthenticated: (isAuthenticated) => set({ isAuthenticated }, false, 'setAuthenticated'),
      
      setRestoring: (isRestoring) => set({ isRestoring }, false, 'setRestoring'),
      
      logout: () => set({
        ...initialState,
        isRestoring: false,
      }, false, 'logout'),
      
      // ── Server Actions ─────────────────────────────────────────────────────
      
      setServers: (servers) => set({ servers }, false, 'setServers'),
      
      setActiveServer: (serverId) => set({ 
        activeServerId: serverId,
        // Clear channel state when switching servers
        activeChannelId: serverId === get().activeServerId ? get().activeChannelId : null,
        activeChannelName: serverId === get().activeServerId ? get().activeChannelName : '',
        members: serverId === get().activeServerId ? get().members : [],
      }, false, 'setActiveServer'),
      
      addServer: (server) => set((state) => ({
        servers: [...state.servers, server],
      }), false, 'addServer'),
      
      // ── Channel Actions ────────────────────────────────────────────────────
      
      setChannels: (channels) => set({ channels }, false, 'setChannels'),
      
      setActiveChannel: (channelId, channelName = '') => set({
        activeChannelId: channelId,
        activeChannelName: channelName,
        replyingTo: null, // Clear reply when switching channels
      }, false, 'setActiveChannel'),
      
      setViewMode: (viewMode) => set({ viewMode }, false, 'setViewMode'),
      
      // ── Message Actions ────────────────────────────────────────────────────
      
      setMessages: (channelId, messages) => set((state) => ({
        messages: {
          ...state.messages,
          [channelId]: messages,
        },
      }), false, 'setMessages'),
      
      addMessage: (channelId, message) => set((state) => {
        const existing = state.messages[channelId] || [];
        // Avoid duplicates (optimistic updates + WS echo)
        if (existing.some(m => m.id === message.id)) {
          return state;
        }
        return {
          messages: {
            ...state.messages,
            [channelId]: [...existing, message],
          },
        };
      }, false, 'addMessage'),
      
      updateMessage: (channelId, messageId, updates) => set((state) => {
        const messages = state.messages[channelId];
        if (!messages) return state;
        
        return {
          messages: {
            ...state.messages,
            [channelId]: messages.map(m =>
              m.id === messageId ? { ...m, ...updates } : m
            ),
          },
        };
      }, false, 'updateMessage'),
      
      deleteMessage: (channelId, messageId) => set((state) => {
        const messages = state.messages[channelId];
        if (!messages) return state;
        
        return {
          messages: {
            ...state.messages,
            [channelId]: messages.filter(m => m.id !== messageId),
          },
        };
      }, false, 'deleteMessage'),
      
      prependMessages: (channelId, newMessages) => set((state) => {
        const existing = state.messages[channelId] || [];
        return {
          messages: {
            ...state.messages,
            [channelId]: [...newMessages, ...existing],
          },
        };
      }, false, 'prependMessages'),
      
      // ── Typing Actions ─────────────────────────────────────────────────────
      
      setTypingUsers: (channelId, users) => set((state) => ({
        typingUsers: {
          ...state.typingUsers,
          [channelId]: users,
        },
      }), false, 'setTypingUsers'),
      
      addTypingUser: (channelId, username) => set((state) => {
        const current = state.typingUsers[channelId] || [];
        if (current.includes(username)) return state;
        return {
          typingUsers: {
            ...state.typingUsers,
            [channelId]: [...current, username],
          },
        };
      }, false, 'addTypingUser'),
      
      removeTypingUser: (channelId, username) => set((state) => {
        const current = state.typingUsers[channelId] || [];
        return {
          typingUsers: {
            ...state.typingUsers,
            [channelId]: current.filter(u => u !== username),
          },
        };
      }, false, 'removeTypingUser'),
      
      // ── Member Actions ─────────────────────────────────────────────────────
      
      setMembers: (members) => set({ members }, false, 'setMembers'),
      
      // ── Voice Actions ──────────────────────────────────────────────────────
      
      setVoiceChannels: (voiceChannels) => set({ voiceChannels }, false, 'setVoiceChannels'),
      
      joinVoice: (channelName) => set({
        currentVoiceChannel: channelName,
        isInVoice: true,
      }, false, 'joinVoice'),
      
      leaveVoice: () => set({
        currentVoiceChannel: null,
        isInVoice: false,
        isMuted: false,
        isDeafened: false,
        isSpeaking: false,
      }, false, 'leaveVoice'),
      
      toggleMute: () => set((state) => ({
        isMuted: !state.isMuted,
      }), false, 'toggleMute'),
      
      toggleDeafen: () => set((state) => ({
        isDeafened: !state.isDeafened,
        isMuted: !state.isDeafened ? true : state.isMuted,
      }), false, 'toggleDeafen'),
      
      setSpeaking: (isSpeaking) => set({ isSpeaking }, false, 'setSpeaking'),
      
      updateVoiceChannelUsers: (channelId, users) => set((state) => ({
        voiceChannels: state.voiceChannels.map(vc =>
          vc.channelId === channelId ? { ...vc, users } : vc
        ),
      }), false, 'updateVoiceChannelUsers'),
      
      // ── UI Actions ─────────────────────────────────────────────────────────
      
      toggleRightDrawer: () => set((state) => ({
        rightDrawerOpen: !state.rightDrawerOpen,
      }), false, 'toggleRightDrawer'),
      
      setRightDrawerMode: (mode) => set({
        rightDrawerMode: mode,
        rightDrawerOpen: true,
      }, false, 'setRightDrawerMode'),
      
      setSelectedMember: (member) => set({
        selectedMember: member,
        rightDrawerMode: 'profile',
        rightDrawerOpen: true,
      }, false, 'setSelectedMember'),
      
      setReplyingTo: (reply) => set({ replyingTo: reply }, false, 'setReplyingTo'),
      
      setSettingsOpen: (open) => set({ settingsOpen: open }, false, 'setSettingsOpen'),
      
      setSearchModalOpen: (open) => set({ searchModalOpen: open }, false, 'setSearchModalOpen'),
      
      // ── Connection Actions ─────────────────────────────────────────────────
      
      setConnecting: (isConnecting) => set({ isConnecting }, false, 'setConnecting'),
      
      setConnectionError: (connectionError) => set({ connectionError }, false, 'setConnectionError'),
      
      // ── Reset ──────────────────────────────────────────────────────────────
      
      reset: () => set(initialState, false, 'reset'),
    })),
    { name: 'vibespeak-store' }
  )
);

// ── Selective Subscriptions (Performance Optimization) ───────────────────────

// Use these for component subscriptions to avoid unnecessary re-renders
export const useUser = () => useAppStore((state) => state.user);
export const useIsAuthenticated = () => useAppStore((state) => state.isAuthenticated);
export const useServers = () => useAppStore((state) => state.servers);
export const useActiveServerId = () => useAppStore((state) => state.activeServerId);
export const useActiveChannelId = () => useAppStore((state) => state.activeChannelId);
export const useMessages = (channelId: number) => useAppStore((state) => state.messages[channelId] || []);
export const useTypingUsers = (channelId: number) => useAppStore((state) => state.typingUsers[channelId] || []);
export const useMembers = () => useAppStore((state) => state.members);
export const useVoiceState = () => useAppStore((state) => ({
  isInVoice: state.isInVoice,
  isMuted: state.isMuted,
  isDeafened: state.isDeafened,
  isSpeaking: state.isSpeaking,
  currentVoiceChannel: state.currentVoiceChannel,
}));
export const useUIState = () => useAppStore((state) => ({
  rightDrawerOpen: state.rightDrawerOpen,
  rightDrawerMode: state.rightDrawerMode,
  settingsOpen: state.settingsOpen,
  searchModalOpen: state.searchModalOpen,
}));