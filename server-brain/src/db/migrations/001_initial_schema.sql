-- Migration: Initial Schema
-- Created at: 2026-01-01T00:00:00.000Z

-- UP
-- Users table
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(50) NOT NULL UNIQUE,
  email VARCHAR(255) UNIQUE,
  password_hash VARCHAR(255),
  avatar_url VARCHAR(500),
  status VARCHAR(20) DEFAULT 'offline',
  custom_status VARCHAR(100),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_seen_at TIMESTAMP WITH TIME ZONE,
  is_bot BOOLEAN DEFAULT FALSE,
  settings JSONB DEFAULT '{}'
);

-- Servers table
CREATE TABLE IF NOT EXISTS servers (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  icon_url VARCHAR(500),
  owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  settings JSONB DEFAULT '{}'
);

-- Server members
CREATE TABLE IF NOT EXISTS server_members (
  id SERIAL PRIMARY KEY,
  server_id INTEGER NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  nickname VARCHAR(50),
  joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(server_id, user_id)
);

-- Roles
CREATE TABLE IF NOT EXISTS roles (
  id SERIAL PRIMARY KEY,
  server_id INTEGER NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  name VARCHAR(50) NOT NULL,
  color VARCHAR(7) DEFAULT '#99AAB5',
  position INTEGER DEFAULT 0,
  permissions INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Member roles
CREATE TABLE IF NOT EXISTS member_roles (
  id SERIAL PRIMARY KEY,
  member_id INTEGER NOT NULL REFERENCES server_members(id) ON DELETE CASCADE,
  role_id INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  UNIQUE(member_id, role_id)
);

-- Channels
CREATE TABLE IF NOT EXISTS channels (
  id SERIAL PRIMARY KEY,
  server_id INTEGER NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  name VARCHAR(50) NOT NULL,
  type VARCHAR(20) DEFAULT 'text',
  topic TEXT,
  position INTEGER DEFAULT 0,
  parent_id INTEGER REFERENCES channels(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Voice channels
CREATE TABLE IF NOT EXISTS voice_channels (
  id SERIAL PRIMARY KEY,
  server_id INTEGER NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  name VARCHAR(50) NOT NULL,
  bitrate INTEGER DEFAULT 64000,
  user_limit INTEGER DEFAULT 0,
  position INTEGER DEFAULT 0,
  parent_id INTEGER REFERENCES channels(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Voice channel participants
CREATE TABLE IF NOT EXISTS voice_participants (
  id SERIAL PRIMARY KEY,
  channel_id INTEGER NOT NULL REFERENCES voice_channels(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  muted BOOLEAN DEFAULT FALSE,
  deafened BOOLEAN DEFAULT FALSE,
  UNIQUE(channel_id, user_id)
);

-- Messages
CREATE TABLE IF NOT EXISTS messages (
  id SERIAL PRIMARY KEY,
  channel_id INTEGER NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  attachments JSONB DEFAULT '[]',
  embeds JSONB DEFAULT '[]',
  reactions JSONB DEFAULT '[]',
  reply_to_id INTEGER REFERENCES messages(id) ON DELETE SET NULL,
  edited_at TIMESTAMP WITH TIME ZONE,
  deleted_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Direct message channels
CREATE TABLE IF NOT EXISTS dm_channels (
  id SERIAL PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- DM channel participants
CREATE TABLE IF NOT EXISTS dm_channel_participants (
  id SERIAL PRIMARY KEY,
  dm_channel_id INTEGER NOT NULL REFERENCES dm_channels(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE(dm_channel_id, user_id)
);

-- Direct messages
CREATE TABLE IF NOT EXISTS direct_messages (
  id SERIAL PRIMARY KEY,
  dm_channel_id INTEGER NOT NULL REFERENCES dm_channels(id) ON DELETE CASCADE,
  sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  attachments JSONB DEFAULT '[]',
  reactions JSONB DEFAULT '[]',
  read_by JSONB DEFAULT '[]',
  edited_at TIMESTAMP WITH TIME ZONE,
  deleted_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Pinned messages
CREATE TABLE IF NOT EXISTS pins (
  id SERIAL PRIMARY KEY,
  channel_id INTEGER NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  message_id INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  pinned_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(channel_id, message_id)
);

-- Invites
CREATE TABLE IF NOT EXISTS invites (
  id SERIAL PRIMARY KEY,
  code VARCHAR(20) NOT NULL UNIQUE,
  server_id INTEGER NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  channel_id INTEGER REFERENCES channels(id) ON DELETE SET NULL,
  created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  max_uses INTEGER DEFAULT 0,
  uses INTEGER DEFAULT 0,
  expires_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Bans
CREATE TABLE IF NOT EXISTS bans (
  id SERIAL PRIMARY KEY,
  server_id INTEGER NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  banned_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(server_id, user_id)
);

-- Webhooks
CREATE TABLE IF NOT EXISTS webhooks (
  id SERIAL PRIMARY KEY,
  server_id INTEGER NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  channel_id INTEGER NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  name VARCHAR(50) NOT NULL,
  avatar_url VARCHAR(500),
  token VARCHAR(100) NOT NULL,
  created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Audit log
CREATE TABLE IF NOT EXISTS audit_log (
  id SERIAL PRIMARY KEY,
  server_id INTEGER NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(50) NOT NULL,
  target_type VARCHAR(50),
  target_id INTEGER,
  changes JSONB DEFAULT '{}',
  reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_messages_channel_id ON messages(channel_id);
CREATE INDEX IF NOT EXISTS idx_messages_user_id ON messages(user_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_server_members_server_id ON server_members(server_id);
CREATE INDEX IF NOT EXISTS idx_server_members_user_id ON server_members(user_id);
CREATE INDEX IF NOT EXISTS idx_channels_server_id ON channels(server_id);
CREATE INDEX IF NOT EXISTS idx_voice_channels_server_id ON voice_channels(server_id);
CREATE INDEX IF NOT EXISTS idx_invites_code ON invites(code);
CREATE INDEX IF NOT EXISTS idx_direct_messages_dm_channel_id ON direct_messages(dm_channel_id);
CREATE INDEX IF NOT EXISTS idx_direct_messages_created_at ON direct_messages(created_at DESC);

-- DOWN
DROP TABLE IF EXISTS audit_log;
DROP TABLE IF EXISTS webhooks;
DROP TABLE IF EXISTS bans;
DROP TABLE IF EXISTS invites;
DROP TABLE IF EXISTS pins;
DROP TABLE IF EXISTS direct_messages;
DROP TABLE IF EXISTS dm_channel_participants;
DROP TABLE IF EXISTS dm_channels;
DROP TABLE IF EXISTS messages;
DROP TABLE IF EXISTS voice_participants;
DROP TABLE IF EXISTS voice_channels;
DROP TABLE IF EXISTS channels;
DROP TABLE IF EXISTS member_roles;
DROP TABLE IF EXISTS roles;
DROP TABLE IF EXISTS server_members;
DROP TABLE IF EXISTS servers;
DROP TABLE IF EXISTS users;