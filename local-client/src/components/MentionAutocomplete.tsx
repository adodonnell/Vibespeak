import { useState, useEffect, useRef } from 'react';

interface User {
  id: string;
  username: string;
}

interface MentionAutocompleteProps {
  isOpen: boolean;
  query: string;
  users: User[];
  onSelect: (user: User) => void;
  onClose: () => void;
  position?: { top: number; left: number };
}

export function MentionAutocomplete({ 
  isOpen, 
  query, 
  users, 
  onSelect, 
  onClose,
  position 
}: MentionAutocompleteProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const filteredUsers = users.filter(user =>
    user.username.toLowerCase().includes(query.toLowerCase())
  );

  useEffect(() => {
    setSelectedIndex(0);
  }, [query, isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex(i => (i + 1) % filteredUsers.length);
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex(i => (i - 1 + filteredUsers.length) % filteredUsers.length);
          break;
        case 'Enter':
          e.preventDefault();
          if (filteredUsers[selectedIndex]) {
            onSelect(filteredUsers[selectedIndex]);
          }
          break;
        case 'Escape':
          e.preventDefault();
          onClose();
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, filteredUsers, selectedIndex, onSelect, onClose]);

  // Scroll selected item into view
  useEffect(() => {
    if (listRef.current) {
      const selectedElement = listRef.current.children[selectedIndex] as HTMLElement;
      selectedElement?.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  if (!isOpen || filteredUsers.length === 0) return null;

  return (
    <div 
      className="mention-autocomplete"
      style={position ? { position: 'absolute', top: position.top, left: position.left } : undefined}
      ref={listRef}
    >
      <div className="mention-autocomplete-header">
        <span>Mention someone</span>
      </div>
      <div className="mention-autocomplete-list">
        {filteredUsers.map((user, index) => (
          <div
            key={user.id}
            className={`mention-autocomplete-item ${index === selectedIndex ? 'selected' : ''}`}
            onClick={() => onSelect(user)}
            onMouseEnter={() => setSelectedIndex(index)}
          >
            <div 
              className="mention-autocomplete-avatar"
              style={{ 
                background: getAvatarGradient(user.username) 
              }}
            >
              {user.username.charAt(0).toUpperCase()}
            </div>
            <span className="mention-autocomplete-username">{user.username}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function getAvatarGradient(username: string): string {
  const hash = username.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const gradients = [
    'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
    'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
    'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
    'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
  ];
  return gradients[hash % gradients.length];
}

// Hook to detect @ mentions in input
export function useMentionAutocomplete(
  inputValue: string,
  cursorPosition: number,
  availableUsers: User[]
) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [position, setPosition] = useState({ top: 0, left: 0 });

  useEffect(() => {
    // Find @ symbol before cursor
    const textBeforeCursor = inputValue.slice(0, cursorPosition);
    const atIndex = textBeforeCursor.lastIndexOf('@');

    if (atIndex !== -1) {
      // Check if we're in a mention context (no space after @)
      const textAfterAt = textBeforeCursor.slice(atIndex + 1);
      const hasSpace = textAfterAt.includes(' ');
      
      if (!hasSpace && atIndex >= 0) {
        setQuery(textAfterAt);
        setIsOpen(true);
        // Estimate position (this would need DOM measurement in real implementation)
        setPosition({ top: 60, left: 20 });
        return;
      }
    }
    setIsOpen(false);
    setQuery('');
  }, [inputValue, cursorPosition]);

  const handleSelect = (user: User): string => {
    const textBeforeCursor = inputValue.slice(0, cursorPosition);
    const atIndex = textBeforeCursor.lastIndexOf('@');
    
    if (atIndex !== -1) {
      const before = inputValue.slice(0, atIndex);
      const after = inputValue.slice(cursorPosition);
      return `${before}@${user.username} ${after}`;
    }
    return inputValue;
  };

  return {
    isOpen,
    query,
    users: availableUsers,
    position,
    handleSelect,
    close: () => setIsOpen(false)
  };
}
