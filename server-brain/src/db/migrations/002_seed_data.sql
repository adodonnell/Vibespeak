-- Migration: Seed Data
-- Created at: 2026-01-01T00:00:01.000Z

-- UP
-- Insert default server owner user (password: 'changeme' - should be changed immediately)
-- Password hash is bcrypt hash of 'changeme'
INSERT INTO users (id, username, email, password_hash, status, created_at)
VALUES (
  1, 
  'Admin', 
  'admin@localhost', 
  '$2b$10$EpRnTzVlqHNP0.fUbXUwSOyuiXe/QLSUG6xNekdHgTGmrpHEfIoxm',
  'online',
  NOW()
) ON CONFLICT (id) DO NOTHING;

-- Create default server
INSERT INTO servers (id, name, description, owner_id, created_at)
VALUES (1, 'VibeSpeak Hub', 'The default VibeSpeak server', 1, NOW())
ON CONFLICT (id) DO NOTHING;

-- Add admin as server member
INSERT INTO server_members (server_id, user_id, joined_at)
VALUES (1, 1, NOW())
ON CONFLICT (server_id, user_id) DO NOTHING;

-- Create default roles
INSERT INTO roles (id, server_id, name, color, position, permissions, created_at)
VALUES 
  (1, 1, 'Owner', '#FFA500', 100, 2147483647, NOW()),
  (2, 1, 'Admin', '#FF0000', 50, 104324671, NOW()),
  (3, 1, 'Moderator', '#00FF00', 25, 8191, NOW()),
  (4, 1, 'Member', '#99AAB5', 0, 3072, NOW())
ON CONFLICT (id) DO NOTHING;

-- Assign owner role to admin
INSERT INTO member_roles (member_id, role_id)
SELECT sm.id, 1 FROM server_members sm WHERE sm.server_id = 1 AND sm.user_id = 1
ON CONFLICT (member_id, role_id) DO NOTHING;

-- Create category for channels
INSERT INTO channels (id, server_id, name, type, position, created_at)
VALUES (1, 1, 'Information', 'category', 0, NOW())
ON CONFLICT (id) DO NOTHING;

-- Create text channels
INSERT INTO channels (id, server_id, name, type, topic, position, parent_id, created_at)
VALUES 
  (2, 1, 'welcome', 'text', 'Welcome to VibeSpeak!', 0, 1, NOW()),
  (3, 1, 'rules', 'text', 'Server rules and guidelines', 1, 1, NOW()),
  (4, 1, 'general', 'text', 'General discussion', 0, NULL, NOW()),
  (5, 1, 'random', 'text', 'Random chat and off-topic', 1, NULL, NOW())
ON CONFLICT (id) DO NOTHING;

-- Create voice channel category
INSERT INTO channels (id, server_id, name, type, position, created_at)
VALUES (6, 1, 'Voice Channels', 'category', 1, NOW())
ON CONFLICT (id) DO NOTHING;

-- Create voice channels
INSERT INTO voice_channels (id, server_id, name, bitrate, user_limit, position, parent_id, created_at)
VALUES 
  (1, 1, 'General Voice', 64000, 0, 0, 6, NOW()),
  (2, 1, 'Gaming', 64000, 10, 1, 6, NOW()),
  (3, 1, 'Music', 128000, 0, 2, 6, NOW())
ON CONFLICT (id) DO NOTHING;

-- Create default invite code
INSERT INTO invites (code, server_id, channel_id, created_by, max_uses, created_at)
VALUES ('VIBESPEAK', 1, 2, 1, 0, NOW())
ON CONFLICT (code) DO NOTHING;

-- Create welcome message
INSERT INTO messages (channel_id, user_id, content, created_at)
VALUES (2, 1, 'Welcome to VibeSpeak! This is your new server. Enjoy your stay!', NOW())
ON CONFLICT DO NOTHING;

-- DOWN
DELETE FROM messages WHERE channel_id = 2 AND user_id = 1;
DELETE FROM invites WHERE code = 'VIBESPEAK';
DELETE FROM voice_channels WHERE server_id = 1;
DELETE FROM channels WHERE server_id = 1;
DELETE FROM member_roles WHERE member_id IN (SELECT id FROM server_members WHERE server_id = 1);
DELETE FROM roles WHERE server_id = 1;
DELETE FROM server_members WHERE server_id = 1;
DELETE FROM servers WHERE id = 1;
DELETE FROM users WHERE id = 1;