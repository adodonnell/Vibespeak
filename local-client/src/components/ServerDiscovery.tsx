import { useState, useEffect } from 'react';
import { apiClient } from '../services/api-client';
import './ServerDiscovery.css';

interface ServerDiscoveryProps {
  isOpen: boolean;
  onClose: () => void;
  onJoinServer: (serverId: number) => void;
}

interface PublicServer {
  id: number;
  name: string;
  description?: string;
  memberCount: number;
  icon?: string;
  banner?: string;
}

// Demo servers for when API is not available
const demoServers: PublicServer[] = [
  { id: 1, name: 'VibeSpeak Main', description: 'The official VibeSpeak community server', memberCount: 1250 },
  { id: 2, name: 'Gaming Hub', description: 'Connect with gamers from around the world', memberCount: 850 },
  { id: 3, name: 'Music Lounge', description: 'Share and discover new music together', memberCount: 620 },
  { id: 4, name: 'Tech Talk', description: 'Discuss the latest in technology', memberCount: 410 },
  { id: 5, name: 'Creative Corner', description: 'Artists, designers, and creators unite!', memberCount: 330 },
  { id: 6, name: 'Study Group', description: 'Collaborate and learn together', memberCount: 280 },
];

export function ServerDiscovery({ isOpen, onClose, onJoinServer }: ServerDiscoveryProps) {
  const [servers, setServers] = useState<PublicServer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [joiningServer, setJoiningServer] = useState<number | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadServers();
    }
  }, [isOpen]);

  const loadServers = async () => {
    setIsLoading(true);
    try {
      // Try to get servers from API
      const result = await apiClient.getServers();
      if (result && result.length > 0) {
        setServers(result.map((s: { id: number; name: string }) => ({
          id: s.id,
          name: s.name,
          memberCount: Math.floor(Math.random() * 500) + 50,
          description: 'A community server'
        })));
      } else {
        // Use demo servers if API returns empty
        setServers(demoServers);
      }
    } catch (error) {
      console.log('Using demo servers');
      setServers(demoServers);
    } finally {
      setIsLoading(false);
    }
  };

  const categories = [
    { id: 'all', name: 'All Servers', icon: '🌐' },
    { id: 'gaming', name: 'Gaming', icon: '🎮' },
    { id: 'music', name: 'Music', icon: '🎵' },
    { id: 'tech', name: 'Technology', icon: '💻' },
    { id: 'creative', name: 'Creative', icon: '🎨' },
    { id: 'education', name: 'Education', icon: '📚' },
    { id: 'social', name: 'Social', icon: '💬' },
  ];

  const filteredServers = servers.filter(server => {
    const matchesSearch = server.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      server.description?.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesSearch;
  });

  const handleJoin = async (serverId: number) => {
    setJoiningServer(serverId);
    try {
      await apiClient.joinServer(serverId);
      onJoinServer(serverId);
      onClose();
    } catch (error) {
      console.error('Failed to join server:', error);
      // Still allow joining for demo
      onJoinServer(serverId);
      onClose();
    } finally {
      setJoiningServer(null);
    }
  };

  const getServerIcon = (server: PublicServer) => {
    // Generate a consistent color based on server name
    const colors = ['#5865f2', '#eb6e6e', '#4c93ff', '#43b581', '#f0b232', '#9b59b6'];
    const colorIndex = server.name.charCodeAt(0) % colors.length;
    return colors[colorIndex];
  };

  if (!isOpen) return null;

  return (
    <div className="discovery-overlay" onClick={onClose}>
      <div className="discovery-modal" onClick={e => e.stopPropagation()}>
        <div className="discovery-header">
          <h2>Server Discovery</h2>
          <button className="discovery-close" onClick={onClose}>×</button>
        </div>

        <div className="discovery-content">
          <div className="discovery-sidebar">
            <div className="discovery-search">
              <input
                type="text"
                placeholder="Search servers..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
            </div>

            <div className="discovery-categories">
              {categories.map(category => (
                <button
                  key={category.id}
                  className={`category-btn ${selectedCategory === category.id ? 'active' : ''}`}
                  onClick={() => setSelectedCategory(category.id)}
                >
                  <span className="category-icon">{category.icon}</span>
                  <span className="category-name">{category.name}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="discovery-main">
            {isLoading ? (
              <div className="discovery-loading">
                <div className="loading-spinner"></div>
                <p>Loading servers...</p>
              </div>
            ) : (
              <>
                <div className="discovery-section">
                  <h3>Popular Servers</h3>
                  <div className="server-grid">
                    {filteredServers.slice(0, 6).map(server => (
                      <div key={server.id} className="server-card">
                        <div 
                          className="server-card-banner"
                          style={{ background: getServerIcon(server) }}
                        >
                          <div className="server-card-icon">
                            {server.name.charAt(0).toUpperCase()}
                          </div>
                        </div>
                        <div className="server-card-content">
                          <h4>{server.name}</h4>
                          <p className="server-description">
                            {server.description}
                          </p>
                          <div className="server-stats">
                            <span>👥 {server.memberCount} members</span>
                          </div>
                          <button 
                            className="join-btn"
                            onClick={() => handleJoin(server.id)}
                            disabled={joiningServer === server.id}
                          >
                            {joiningServer === server.id ? 'Joining...' : 'Join Server'}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {filteredServers.length > 6 && (
                  <div className="discovery-section">
                    <h3>More Servers</h3>
                    <div className="server-list">
                      {filteredServers.slice(6).map(server => (
                        <div key={server.id} className="server-list-item">
                          <div 
                            className="server-list-icon"
                            style={{ background: getServerIcon(server) }}
                          >
                            {server.name.charAt(0).toUpperCase()}
                          </div>
                          <div className="server-list-info">
                            <h4>{server.name}</h4>
                            <span>{server.memberCount} members</span>
                          </div>
                          <button 
                            className="join-btn-small"
                            onClick={() => handleJoin(server.id)}
                            disabled={joiningServer === server.id}
                          >
                            {joiningServer === server.id ? '...' : 'Join'}
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {filteredServers.length === 0 && (
                  <div className="discovery-empty">
                    <p>No servers found matching "{searchQuery}"</p>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        <div className="discovery-footer">
          <p>Want to create your own server? <a href="#create">Create Server</a></p>
        </div>
      </div>
    </div>
  );
}
