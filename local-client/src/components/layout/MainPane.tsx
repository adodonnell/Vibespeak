import React, { useState, useRef, useEffect, useCallback, memo, useMemo } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import ScreenShareViewer from '../stage/ScreenShareViewer';
import ScreenShareStartModal, { ScreenShareQuality } from '../stage/ScreenShareStartModal';
import MarkdownRenderer from '../ui/MarkdownRenderer';
import FileUploader, { FilePreview, UploadedFile } from '../ui/FileUploader';
import Stage from './Stage';
import { VoiceUser, ChatMessage } from '../../types';
import './MainPane.css';

export type { ChatMessage };

interface MainPaneProps {
  viewMode: 'text' | 'voice';
  channelName: string;
  channelTopic?: string;
  channelId?: number;
  messages?: ChatMessage[];
  searchResults?: ChatMessage[];
  voiceUsers?: VoiceUser[];
  messageInput: string;
  replyingTo?: { id: string; sender: string; content: string } | null;
  typingUsers?: string[];
  onMessageInputChange: (value: string) => void;
  onSendMessage: (content: string, replyTo?: string) => void;
  onCancelReply?: () => void;
  onEditMessage?: (messageId: string, newContent: string) => void;
  onDeleteMessage?: (messageId: string) => void;
  onReactMessage?: (messageId: string, emoji: string) => void;
  onPinMessage?: (messageId: string) => void;
  onUnpinMessage?: (messageId: string) => void;
  onReplyTo?: (message: ChatMessage) => void;
  onSearchMessages?: (query: string) => void;
  onOpenPins?: () => void;
  onJoinVoice?: () => void;
  onLeaveVoice?: () => void;
  isInVoice?: boolean;
  onMembersClick?: () => void;
  currentUserId?: number;
  screenShareStream?: MediaStream | null;
  screenSharePresenter?: string;
  isLocalScreenShare?: boolean;
  screenShares?: Map<string, {
    stream: MediaStream;
    presenterName: string;
    isLocal: boolean;
  }>;
  currentUsername: string;
  onStartScreenShare?: () => void;
  onStopScreenShare?: () => void;
  onTypingStart?: () => void;
  onTypingStop?: () => void;
}

const ALL_EMOJIS = ['👍','❤️','😂','😮','😢','🎉','🔥','👀','🐋','😊','🙏','👋','😎','🤔','😱','🥳','😇','🤯','🤡','💀'];
const GROUP_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

// ── Helpers ───────────────────────────────────────────────────────────────────
function getAvatarGradient(username: string | undefined | null) {
  const name = username || '?';
  const hash = name.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  const gradients = [
    'linear-gradient(135deg,#667eea 0%,#764ba2 100%)',
    'linear-gradient(135deg,#f093fb 0%,#f5576c 100%)',
    'linear-gradient(135deg,#4facfe 0%,#00f2fe 100%)',
    'linear-gradient(135deg,#43e97b 0%,#38f9d7 100%)',
    'linear-gradient(135deg,#fa709a 0%,#fee140 100%)',
    'linear-gradient(135deg,#a8edea 0%,#fed6e3 100%)',
    'linear-gradient(135deg,#ff9a9e 0%,#fecfef 100%)',
    'linear-gradient(135deg,#fbc2eb 0%,#a6c1ee 100%)',
  ];
  return gradients[hash % gradients.length];
}

function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatFullTime(ts: number) {
  return new Date(ts).toLocaleString([], {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function formatDateDivider(ts: number): string {
  const d = new Date(ts);
  const today = new Date(); today.setHours(0,0,0,0);
  const yesterday = new Date(today); yesterday.setDate(today.getDate()-1);
  const msgDay = new Date(d); msgDay.setHours(0,0,0,0);
  if (msgDay.getTime() === today.getTime()) return 'Today';
  if (msgDay.getTime() === yesterday.getTime()) return 'Yesterday';
  return d.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

// Spoiler: ||text|| rendered as blacked-out, click to reveal
function renderSpoilers(text: string): React.ReactNode[] {
  const parts = text.split(/(\\|\\|[^|]+\\|\\|)/g);
  return parts.map((part, i) => {
    const m = part.match(/^\|\|(.+)\|\|$/s);
    if (m) return <SpoilerSpan key={i} text={m[1]} />;
    return <span key={i}>{part}</span>;
  });
}

const SpoilerSpan: React.FC<{ text: string }> = ({ text }) => {
  const [revealed, setRevealed] = useState(false);
  return (
    <span
      className={`spoiler ${revealed ? 'revealed' : ''}`}
      onClick={() => setRevealed(true)}
      title={revealed ? '' : 'Click to reveal spoiler'}
    >
      {revealed ? text : text.replace(/./g, '█')}
    </span>
  );
};

// ── SVG Icon components ───────────────────────────────────────────────────────
const IconReply = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
    <path d="M10 9V5l-7 7 7 7v-4.1c5 0 8.5 1.6 11 5.1-1-5-4-10-11-11z"/>
  </svg>
);
const IconEdit = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
    <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
  </svg>
);
const IconDelete = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
    <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
  </svg>
);
const IconPin = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
    <path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z"/>
  </svg>
);
const IconReact = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
    <path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm3.5-9c.83 0 1.5-.67 1.5-1.5S16.33 8 15.5 8 14 8.67 14 9.5s.67 1.5 1.5 1.5zm-7 0c.83 0 1.5-.67 1.5-1.5S9.33 8 8.5 8 7 8.67 7 9.5 7.67 11 8.5 11zm3.5 6.5c2.33 0 4.31-1.46 5.11-3.5H6.89c.8 2.04 2.78 3.5 5.11 3.5z"/>
  </svg>
);
const IconMore = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/>
  </svg>
);
const IconSearch = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
    <path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0016 9.5 6.5 6.5 0 109.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>
  </svg>
);
const IconPin2 = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
    <path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z"/>
  </svg>
);
const IconMembers = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
    <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/>
  </svg>
);
const IconHashtag = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
    <path d="M10.5 20.5v-3.5H7.5l.5-3h2.5V11H7.5l.5-3H10V5.5H12.5V8H15.5V5.5H18V8h.5l-.5 3H15.5v3H18l-.5 3H15v3.5h-2.5v-3.5h-2z"/>
  </svg>
);
const IconSend = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
    <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
  </svg>
);
const IconPlus = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
    <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
  </svg>
);
const IconEmoji = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
    <path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm3.5-9c.83 0 1.5-.67 1.5-1.5S16.33 8 15.5 8 14 8.67 14 9.5s.67 1.5 1.5 1.5zm-7 0c.83 0 1.5-.67 1.5-1.5S9.33 8 8.5 8 7 8.67 7 9.5 7.67 11 8.5 11zm3.5 6.5c2.33 0 4.31-1.46 5.11-3.5H6.89c.8 2.04 2.78 3.5 5.11 3.5z"/>
  </svg>
);
const IconGif = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
    <path d="M11.5 9H13v6h-1.5zM9 9H6c-.6 0-1 .5-1 1v4c0 .5.4 1 1 1h3c.6 0 1-.5 1-1v-2H8.5v1.5h-2v-3H10V10c0-.5-.4-1-1-1zm10 1.5V9h-4.5v6H16v-2h2v-1.5h-2v-1z"/>
  </svg>
);
const IconChevronDown = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
    <path d="M7 10l5 5 5-5z"/>
  </svg>
);

// ── Single message row (memo for perf) ───────────────────────────────────────
interface MessageRowProps {
  message: ChatMessage;
  isGrouped: boolean;
  isOwnMessage: boolean;
  editingMessageId: string | null;
  editContent: string;
  showEmojiPicker: string | null;
  onStartEdit: (m: ChatMessage) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onEditContentChange: (v: string) => void;
  onDelete: (id: string) => void;
  onReact: (id: string, emoji: string) => void;
  onPin: (id: string) => void;
  onUnpin: (id: string) => void;
  onReply: (m: ChatMessage) => void;
  onToggleEmojiPicker: (id: string | null) => void;
}

const MessageRow = memo<MessageRowProps>(({
  message, isGrouped, isOwnMessage,
  editingMessageId, editContent, showEmojiPicker,
  onStartEdit, onSaveEdit, onCancelEdit, onEditContentChange,
  onDelete, onReact, onPin, onUnpin, onReply, onToggleEmojiPicker,
}) => {
  const isEditing = editingMessageId === message.id;

  return (
    <div
      className={`message ${isGrouped ? 'grouped' : ''} ${message.pinned ? 'pinned' : ''}`}
      data-id={message.id}
    >
      {/* Avatar (only on first message of a group) */}
      {!isGrouped ? (
        <div className="message-avatar" style={{ background: getAvatarGradient(message.sender) }}>
          {(message.sender || '?').charAt(0).toUpperCase()}
        </div>
      ) : (
        <div className="message-avatar-gap">
          <span className="message-time-compact">{formatTime(message.timestamp)}</span>
        </div>
      )}

      <div className="message-content">
        {/* Header — only on first of group */}
        {!isGrouped && (
          <div className="message-header">
            <span className="message-author">{message.sender || 'Unknown'}</span>
            <span className="message-time" title={formatFullTime(message.timestamp)}>
              {formatTime(message.timestamp)}
            </span>
            {message.edited && (
              <span className="message-edited" title={message.editedAt ? formatFullTime(message.editedAt) : 'Edited'}>
                (edited)
              </span>
            )}
            {message.pinned && <span className="message-pinned-badge">📌</span>}
          </div>
        )}

        {/* Reply preview */}
        {message.parentId && (
          <div className="message-reply-preview">
            <div className="reply-bar" />
            <span className="reply-sender">{message.replyToSender || 'Unknown'}</span>
            <span className="reply-content">{message.replyToContent || 'Original message'}</span>
          </div>
        )}

        {/* Body */}
        {isEditing ? (
          <div className="message-edit">
            <textarea
              value={editContent}
              onChange={e => onEditContentChange(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSaveEdit(); }
                if (e.key === 'Escape') onCancelEdit();
              }}
              autoFocus
              rows={Math.max(1, editContent.split('\n').length)}
            />
            <div className="edit-actions">
              <span>esc to <button className="edit-link-btn" onClick={onCancelEdit}>cancel</button> · enter to <button className="edit-link-btn" onClick={onSaveEdit}>save</button></span>
            </div>
          </div>
        ) : (
          <div className="message-text">
            <MarkdownRenderer content={message.content} />
          </div>
        )}

        {/* Reactions */}
        {message.reactions && message.reactions.length > 0 && (
          <div className="message-reactions">
            {message.reactions.map((r, i) => (
              <button
                key={i}
                className={`reaction ${r.reacted ? 'reacted' : ''}`}
                onClick={() => onReact(message.id, r.emoji)}
                title={`${r.count} reaction${r.count !== 1 ? 's' : ''}`}
              >
                <span className="reaction-emoji">{r.emoji}</span>
                <span className="reaction-count">{r.count}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Hover action toolbar */}
      <div className="message-actions">
        <button className="action-btn" onClick={() => onToggleEmojiPicker(showEmojiPicker === message.id ? null : message.id)} title="Add Reaction">
          <IconReact />
        </button>
        <button className="action-btn" onClick={() => onReply(message)} title="Reply">
          <IconReply />
        </button>
        {isOwnMessage && (
          <button className="action-btn" onClick={() => onStartEdit(message)} title="Edit">
            <IconEdit />
          </button>
        )}
        <button
          className="action-btn"
          onClick={() => message.pinned ? onUnpin(message.id) : onPin(message.id)}
          title={message.pinned ? 'Unpin' : 'Pin'}
        >
          <IconPin />
        </button>
        {isOwnMessage && (
          <button className="action-btn delete" onClick={() => onDelete(message.id)} title="Delete">
            <IconDelete />
          </button>
        )}
      </div>

      {/* Quick emoji picker */}
      {showEmojiPicker === message.id && (
        <div className="quick-reactions">
          {ALL_EMOJIS.slice(0, 12).map(emoji => (
            <button key={emoji} onClick={() => { onReact(message.id, emoji); onToggleEmojiPicker(null); }}>
              {emoji}
            </button>
          ))}
        </div>
      )}
    </div>
  );
});

MessageRow.displayName = 'MessageRow';

// ── Typing indicator ──────────────────────────────────────────────────────────
const TypingIndicator: React.FC<{ users: string[] }> = ({ users }) => {
  if (users.length === 0) return null;
  const text = users.length === 1
    ? `${users[0]} is typing`
    : users.length === 2
    ? `${users[0]} and ${users[1]} are typing`
    : `${users[0]} and ${users.length - 1} others are typing`;
  return (
    <div className="typing-indicator">
      <span className="typing-dots">
        <span /><span /><span />
      </span>
      <span className="typing-text">{text}…</span>
    </div>
  );
};

// ── Message skeleton for loading state ────────────────────────────────────────
const MessageSkeleton: React.FC<{ count?: number }> = ({ count = 5 }) => {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className={`message-skeleton ${i > 0 ? 'grouped' : ''}`}>
          {i === 0 ? (
            <div className="skeleton-avatar" />
          ) : (
            <div className="skeleton-gap" />
          )}
          <div className="skeleton-content">
            {i === 0 && (
              <div className="skeleton-header">
                <div className="skeleton-name" />
                <div className="skeleton-time" />
              </div>
            )}
            <div className="skeleton-lines">
              <div className="skeleton-line" />
              {i % 2 === 0 && <div className="skeleton-line" style={{ width: '60%' }} />}
            </div>
          </div>
        </div>
      ))}
    </>
  );
};

// ── Main component ────────────────────────────────────────────────────────────
const MainPane: React.FC<MainPaneProps> = ({
  viewMode, channelName, channelTopic, channelId,
  messages = [], searchResults = [], voiceUsers = [],
  messageInput, replyingTo, typingUsers = [],
  onMessageInputChange, onSendMessage, onCancelReply,
  onEditMessage, onDeleteMessage, onReactMessage,
  onPinMessage, onUnpinMessage, onReplyTo,
  onSearchMessages, onOpenPins, onJoinVoice, onLeaveVoice,
  isInVoice = false, onMembersClick, currentUserId,
  screenShareStream, screenSharePresenter = '', isLocalScreenShare = false,
  screenShares,
  currentUsername = '',
  onStartScreenShare, onStopScreenShare,
  onTypingStart, onTypingStop,
}) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const _shareStreamRef = useRef<MediaStream | null>(null);
  const shareVideoRef = useRef<HTMLVideoElement>(null);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isTypingRef = useRef(false);

  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState<string | null>(null);
  const [showInputEmojiPicker, setShowInputEmojiPicker] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  const [atBottom, setAtBottom] = useState(true);
  const [newMsgCount, setNewMsgCount] = useState(0);
  const [showScreenShareModal, setShowScreenShareModal] = useState(false);
  const [screenShareQuality, setScreenShareQuality] = useState<ScreenShareQuality>('1080p60');

  // Auto-resize textarea
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, window.innerHeight * 0.5) + 'px';
  }, [messageInput]);

  // Scroll tracking
  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const bottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    setAtBottom(bottom);
    if (bottom) setNewMsgCount(0);
  }, []);

  // Auto-scroll when new message arrives (only if already at bottom)
  const prevMsgCount = useRef(messages.length);
  useEffect(() => {
    if (messages.length > prevMsgCount.current) {
      if (atBottom) {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        setNewMsgCount(0);
      } else {
        setNewMsgCount(c => c + (messages.length - prevMsgCount.current));
      }
    }
    prevMsgCount.current = messages.length;
  }, [messages.length, atBottom]);

  // Jump to bottom on channel switch
  useEffect(() => {
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
      setAtBottom(true);
      setNewMsgCount(0);
    }, 50);
  }, [channelId]);

  // Ctrl+K global search
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); setShowSearch(s => !s); }
    };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, []);

  // Screen share cleanup
  useEffect(() => {
    return () => {
      if (_shareStreamRef.current) {
        _shareStreamRef.current.getTracks().forEach(t => t.stop());
        _shareStreamRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (shareVideoRef.current && _shareStreamRef.current) {
      shareVideoRef.current.srcObject = _shareStreamRef.current;
    }
  }, [isSharing]);

  // Typing event emission — debounced stop after 3s silence
  const handleInputChange = useCallback((value: string) => {
    onMessageInputChange(value);
    if (!isTypingRef.current && value.length > 0) {
      isTypingRef.current = true;
      onTypingStart?.();
    }
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => {
      if (isTypingRef.current) {
        isTypingRef.current = false;
        onTypingStop?.();
      }
    }, 3000);
    if (value.length === 0) {
      if (isTypingRef.current) {
        isTypingRef.current = false;
        onTypingStop?.();
      }
    }
  }, [onMessageInputChange, onTypingStart, onTypingStop]);

  const handleSend = useCallback(() => {
    const trimmed = messageInput.trim();
    if (!trimmed) return;
    if (isTypingRef.current) {
      isTypingRef.current = false;
      onTypingStop?.();
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    }
    onSendMessage(trimmed, replyingTo?.id);
    onMessageInputChange('');
    if (replyingTo) onCancelReply?.();
    setEditingMessageId(null);
  }, [messageInput, replyingTo, onSendMessage, onMessageInputChange, onCancelReply, onTypingStop]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (editingMessageId) handleSaveEdit();
      else handleSend();
    }
    if (e.key === 'Escape') {
      if (editingMessageId) { setEditingMessageId(null); setEditContent(''); }
      else if (showSearch) { setShowSearch(false); setSearchQuery(''); }
      else if (replyingTo) { onCancelReply?.(); onMessageInputChange(''); }
    }
  }, [editingMessageId, showSearch, replyingTo, handleSend, onCancelReply, onMessageInputChange]);

  const handleSaveEdit = useCallback(() => {
    if (editingMessageId && editContent.trim()) {
      onEditMessage?.(editingMessageId, editContent.trim());
      setEditingMessageId(null);
      setEditContent('');
    }
  }, [editingMessageId, editContent, onEditMessage]);

  const handleStartEdit = useCallback((m: ChatMessage) => {
    setEditingMessageId(m.id);
    setEditContent(m.content);
  }, []);

  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim() || !onSearchMessages) return;
    setIsSearching(true);
    try { onSearchMessages(searchQuery); } finally { setIsSearching(false); }
  }, [searchQuery, onSearchMessages]);

  const handleStartShare = async (quality: ScreenShareQuality = '1080p60') => {
    try {
      setShareError(null);
      
      // Map quality to constraints
      const fps = quality.includes('60') ? 60 : 30;
      let width = 1920;
      let height = 1080;
      
      if (quality.startsWith('720')) {
        width = 1280;
        height = 720;
      } else if (quality.startsWith('480')) {
        width = 854;
        height = 480;
      }
      
      const constraints: DisplayMediaStreamOptions = {
        video: { 
          width: { ideal: width },
          height: { ideal: height },
          frameRate: { ideal: fps, max: fps },
        },
        audio: false,
      };
      
      const stream = await navigator.mediaDevices.getDisplayMedia(constraints);
      _shareStreamRef.current = stream;
      setIsSharing(true);
      setScreenShareQuality(quality);
      stream.getVideoTracks()[0].addEventListener('ended', () => {
        _shareStreamRef.current = null;
        setIsSharing(false);
      });
    } catch (err: any) {
      if (err?.name !== 'NotAllowedError' && err?.name !== 'AbortError') {
        setShareError('Screen share failed: ' + (err?.message ?? 'unknown'));
      }
    }
  };

  const handleScreenShareStart = (quality: ScreenShareQuality) => {
    setShowScreenShareModal(false);
    handleStartShare(quality);
  };

  const handleStopShare = () => {
    if (_shareStreamRef.current) { _shareStreamRef.current.getTracks().forEach(t => t.stop()); _shareStreamRef.current = null; }
    setIsSharing(false);
  };

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    setNewMsgCount(0);
  }, []);

  // Build virtual list items with grouping info pre-computed
  const virtualItems = useMemo(() => {
    const result: Array<{
      type: 'divider' | 'message';
      key: string;
      message?: ChatMessage;
      isGrouped?: boolean;
      timestamp?: number;
    }> = [];
    let lastDay = '';
    let lastSender = '';
    let lastTimestamp = 0;

    messages.forEach((msg, idx) => {
      const day = new Date(msg.timestamp).toDateString();
      if (day !== lastDay) {
        lastDay = day;
        result.push({
          type: 'divider',
          key: `divider-${msg.id}`,
          timestamp: msg.timestamp,
        });
        lastSender = '';
        lastTimestamp = 0;
      }

      const grouped =
        msg.sender === lastSender &&
        !msg.parentId &&
        msg.timestamp - lastTimestamp < GROUP_THRESHOLD_MS &&
        (idx === 0 || messages[idx - 1].sender === msg.sender);

      lastSender = msg.sender;
      lastTimestamp = msg.timestamp;

      result.push({
        type: 'message',
        key: msg.id,
        message: msg,
        isGrouped: grouped,
      });
    });
    return result;
  }, [messages]);

  // Virtualizer for large message lists
  const rowVirtualizer = useVirtualizer({
    count: virtualItems.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: (index) => {
      const item = virtualItems[index];
      if (item?.type === 'divider') return 40;
      if (item?.isGrouped) return 28; // Grouped messages are shorter
      return 64; // Full message with avatar
    },
    overscan: 10, // Render 10 extra items above/below viewport
  });

  // Build grouped message list with date dividers (non-virtualized fallback for small lists)
  const renderMessageList = (msgs: ChatMessage[]) => {
    const items: React.ReactNode[] = [];
    let lastDay = '';
    let lastSender = '';
    let lastTimestamp = 0;

    msgs.forEach((msg, idx) => {
      // Date divider
      const day = new Date(msg.timestamp).toDateString();
      if (day !== lastDay) {
        lastDay = day;
        items.push(
          <div key={`divider-${msg.id}`} className="date-divider">
            <div className="date-divider-line" />
            <span className="date-divider-label">{formatDateDivider(msg.timestamp)}</span>
            <div className="date-divider-line" />
          </div>
        );
        lastSender = '';
        lastTimestamp = 0;
      }

      const grouped =
        msg.sender === lastSender &&
        !msg.parentId &&
        msg.timestamp - lastTimestamp < GROUP_THRESHOLD_MS &&
        (idx === 0 || msgs[idx - 1].sender === msg.sender);

      lastSender = msg.sender;
      lastTimestamp = msg.timestamp;

      items.push(
        <MessageRow
          key={msg.id}
          message={msg}
          isGrouped={grouped}
          isOwnMessage={msg.senderId === currentUserId}
          editingMessageId={editingMessageId}
          editContent={editContent}
          showEmojiPicker={showEmojiPicker}
          onStartEdit={handleStartEdit}
          onSaveEdit={handleSaveEdit}
          onCancelEdit={() => { setEditingMessageId(null); setEditContent(''); }}
          onEditContentChange={setEditContent}
          onDelete={id => onDeleteMessage?.(id)}
          onReact={(id, emoji) => onReactMessage?.(id, emoji)}
          onPin={id => onPinMessage?.(id)}
          onUnpin={id => onUnpinMessage?.(id)}
          onReply={m => onReplyTo?.(m)}
          onToggleEmojiPicker={setShowEmojiPicker}
        />
      );
    });
    return items;
  };

  // Render virtualized messages (for large lists > 100 items)
  const renderVirtualizedMessages = () => {
    return (
      <div
        style={{
          height: `${rowVirtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {rowVirtualizer.getVirtualItems().map((virtualRow) => {
          const item = virtualItems[virtualRow.index];
          if (!item) return null;

          return (
            <div
              key={item.key}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: `${virtualRow.size}px`,
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              {item.type === 'divider' ? (
                <div className="date-divider">
                  <div className="date-divider-line" />
                  <span className="date-divider-label">{formatDateDivider(item.timestamp!)}</span>
                  <div className="date-divider-line" />
                </div>
              ) : (
                <MessageRow
                  message={item.message!}
                  isGrouped={item.isGrouped!}
                  isOwnMessage={item.message!.senderId === currentUserId}
                  editingMessageId={editingMessageId}
                  editContent={editContent}
                  showEmojiPicker={showEmojiPicker}
                  onStartEdit={handleStartEdit}
                  onSaveEdit={handleSaveEdit}
                  onCancelEdit={() => { setEditingMessageId(null); setEditContent(''); }}
                  onEditContentChange={setEditContent}
                  onDelete={id => onDeleteMessage?.(id)}
                  onReact={(id, emoji) => onReactMessage?.(id, emoji)}
                  onPin={id => onPinMessage?.(id)}
                  onUnpin={id => onUnpinMessage?.(id)}
                  onReply={m => onReplyTo?.(m)}
                  onToggleEmojiPicker={setShowEmojiPicker}
                />
              )}
            </div>
          );
        })}
      </div>
    );
  };

  // ── Voice pane layout ───────────────────────────────────────────────
  if (viewMode === 'voice') {
    const hasScreenShare = screenShareStream || (isSharing && _shareStreamRef.current);
    
    return (
      <div className="main-pane voice-pane">
        <div className="voice-header">
          <span className="channel-hash">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/>
            </svg>
          </span>
          <span className="channel-name">{channelName}</span>
          {channelTopic && <span className="channel-topic">{channelTopic}</span>}
        </div>
        
        <div className="voice-content">
          {/* Stage component for voice/screen share - handles multiple screen shares */}
          {hasScreenShare && (
            <Stage
              viewMode="voice"
              channelName={channelName}
              channelId={channelId}
              voiceUsers={voiceUsers}
              messages={messages}
              onSendMessage={onSendMessage}
              messageInput={messageInput}
              onMessageInputChange={onMessageInputChange}
              currentUsername={currentUsername}
              screenShareStream={screenShareStream}
              screenSharePresenter={screenSharePresenter}
              isLocalScreenShare={isLocalScreenShare}
              screenShares={screenShares}
              onStartScreenShare={onStartScreenShare}
              onStopScreenShare={onStopScreenShare}
            />
          )}
          
          {shareError && <div className="share-error">{shareError}</div>}
          
          {/* Users row - shown when no screen share */}
          {!hasScreenShare && (
            voiceUsers.length > 0 ? (
              <div className="voice-users-flex">
                {voiceUsers.map((u, i) => (
                  <div key={u.id || i} className={`voice-user-card compact ${u.isSpeaking ? 'speaking' : ''}`}>
                    <div className="voice-user-avatar" style={{ background: getAvatarGradient(u.username) }}>
                      {(u.username || '?').charAt(0).toUpperCase()}
                      {u.isMuted && <span className="muted-overlay">🔇</span>}
                    </div>
                    <span className="voice-user-name">{u.username}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="voice-empty voice-users-empty">
                <div className="voice-empty-icon">🎤</div>
                <h3>No one else is here</h3>
                <p>Be the first to join this voice channel!</p>
              </div>
            )
          )}
          
          {/* Action buttons at bottom */}
          <div className="voice-actions voice-actions-row">
            {isInVoice
              ? <button className="leave-voice-btn" onClick={onLeaveVoice}>Leave Voice</button>
              : <button className="join-voice-btn" onClick={onJoinVoice}>Join Voice</button>
            }
            {(screenShareStream && isLocalScreenShare) || isSharing ? (
              <button className="screen-share-btn stop" onClick={screenShareStream ? onStopScreenShare : handleStopShare}>🖥️ Stop Sharing</button>
            ) : (
              <button className="screen-share-btn" onClick={() => setShowScreenShareModal(true)}>🖥️ Share Screen</button>
            )}
            
            {/* Screen Share Quality Modal */}
            <ScreenShareStartModal
              isOpen={showScreenShareModal}
              channelName={channelName}
              defaultQuality={screenShareQuality}
              onStart={handleScreenShareStart}
              onCancel={() => setShowScreenShareModal(false)}
            />
          </div>
        </div>
      </div>
    );
  }

  // ── Search pane ────────────────────────────────────────────────────────────
  if (showSearch) {
    return (
      <div className="main-pane search-pane">
        <div className="search-header">
          <span className="search-title">Search Messages</span>
          <button className="search-close" onClick={() => setShowSearch(false)}>✕</button>
        </div>
        <div className="search-input-container">
          <input
            type="text" value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleSearch(); if (e.key === 'Escape') { setShowSearch(false); setSearchQuery(''); } }}
            placeholder="Search messages…"
            className="search-input" autoFocus
          />
          <button className="search-btn" onClick={handleSearch} disabled={!searchQuery.trim() || isSearching}>
            {isSearching ? '…' : <IconSearch />}
          </button>
        </div>
        <div className="search-results">
          {searchResults.length > 0 ? renderMessageList(searchResults)
            : searchQuery && !isSearching ? (
              <div className="search-empty"><p>No results for "{searchQuery}"</p></div>
            ) : (
              <div className="search-hint"><p>Search channel messages · Ctrl+K</p></div>
            )
          }
        </div>
      </div>
    );
  }

  // ── Text pane ──────────────────────────────────────────────────────────────
  return (
    <div className="main-pane text-pane">
      {/* Header */}
      <div className="chat-header">
        <div className="channel-info">
          <span className="channel-hash"><IconHashtag /></span>
          <span className="channel-name">{channelName}</span>
          {channelTopic && <span className="channel-topic">{channelTopic}</span>}
        </div>
        <div className="channel-actions">
          <button className="header-action-btn" onClick={() => setShowSearch(true)} title="Search (Ctrl+K)">
            <IconSearch />
          </button>
          <button className="header-action-btn" onClick={onOpenPins} title="Pinned Messages">
            <IconPin2 />
          </button>
          <button className="header-action-btn" onClick={onMembersClick} title="Members">
            <IconMembers />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="chat-messages" ref={scrollContainerRef} onScroll={handleScroll}>
        {messages.length === 0 ? (
          <div className="chat-empty">
            <div className="welcome-icon">
              <svg width="36" height="36" viewBox="0 0 24 24" fill="#80848E">
                <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z"/>
              </svg>
            </div>
            <h3>Welcome to #{channelName}</h3>
            <p>This is the start of the #{channelName} channel. Send a message to get the conversation going!</p>
          </div>
        ) : messages.length > 100 ? (
          // Use virtualization for large message lists
          renderVirtualizedMessages()
        ) : (
          // Standard rendering for smaller lists
          renderMessageList(messages)
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Typing indicator */}
      <TypingIndicator users={typingUsers.filter(Boolean)} />

      {/* Scroll-to-bottom button */}
      {!atBottom && (
        <button className={`scroll-to-bottom ${newMsgCount > 0 ? 'has-new' : ''}`} onClick={scrollToBottom}>
          <IconChevronDown />
          {newMsgCount > 0 && <span className="new-msg-badge">{newMsgCount}</span>}
        </button>
      )}

      {/* Reply banner */}
      {replyingTo && (
        <div className="replying-indicator">
          <div className="replying-content">
            <span className="replying-icon"><IconReply /></span>
            <span className="replying-text">
              Replying to <strong>{replyingTo.sender}</strong>
            </span>
            <span className="replying-preview">{replyingTo.content.slice(0, 80)}{replyingTo.content.length > 80 ? '…' : ''}</span>
          </div>
          <button className="cancel-reply-btn" onClick={() => { onCancelReply?.(); onMessageInputChange(''); }}>✕</button>
        </div>
      )}

      {/* Input area with drag & drop file upload */}
      <div className="chat-input-container">
        <FileUploader 
          onFilesSelect={(files) => {
            console.log('Files selected:', files);
            // TODO: Upload files to server and attach to message
          }}
          maxSize={25}
        >
          <div className="chat-input-wrapper">
          <button className="input-action-btn" title="Attach File"><IconPlus /></button>
          <textarea
            ref={inputRef}
            value={messageInput}
            onChange={e => handleInputChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={`Message #${channelName}`}
            className="chat-input"
            rows={1}
          />
          <button className="input-action-btn gif-btn" title="GIF"><IconGif /></button>
          <button
            className="input-action-btn"
            onClick={() => setShowInputEmojiPicker(v => !v)}
            title="Emoji"
          >
            <IconEmoji />
          </button>
          <button className="send-btn" onClick={handleSend} disabled={!messageInput.trim()} title="Send Message">
            <IconSend />
          </button>
          </div>
        </FileUploader>

        {/* Emoji picker */}
        {showInputEmojiPicker && (
          <div className="emoji-picker-popup">
            {ALL_EMOJIS.map(emoji => (
              <button key={emoji} className="emoji-picker-btn"
                onClick={() => { onMessageInputChange(messageInput + emoji); setShowInputEmojiPicker(false); inputRef.current?.focus(); }}>
                {emoji}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default MainPane;
