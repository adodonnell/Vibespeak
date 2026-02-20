import React, { useState } from 'react';

export interface Server {
  id: string;
  name: string;
  icon?: string;
  status: 'good' | 'activity' | 'bad' | 'none';
  mentionCount?: number;
}

interface ServerFolder {
  id: string;
  name: string;
  color: string;
  serverIds: string[];
  isExpanded?: boolean;
}

interface OmniRailProps {
  servers: Server[];
  activeServerId: string;
  onServerSelect: (serverId: string) => void;
  onServerAdd?: () => void;
  onSettingsClick?: () => void;
  folders?: ServerFolder[];
  username?: string;
}

// Server icon with hover animation - VibeSpeak style
const ServerIcon: React.FC<{
  server: Server;
  isActive: boolean;
  onClick: () => void;
  size?: number;
  mentionCount?: number;
}> = ({ server, isActive, onClick, size = 42, mentionCount }) => {
  const [isHovered, setIsHovered] = useState(false);
  
  const borderRadius = isHovered || isActive ? 16 : '50%';
  
  return (
    <div
      className="server-icon-wrapper"
      style={{
        position: 'relative',
        cursor: 'pointer',
        width: `${size}px`,
        height: `${size}px`,
      }}
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      title={server.name}
    >
      {/* Notification badge */}
      {mentionCount !== undefined && mentionCount > 0 && (
        <div
          style={{
            position: 'absolute',
            top: '-4px',
            right: '-4px',
            background: 'var(--alert-color)',
            color: 'white',
            fontSize: '10px',
            fontWeight: 'bold',
            padding: '2px 5px',
            borderRadius: '10px',
            minWidth: '16px',
            textAlign: 'center',
            zIndex: 10,
          }}
        >
          {mentionCount > 99 ? '99+' : mentionCount}
        </div>
      )}
      
      <div
        className="server-icon-vc"
        style={{
          width: '100%',
          height: '100%',
          background: isActive 
            ? 'var(--primary-color)' 
            : isHovered 
              ? 'var(--primary-color)' 
              : 'var(--background-color)',
          borderRadius: borderRadius,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: size > 40 ? '18px' : '14px',
          fontWeight: 600,
          color: isActive || isHovered ? 'white' : 'var(--text-color)',
          transition: 'all 0.2s ease',
        }}
      >
        {server.icon ? (
          <img 
            src={server.icon} 
            alt={server.name} 
            style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} 
          />
        ) : (
          server.name.charAt(0).toUpperCase()
        )}
      </div>
      
      {/* Status indicator */}
      {server.status !== 'none' && (
        <div
          style={{
            position: 'absolute',
            bottom: '-2px',
            right: '-2px',
            width: '14px',
            height: '14px',
            borderRadius: '50%',
            border: '3px solid var(--pane-color)',
            background: server.status === 'good' ? 'var(--status-online)' :
                       server.status === 'activity' ? 'var(--status-idle)' :
                       'var(--status-dnd)',
            zIndex: 10,
          }}
        />
      )}
    </div>
  );
};

// Small server icon for folders
const SmallServerIcon: React.FC<{
  server: Server;
  size: number;
}> = ({ server, size = 24 }) => {
  return (
    <div
      style={{
        width: `${size}px`,
        height: `${size}px`,
        borderRadius: '8px',
        background: server.icon 
          ? `url(${server.icon}) center/cover` 
          : 'var(--primary-color)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: size * 0.4,
        fontWeight: 600,
        color: 'white',
        flexShrink: 0,
      }}
    >
      {!server.icon && server.name.charAt(0).toUpperCase()}
    </div>
  );
};

// Server folder (like VibeSpeak)
const ServerFolder: React.FC<{
  folder: ServerFolder;
  servers: Server[];
  isExpanded: boolean;
  onToggle: () => void;
  onServerClick: (serverId: string) => void;
  activeServerId: string;
}> = ({ folder, servers, isExpanded, onToggle, onServerClick, activeServerId }) => {
  const folderServers = servers.filter(s => folder.serverIds.includes(s.id));
  
  return (
    <div style={{ position: 'relative' }}>
      {/* Folder button */}
      <div
        onClick={onToggle}
        style={{
          width: '48px',
          height: '48px',
          borderRadius: isExpanded ? '16px' : '50%',
          background: isExpanded 
            ? folder.color || 'var(--primary-color)'
            : 'var(--background-color)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          transition: 'all 0.2s ease',
          overflow: 'hidden',
        }}
        title={folder.name}
      >
        {!isExpanded ? (
          // Closed folder - show stacked icons
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gridTemplateRows: '1fr 1fr',
            gap: '2px',
            width: '28px',
            height: '28px',
          }}>
            {folderServers.slice(0, 4).map((server, i) => (
              <SmallServerIcon key={server.id} server={server} size={12} />
            ))}
          </div>
        ) : (
          // Open folder - show name
          <span style={{
            color: 'white',
            fontWeight: 600,
            fontSize: '14px',
            textTransform: 'uppercase',
          }}>
            {folder.name.charAt(0).toUpperCase()}
          </span>
        )}
      </div>
      
      {/* Expanded folder - show server list */}
      {isExpanded && (
        <div
          style={{
            position: 'absolute',
            left: '60px',
            top: 0,
            background: 'var(--pane-color)',
            borderRadius: '8px',
            padding: '8px',
            minWidth: '200px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
            zIndex: 100,
          }}
        >
          <div style={{
            fontSize: '12px',
            fontWeight: 600,
            color: folder.color || 'var(--primary-color)',
            marginBottom: '8px',
            padding: '0 4px',
          }}>
            {folder.name}
          </div>
          {folderServers.map(server => (
            <div
              key={server.id}
              onClick={() => onServerClick(server.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '6px 8px',
                borderRadius: '4px',
                cursor: 'pointer',
                background: activeServerId === server.id ? 'rgba(76,147,255,0.15)' : 'transparent',
              }}
            >
              <SmallServerIcon server={server} size={32} />
              <span style={{ 
                fontSize: '14px', 
                color: activeServerId === server.id ? 'var(--text-color)' : 'var(--text-muted)' 
              }}>
                {server.name}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const OmniRail: React.FC<OmniRailProps> = ({
  servers,
  activeServerId,
  onServerSelect,
  onServerAdd,
  folders = [],
}) => {
  const [expandedFolder, setExpandedFolder] = useState<string | null>(null);
  const [isHoveredAdd, setIsHoveredAdd] = useState(false);

  // Servers not in any folder are shown individually
  const folderedServerIds = new Set(folders.flatMap(f => f.serverIds));

  return (
    <div 
      className="omni-rail"
      style={{
        width: '72px',
        minWidth: '72px',
        background: 'var(--pane-color)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '12px 0',
        gap: '8px',
        flexShrink: 0,
      }}
    >
      {/* Home Button - VibeSpeak Logo */}
      <div
        onClick={() => onServerSelect('home')}
        style={{
          width: '48px',
          height: '48px',
          borderRadius: activeServerId === 'home' ? '16px' : '50%',
          background: activeServerId === 'home' 
            ? 'var(--primary-color)' 
            : 'var(--background-color)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          transition: 'all 0.2s ease',
          overflow: 'hidden',
        }}
        title="Home"
      >
        <svg width="32" height="32" viewBox="0 0 48 48" fill="none">
          <defs>
            <linearGradient id="vibeGradientRail" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#4D88FF" />
              <stop offset="100%" stopColor="#3363AA" />
            </linearGradient>
          </defs>
          <circle cx="24" cy="24" r="20" fill="url(#vibeGradientRail)" />
          <rect x="10" y="18" width="4" height="12" rx="2" fill="white" opacity="0.7" />
          <rect x="17" y="14" width="4" height="20" rx="2" fill="white" />
          <rect x="24" y="10" width="4" height="28" rx="2" fill="white" />
          <rect x="31" y="14" width="4" height="20" rx="2" fill="white" />
          <rect x="38" y="18" width="4" height="12" rx="2" fill="white" opacity="0.7" />
        </svg>
      </div>

      {/* Divider */}
      <div style={{
        width: '32px',
        height: '2px',
        background: 'var(--divider)',
        borderRadius: '1px',
        margin: '4px 0',
      }} />

      {/* Server Folders (prop-driven only — no hardcoded demo folders) */}
      {folders.map(folder => (
        <ServerFolder
          key={folder.id}
          folder={folder}
          servers={servers}
          isExpanded={expandedFolder === folder.id}
          onToggle={() => setExpandedFolder(expandedFolder === folder.id ? null : folder.id)}
          onServerClick={onServerSelect}
          activeServerId={activeServerId}
        />
      ))}

      {/* Individual Servers (those not inside a folder) */}
      {servers.filter(s => !folderedServerIds.has(s.id)).map(server => (
        <ServerIcon
          key={server.id}
          server={server}
          isActive={activeServerId === server.id}
          onClick={() => onServerSelect(server.id)}
          mentionCount={server.mentionCount}
        />
      ))}

      {/* Add Server Button */}
      {onServerAdd && (
        <div
          onClick={onServerAdd}
          onMouseEnter={() => setIsHoveredAdd(true)}
          onMouseLeave={() => setIsHoveredAdd(false)}
          style={{
            width: '48px',
            height: '48px',
            borderRadius: isHoveredAdd ? '16px' : '50%',
            background: isHoveredAdd ? 'var(--primary-color)' : 'var(--background-color)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            color: isHoveredAdd ? 'white' : 'var(--status-online)',
            fontSize: '24px',
            fontWeight: 300,
          }}
          title="Add Server"
        >
          +
        </div>
      )}

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Settings / User Button */}
      <ServerIcon 
        server={{ id: 'settings', name: 'Settings', status: 'good' }}
        isActive={false}
        onClick={() => {}}
        size={42}
      />
    </div>
  );
};

export default OmniRail;
