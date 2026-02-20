import '../styles/theme.css';

interface Server {
  id: number;
  name: string;
  icon: string;
}

const dummyServers: Server[] = [
  { id: 1, name: 'VibeSpeak', icon: 'VS' },
  { id: 2, name: 'Gaming', icon: '🎮' },
  { id: 3, name: 'Music', icon: '🎵' },
  { id: 4, name: 'Tech Talk', icon: '💻' },
  { id: 5, name: 'General', icon: '💬' },
];

function ServerList() {
  return (
    <div className="server-list">
      {dummyServers.map((server) => (
        <div key={server.id} className="server-icon" title={server.name}>
          {server.icon}
        </div>
      ))}
      <div className="server-add" title="Add Server">
        +
      </div>
    </div>
  );
}

export default ServerList;
