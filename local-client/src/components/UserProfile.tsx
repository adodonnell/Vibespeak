import { useState, useRef } from 'react';

interface UserProfileData {
  id: string;
  username: string;
  avatar?: string;
  bio?: string;
  status?: string;
  badges?: string[];
  joinedAt?: string;
  roles?: { name: string; color: string }[];
}

interface UserProfileProps {
  user: UserProfileData;
  isOwnProfile?: boolean;
  onClose: () => void;
  onEdit?: (data: Partial<UserProfileData>) => void;
}

export function UserProfile({ user, isOwnProfile, onClose, onEdit }: UserProfileProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState({ bio: user.bio || '', status: user.status || '' });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSave = () => {
    onEdit?.(editData);
    setIsEditing(false);
  };

  const handleAvatarClick = () => {
    if (isOwnProfile) {
      fileInputRef.current?.click();
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // In a real app, upload to server
      console.log('Avatar upload:', file.name);
    }
  };

  return (
    <div className="user-profile-overlay" onClick={onClose}>
      <div className="user-profile" onClick={e => e.stopPropagation()}>
        <div className="user-profile-header">
          <div className="user-profile-banner"></div>
          <button className="user-profile-close" onClick={onClose}>×</button>
        </div>
        
        <div className="user-profile-content">
          <div className="user-profile-avatar-section">
            <div 
              className={`user-profile-avatar ${isOwnProfile ? 'editable' : ''}`}
              onClick={handleAvatarClick}
              style={user.avatar ? { backgroundImage: `url(${user.avatar})` } : undefined}
            >
              {!user.avatar && user.username.charAt(0).toUpperCase()}
              {isOwnProfile && <span className="avatar-edit-icon">📷</span>}
            </div>
            <input 
              ref={fileInputRef}
              type="file" 
              accept="image/*" 
              onChange={handleFileChange}
              style={{ display: 'none' }}
            />
          </div>
          
          <div className="user-profile-info">
            <h2 className="user-profile-username">
              {user.username}
              {user.badges?.map((badge, i) => (
                <span key={i} className="user-badge">{badge}</span>
              ))}
            </h2>
            
            {user.roles && user.roles.length > 0 && (
              <div className="user-profile-roles">
                {user.roles.map((role, i) => (
                  <span 
                    key={i} 
                    className="user-role"
                    style={{ backgroundColor: role.color + '20', color: role.color }}
                  >
                    {role.name}
                  </span>
                ))}
              </div>
            )}
            
            {isEditing ? (
              <div className="user-profile-edit">
                <div className="edit-field">
                  <label>Status</label>
                  <input
                    type="text"
                    value={editData.status}
                    onChange={e => setEditData({ ...editData, status: e.target.value })}
                    placeholder="Set your status..."
                    maxLength={50}
                  />
                </div>
                <div className="edit-field">
                  <label>Bio</label>
                  <textarea
                    value={editData.bio}
                    onChange={e => setEditData({ ...editData, bio: e.target.value })}
                    placeholder="Write something about yourself..."
                    maxLength={200}
                    rows={3}
                  />
                </div>
                <div className="edit-actions">
                  <button className="btn-cancel" onClick={() => setIsEditing(false)}>Cancel</button>
                  <button className="btn-save" onClick={handleSave}>Save</button>
                </div>
              </div>
            ) : (
              <>
                {user.status && (
                  <div className="user-profile-status">
                    <span className="status-emoji">●</span>
                    {user.status}
                  </div>
                )}
                
                {user.bio && (
                  <p className="user-profile-bio">{user.bio}</p>
                )}
                
                {isOwnProfile && (
                  <button 
                    className="user-profile-edit-btn"
                    onClick={() => setIsEditing(true)}
                  >
                    Edit Profile
                  </button>
                )}
              </>
            )}
          </div>
          
          <div className="user-profile-details">
            <div className="detail-item">
              <span className="detail-label">Member since</span>
              <span className="detail-value">{user.joinedAt || 'Unknown'}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Demo user profile data
export const demoUserProfile: UserProfileData = {
  id: '1',
  username: 'VibeUser',
  bio: 'Voice chat enthusiast. Building the next big thing! 🚀',
  status: 'Playing VibeSpeak',
  badges: ['⭐', '👑'],
  joinedAt: 'January 2026',
  roles: [
    { name: 'Admin', color: '#eb6e6e' },
    { name: 'Developer', color: '#4c93ff' },
  ]
};
