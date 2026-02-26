/**
 * Shared type definitions for the VibeSpeak application
 */

// Voice channel user representation - complete interface used across the app
export interface VoiceUser {
  id: string;
  username: string;
  avatar?: string;
  ping: number;
  packetLoss: number;
  isSpeaking: boolean;
  audioLevel: number;
  isMuted: boolean;
  isDeafened: boolean;
  isAdmin?: boolean;
  // Extended stats
  bytesSent?: number;
  bytesReceived?: number;
  packetsReceived?: number;
  packetsLost?: number;
  jitter?: number;
  codec?: string;
  bitrate?: number;
  connectedSince?: number;
  idleTime?: number;
}

// Screen share information
export interface ScreenShareInfo {
  stream: MediaStream;
  presenterName: string;
  isLocal: boolean;
}

// Chat message representation
export interface ChatMessage {
  id: string;
  sender: string;
  senderId?: number;
  content: string;
  timestamp: number;
  edited?: boolean;
  editedAt?: number;
  edited_at?: number; // Legacy field used in some components
  reactions?: { emoji: string; count: number; users: number[]; reacted?: boolean }[];
  replyCount?: number;
  pinned?: boolean;
  parentId?: string | null;
  mentions?: number[];
  replyToContent?: string;
  replyToSender?: string;
  // Additional fields used in ChatStream
  isAdmin?: boolean;
}
