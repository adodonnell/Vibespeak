import React, { useRef, useEffect, useMemo, useState } from 'react';
import EmojiPickerButton from '../ui/EmojiPicker';
import MarkdownRenderer from '../ui/MarkdownRenderer';

export interface ChatMessage {
  id: string;
  sender: string;
  content: string;
  timestamp: number;
  edited_at?: number;
  reactions?: { emoji: string; count: number }[];
  isAdmin?: boolean;
}

interface ChatStreamProps {
  messages: ChatMessage[];
  onSendMessage: (message: string) => void;
  onEditMessage?: (messageId: string, newContent: string) => void;
  onDeleteMessage?: (messageId: string) => void;
  onReactMessage?: (messageId: string, emoji: string) => void;
  onReplyToMessage?: (message: ChatMessage) => void;
  onSearch?: (query: string) => void;
  messageInput: string;
  onMessageInputChange: (value: string) => void;
  currentUsername: string;
  channelName?: string;
  compactMode?: boolean;
  maxMessages?: number;
}

// Quick emoji reactions for message hover
const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🔥'];

const ChatStream: React.FC<ChatStreamProps> = ({
  messages,
  onSendMessage,
  onEditMessage,
  onDeleteMessage,
  onReactMessage,
  onReplyToMessage,
  messageInput,
  onMessageInputChange,
  currentUsername,
  channelName = 'channel',
  compactMode = true,
  maxMessages = 500
}) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const prevMessagesLengthRef = useRef<number>(0);
  const editInputRef = useRef<HTMLInputElement>(null);
  
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [hoveredMessageId, setHoveredMessageId] = useState<string | null>(null);
  const [replyingToMessage, setReplyingToMessage] = useState<ChatMessage | null>(null);

  // Performance: Limit messages to prevent DOM overload
  const displayMessages = useMemo(() => {
    if (messages.length > maxMessages) {
      return messages.slice(-maxMessages);
    }
    return messages;
  }, [messages, maxMessages]);

  // Only scroll to bottom on new messages
  useEffect(() => {
    const isNewMessage = messages.length > prevMessagesLengthRef.current;
    prevMessagesLengthRef.current = messages.length;
    
    if (isNewMessage && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [displayMessages.length]);

  // Focus edit input when editing starts
  useEffect(() => {
    if (editingMessageId && editInputRef.current) {
      editInputRef.current.focus();
    }
  }, [editingMessageId]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (messageInput.trim()) {
      onSendMessage(messageInput.trim());
    }
  };

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit',
      hour12: false 
    });
  };

  const handleEmojiClick = (emoji: string) => {
    onMessageInputChange(messageInput + emoji);
    setShowEmojiPicker(false);
  };

  const handleStartEdit = (message: ChatMessage) => {
    setEditingMessageId(message.id);
    setEditContent(message.content);
  };

  const handleSaveEdit = () => {
    if (editingMessageId && editContent.trim() && onEditMessage) {
      onEditMessage(editingMessageId, editContent.trim());
      setEditingMessageId(null);
      setEditContent('');
    }
  };

  const handleCancelEdit = () => {
    setEditingMessageId(null);
    setEditContent('');
  };

  const handleDelete = (messageId: string) => {
    if (onDeleteMessage && window.confirm('Delete this message?')) {
      onDeleteMessage(messageId);
    }
  };

  const handleQuickReaction = (messageId: string, emoji: string) => {
    if (onReactMessage) {
      onReactMessage(messageId, emoji);
    }
  };

  const handleReply = (message: ChatMessage) => {
    setReplyingToMessage(message);
    onMessageInputChange(`@${message.sender} `);
  };

  const renderMessageActions = (message: ChatMessage) => {
    const isOwnMessage = message.sender === currentUsername;
    
    return (
      <div className="message-actions" style={{
        display: 'flex',
        gap: '4px',
        opacity: 0,
        transition: 'opacity 0.2s'
      }}>
        {/* Quick Reactions */}
        <div style={{ display: 'flex', gap: '2px' }}>
          {QUICK_REACTIONS.slice(0, 3).map(emoji => (
            <button
              key={emoji}
              type="button"
              onClick={() => handleQuickReaction(message.id, emoji)}
              style={{
                background: 'transparent',
                border: 'none',
                fontSize: '14px',
                cursor: 'pointer',
                padding: '2px 4px',
                borderRadius: '4px',
                opacity: 0.7
              }}
              title="React"
            >
              {emoji}
            </button>
          ))}
        </div>
        
        {/* Reply */}
        <button
          type="button"
          onClick={() => handleReply(message)}
          className="message-action-btn"
          title="Reply"
        >
          ↩
        </button>
        
        {/* Edit - only for own messages */}
        {isOwnMessage && onEditMessage && (
          <button
            type="button"
            onClick={() => handleStartEdit(message)}
            className="message-action-btn"
            title="Edit"
          >
            ✏️
          </button>
        )}
        
        {/* Delete - only for own messages */}
        {isOwnMessage && onDeleteMessage && (
          <button
            type="button"
            onClick={() => handleDelete(message.id)}
            className="message-action-btn delete"
            title="Delete"
            style={{ color: 'var(--danger)' }}
          >
            🗑️
          </button>
        )}
      </div>
    );
  };

  const renderMessage = (message: ChatMessage, index: number) => {
    const isOwnMessage = message.sender === currentUsername;
    const isEditing = editingMessageId === message.id;
    const showAvatar = index === 0 || displayMessages[index - 1].sender !== message.sender;
    
    if (compactMode) {
      return (
        <div 
          key={message.id} 
          className="message-dense"
          onMouseEnter={() => setHoveredMessageId(message.id)}
          onMouseLeave={() => setHoveredMessageId(null)}
          style={{ position: 'relative' }}
        >
          {hoveredMessageId === message.id && renderMessageActions(message)}
          
          {showAvatar && (
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginTop: '8px' }}>
              <span className="message-dense-time" style={{ color: 'var(--text-muted)', fontSize: '11px' }}>
                {formatTime(message.timestamp)}
              </span>
              <span className="message-dense-author" style={{ color: isOwnMessage ? 'var(--accent-teal)' : 'var(--accent-blurple)', fontWeight: 600 }}>
                {message.isAdmin && <span style={{ marginRight: '4px', fontSize: '11px' }} title="Admin">🛡️</span>}
                {message.sender}
              </span>
            </div>
          )}
          
          {isEditing ? (
            <div style={{ display: 'flex', gap: '8px', marginTop: '2px', marginLeft: showAvatar ? 0 : 60 }}>
              <input
                ref={editInputRef}
                type="text"
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSaveEdit();
                  if (e.key === 'Escape') handleCancelEdit();
                }}
                style={{
                  flex: 1,
                  padding: '4px 8px',
                  borderRadius: '4px',
                  border: '2px solid var(--accent)',
                  background: 'var(--bg-tertiary)',
                  color: 'var(--text-normal)',
                  fontSize: '14px'
                }}
              />
              <button
                onClick={handleSaveEdit}
                style={{ padding: '4px 8px', background: 'var(--accent)', border: 'none', borderRadius: '4px', color: 'white', cursor: 'pointer' }}
              >
                Save
              </button>
              <button
                onClick={handleCancelEdit}
                style={{ padding: '4px 8px', background: 'var(--bg-tertiary)', border: 'none', borderRadius: '4px', color: 'var(--text-muted)', cursor: 'pointer' }}
              >
                Cancel
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: '4px', marginTop: '2px', marginLeft: showAvatar ? 0 : 60 }}>
              <span className="message-dense-content" style={{ flex: 1 }}>
                <MarkdownRenderer content={message.content} />
              </span>
              {message.edited_at && (
                <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontStyle: 'italic' }}>(edited)</span>
              )}
            </div>
          )}
          
          {/* Reactions display */}
          {message.reactions && message.reactions.length > 0 && (
            <div style={{ display: 'flex', gap: '4px', marginTop: '4px', marginLeft: showAvatar ? 0 : 60 }}>
              {message.reactions.map((reaction, i) => (
                <span
                  key={i}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '2px',
                    padding: '2px 6px',
                    background: 'var(--bg-tertiary)',
                    borderRadius: '10px',
                    fontSize: '12px',
                    cursor: 'pointer'
                  }}
                  onClick={() => handleQuickReaction(message.id, reaction.emoji)}
                >
                  {reaction.emoji} {reaction.count > 1 && reaction.count}
                </span>
              ))}
            </div>
          )}
        </div>
      );
    }

    // Non-compact mode (full message with avatar)
    return (
      <div 
        key={message.id} 
        className="message"
        onMouseEnter={() => setHoveredMessageId(message.id)}
        onMouseLeave={() => setHoveredMessageId(null)}
        style={{ position: 'relative' }}
      >
        {hoveredMessageId === message.id && renderMessageActions(message)}
        
        <div className="message-avatar">
          {message.sender.charAt(0).toUpperCase()}
        </div>
        <div className="message-body">
          <div className="message-meta">
            <span className="message-author">
              {message.isAdmin && <span style={{ marginRight: '4px', fontSize: '12px' }} title="Admin">🛡️</span>}
              {message.sender}
            </span>
            <span className="message-time">{formatTime(message.timestamp)}</span>
            {message.edited_at && (
              <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontStyle: 'italic' }}>(edited)</span>
            )}
          </div>
          {isEditing ? (
            <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
              <input
                ref={editInputRef}
                type="text"
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSaveEdit();
                  if (e.key === 'Escape') handleCancelEdit();
                }}
                style={{
                  flex: 1,
                  padding: '8px',
                  borderRadius: '4px',
                  border: '2px solid var(--accent)',
                  background: 'var(--bg-tertiary)',
                  color: 'var(--text-normal)',
                  fontSize: '14px'
                }}
              />
              <button
                onClick={handleSaveEdit}
                style={{ padding: '8px 12px', background: 'var(--accent)', border: 'none', borderRadius: '4px', color: 'white', cursor: 'pointer' }}
              >
                Save
              </button>
              <button
                onClick={handleCancelEdit}
                style={{ padding: '8px 12px', background: 'var(--bg-tertiary)', border: 'none', borderRadius: '4px', color: 'var(--text-muted)', cursor: 'pointer' }}
              >
                Cancel
              </button>
            </div>
          ) : (
            <div className="message-content">
              <MarkdownRenderer content={message.content} />
            </div>
          )}
          
          {/* Reactions display */}
          {message.reactions && message.reactions.length > 0 && (
            <div style={{ display: 'flex', gap: '4px', marginTop: '8px' }}>
              {message.reactions.map((reaction, i) => (
                <span
                  key={i}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '2px',
                    padding: '2px 8px',
                    background: 'var(--bg-tertiary)',
                    borderRadius: '10px',
                    fontSize: '12px',
                    cursor: 'pointer'
                  }}
                  onClick={() => handleQuickReaction(message.id, reaction.emoji)}
                >
                  {reaction.emoji} {reaction.count > 1 && reaction.count}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="chat-stream" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
      <div className="chat-messages-dense">
        {displayMessages.length === 0 ? (
          <div className="no-messages">
            <p>No messages yet. Start the conversation!</p>
          </div>
        ) : (
          displayMessages.map((msg, idx) => renderMessage(msg, idx))
        )}
        <div ref={messagesEndRef} />
      </div>
      
      {/* Reply indicator */}
      {replyingToMessage && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 16px',
          background: 'var(--bg-tertiary)',
          borderLeft: '3px solid var(--accent)',
          margin: '0 16px'
        }}>
          <div>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Replying to </span>
            <span style={{ fontSize: '12px', fontWeight: 'bold' }}>{replyingToMessage.sender}</span>
            <p style={{ fontSize: '13px', color: 'var(--text-normal)', margin: '2px 0 0 0' }}>
              {replyingToMessage.content.substring(0, 50)}{replyingToMessage.content.length > 50 ? '...' : ''}
            </p>
          </div>
          <button
            onClick={() => setReplyingToMessage(null)}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              fontSize: '16px'
            }}
          >
            ✕
          </button>
        </div>
      )}
      
      <form onSubmit={handleSubmit} className="chat-input" style={{ 
        padding: '12px 16px', 
        display: 'flex', 
        alignItems: 'center', 
        gap: '8px' 
      }}>
        <button
          type="button"
          onClick={() => setShowEmojiPicker(!showEmojiPicker)}
          style={{
            background: 'transparent',
            border: 'none',
            fontSize: '20px',
            cursor: 'pointer',
            padding: '4px 8px',
            borderRadius: '4px',
          }}
          title="Add emoji"
        >
          😊
        </button>
        
        {showEmojiPicker && (
          <div style={{ position: 'absolute', bottom: '60px', zIndex: 100 }}>
            <EmojiPickerButton onEmojiClick={handleEmojiClick} />
          </div>
        )}
        
        <input
          type="text"
          value={messageInput}
          onChange={(e) => onMessageInputChange(e.target.value)}
          placeholder={`Message #${channelName}`}
          style={{
            flex: 1,
            padding: '8px 12px',
            borderRadius: '4px',
            border: '1px solid #3f4147',
            background: '#383a40',
            color: '#dbdee1',
            fontSize: '14px',
            outline: 'none',
          }}
        />
      </form>
    </div>
  );
};

export default ChatStream;
