import { useState, useEffect, useRef } from 'react';
import { apiClient, Message } from '../services/api-client';
import './SearchModal.css';

interface SearchResult {
  type: 'message' | 'user' | 'server' | 'channel';
  id: string | number;
  title: string;
  description?: string;
  icon?: string;
}

interface SearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectResult: (result: SearchResult) => void;
  currentChannelId?: number;
}

export function SearchModal({ isOpen, onClose, onSelectResult }: SearchModalProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [activeTab, setActiveTab] = useState<'all' | 'messages' | 'users' | 'servers'>('all');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus();
      setQuery('');
      setResults([]);
    }
  }, [isOpen]);

  useEffect(() => {
    const search = async () => {
      if (!query.trim()) {
        setResults([]);
        return;
      }

      setIsSearching(true);
      try {
        // Search messages globally
        const messages = await apiClient.searchMessages(query, 10);
        
        const searchResults: SearchResult[] = [];

        // Add message results
        if (activeTab === 'all' || activeTab === 'messages') {
          messages.forEach((msg: Message) => {
            searchResults.push({
              type: 'message',
              id: msg.id,
              title: `Message in #${msg.channel_id}`,
              description: msg.content.substring(0, 100),
              icon: '💬'
            });
          });
        }

        // Search users
        if (activeTab === 'all' || activeTab === 'users') {
          try {
            const users = await apiClient.searchUsers(query);
            users.forEach((user: { id: number; username: string; display_name: string | null }) => {
              searchResults.push({
                type: 'user',
                id: user.id,
                title: user.username,
                description: user.display_name || undefined,
                icon: '👤'
              });
            });
          } catch (e) {
            // User search might not be available
          }
        }

        // Search servers
        if (activeTab === 'all' || activeTab === 'servers') {
          try {
            const servers = await apiClient.getServers();
            const filtered = servers.filter((s: { name: string }) => 
              s.name.toLowerCase().includes(query.toLowerCase())
            );
            filtered.forEach((server: { id: number; name: string }) => {
              searchResults.push({
                type: 'server',
                id: server.id,
                title: server.name,
                description: 'Server',
                icon: '🖥️'
              });
            });
          } catch (e) {
            // Server search might not be available
          }
        }

        setResults(searchResults);
      } catch (error) {
        console.error('Search failed:', error);
        setResults([]);
      } finally {
        setIsSearching(false);
      }
    };

    const debounce = setTimeout(search, 300);
    return () => clearTimeout(debounce);
  }, [query, activeTab]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    }
  };

  const handleResultClick = (result: SearchResult) => {
    onSelectResult(result);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="search-modal-overlay" onClick={onClose}>
      <div className="search-modal" onClick={e => e.stopPropagation()}>
        <div className="search-header">
          <div className="search-input-wrapper">
            <svg className="search-icon" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>
            </svg>
            <input
              ref={inputRef}
              type="text"
              className="search-input"
              placeholder="Search messages, users, servers..."
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
            />
            {query && (
              <button className="search-clear" onClick={() => setQuery('')}>
                ×
              </button>
            )}
          </div>
          
          <div className="search-tabs">
            <button 
              className={`search-tab ${activeTab === 'all' ? 'active' : ''}`}
              onClick={() => setActiveTab('all')}
            >
              All
            </button>
            <button 
              className={`search-tab ${activeTab === 'messages' ? 'active' : ''}`}
              onClick={() => setActiveTab('messages')}
            >
              Messages
            </button>
            <button 
              className={`search-tab ${activeTab === 'users' ? 'active' : ''}`}
              onClick={() => setActiveTab('users')}
            >
              Users
            </button>
            <button 
              className={`search-tab ${activeTab === 'servers' ? 'active' : ''}`}
              onClick={() => setActiveTab('servers')}
            >
              Servers
            </button>
          </div>
        </div>

        <div className="search-results">
          {isSearching ? (
            <div className="search-loading">
              <span className="search-spinner"></span>
              Searching...
            </div>
          ) : results.length > 0 ? (
            results.map((result, index) => (
              <div 
                key={`${result.type}-${result.id}-${index}`}
                className="search-result-item"
                onClick={() => handleResultClick(result)}
              >
                <span className="result-icon">{result.icon}</span>
                <div className="result-content">
                  <div className="result-title">{result.title}</div>
                  {result.description && (
                    <div className="result-description">{result.description}</div>
                  )}
                </div>
                <span className="result-type">{result.type}</span>
              </div>
            ))
          ) : query ? (
            <div className="search-empty">
              No results found for "{query}"
            </div>
          ) : (
            <div className="search-hint">
              Type to search messages, users, and servers
            </div>
          )}
        </div>

        <div className="search-footer">
          <span className="search-shortcut">
            <kbd>↑</kbd><kbd>↓</kbd> to navigate
          </span>
          <span className="search-shortcut">
            <kbd>Enter</kbd> to select
          </span>
          <span className="search-shortcut">
            <kbd>Esc</kbd> to close
          </span>
        </div>
      </div>
    </div>
  );
}
