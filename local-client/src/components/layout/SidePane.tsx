import React from 'react';
import './SidePane.css';

interface Server {
  id: number;
  name: string;
  icon?: string;
  hasUnread?: boolean;
  mentionCount?: number;
}

interface SidePaneProps {
  servers: Server[];
  activeServerId: number | null;
  onServerSelect: (serverId: number) => void;
  onAddServer?: () => void;
  onHomeClick: () => void;
  onExploreServers?: () => void;
  showAddServer?: boolean;
}

// VibeSpeak logo - sound wave bars
const HomeIcon = () => (
  <svg width="24" height="24" viewBox="0 0 48 48" fill="currentColor" aria-hidden="true">
    <rect x="8" y="18" width="4" height="12" rx="2" opacity="0.7" />
    <rect x="15" y="14" width="4" height="20" rx="2" />
    <rect x="22" y="10" width="4" height="28" rx="2" />
    <rect x="29" y="14" width="4" height="20" rx="2" />
    <rect x="36" y="18" width="4" height="12" rx="2" opacity="0.7" />
  </svg>
);

const ExploreIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/>
  </svg>
);

const AddIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M19 13H13v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
  </svg>
);

const SidePane: React.FC<SidePaneProps> = ({
  servers,
  activeServerId,
  onServerSelect,
  onAddServer,
  onHomeClick,
  onExploreServers,
  showAddServer = false,
}) => {
  return (
    <div className="side-pane">
      {/* Home button */}
      <div className="server-icon-wrapper">
        {activeServerId === null && <div className="server-pill active-pill" />}
        <div
          className={`server-icon home-button ${activeServerId === null ? 'active' : ''}`}
          onClick={onHomeClick}
          title="Home"
        >
          <HomeIcon />
        </div>
      </div>

      <div className="side-pane-divider" />

      {/* Server list */}
      <div className="server-list">
        {servers.map(server => (
          <div key={server.id} className="server-icon-wrapper">
            {/* Pill indicator */}
            <div className={`server-pill ${activeServerId === server.id ? 'active-pill' : server.hasUnread ? 'unread-pill' : ''}`} />

            <div
              className={`server-icon ${activeServerId === server.id ? 'active' : ''} ${server.hasUnread && activeServerId !== server.id ? 'has-unread' : ''}`}
              onClick={() => onServerSelect(server.id)}
              title={server.name}
            >
              {server.icon ? (
                <img src={server.icon} alt={server.name} />
              ) : (
                <span>{server.name.charAt(0).toUpperCase()}</span>
              )}
            </div>

            {/* Mention badge */}
            {server.mentionCount && server.mentionCount > 0 && (
              <div className="server-mention-badge">
                {server.mentionCount > 99 ? '99+' : server.mentionCount}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="side-pane-spacer" />

      {/* Add server — only shown when explicitly enabled */}
      {showAddServer && onAddServer && (
        <div className="server-icon-wrapper">
          <div className="server-icon add-server" onClick={onAddServer} title="Add Server">
            <AddIcon />
          </div>
        </div>
      )}

      {/* Explore */}
      <div className="server-icon-wrapper">
        <div className="server-icon explore-button" onClick={onExploreServers} title="Explore Servers">
          <ExploreIcon />
        </div>
      </div>
    </div>
  );
};

export default SidePane;