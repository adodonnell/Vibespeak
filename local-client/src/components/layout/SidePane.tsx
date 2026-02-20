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

const HomeIcon = () => (
  <svg width="28" height="20" viewBox="0 0 28 20" fill="currentColor" aria-hidden="true">
    <path d="M23.0212 1.67671C21.3107 0.879656 19.5079 0.318797 17.6584 0C17.4062 0.461742 17.1902 0.936997 17.0111 1.42397C15.0765 1.12359 13.1082 1.12359 11.1736 1.42397C10.9945 0.93699 10.7786 0.461735 10.5263 0C8.67583 0.318797 6.87207 0.880364 5.16153 1.67875C1.73503 6.41379 0.794548 11.0241 1.2649 15.5705C3.21951 17.0083 5.39494 18.1136 7.71149 18.8511C8.23352 18.1665 8.69631 17.4405 9.09494 16.6797C8.36853 16.4194 7.66478 16.0941 6.99313 15.7065C7.17552 15.5712 7.35439 15.432 7.52726 15.2968C9.52712 16.2399 11.7018 16.7242 13.9015 16.7242C16.1012 16.7242 18.2759 16.2399 20.2757 15.2968C20.4506 15.4381 20.6294 15.5773 20.8099 15.7065C20.1372 16.0951 19.4325 16.4213 18.705 16.6827C19.1037 17.4435 19.5665 18.1705 20.0885 18.8541C22.407 18.1179 24.5834 17.0126 26.538 15.5725C27.0876 10.2566 25.6465 5.68777 23.0212 1.67671ZM9.68041 12.7764C8.44308 12.7764 7.42754 11.6972 7.42754 10.3722C7.42754 9.04719 8.40992 7.95897 9.68041 7.95897C10.9509 7.95897 11.9585 9.04719 11.9585 10.3722C11.9585 11.6972 10.9569 12.7764 9.68041 12.7764ZM18.3226 12.7764C17.0852 12.7764 16.0717 11.6972 16.0717 10.3722C16.0717 9.04719 17.054 7.95897 18.3226 7.95897C19.5911 7.95897 20.5966 9.04719 20.5966 10.3722C20.5966 11.6972 19.599 12.7764 18.3226 12.7764Z"/>
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
