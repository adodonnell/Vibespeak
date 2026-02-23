-- VibeSpeak Database Schema
-- Initializes the database with required tables

-- Users table (TeamSpeak-style: username only, no email/password auth)
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,  -- Random value for DB constraint, not used for auth
    display_name VARCHAR(100),
    avatar_url VARCHAR(500),
    email VARCHAR(255) UNIQUE,  -- Optional, for notifications only (not used for login)
    status VARCHAR(20) DEFAULT 'offline',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Servers table
CREATE TABLE IF NOT EXISTS servers (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    address VARCHAR(255) NOT NULL,
    port INTEGER NOT NULL DEFAULT 9987,
    password VARCHAR(255),
    owner_id INTEGER REFERENCES users(id),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Channels table (text and voice channels)
CREATE TABLE IF NOT EXISTS channels (
    id SERIAL PRIMARY KEY,
    server_id INTEGER REFERENCES servers(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    type VARCHAR(20) DEFAULT 'text', -- 'text', 'voice', or 'category'
    position INTEGER DEFAULT 0,
    parent_id INTEGER REFERENCES channels(id),
    topic VARCHAR(500),
    description VARCHAR(500),
    icon VARCHAR(255),
    is_category BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Messages table
CREATE TABLE IF NOT EXISTS messages (
    id SERIAL PRIMARY KEY,
    channel_id INTEGER REFERENCES channels(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    content TEXT NOT NULL,
    parent_id INTEGER REFERENCES messages(id) ON DELETE SET NULL,
    edited_at TIMESTAMP,
    is_pinned BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Server members (users in servers)
CREATE TABLE IF NOT EXISTS server_members (
    id SERIAL PRIMARY KEY,
    server_id INTEGER REFERENCES servers(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    nickname VARCHAR(100),
    roles JSONB DEFAULT '[]',
    joined_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(server_id, user_id)
);

-- Server roles table
CREATE TABLE IF NOT EXISTS roles (
    id SERIAL PRIMARY KEY,
    server_id INTEGER REFERENCES servers(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    color VARCHAR(7) DEFAULT '#99AAB5',
    position INTEGER DEFAULT 0,
    permissions INTEGER DEFAULT 0,
    hoist BOOLEAN DEFAULT FALSE,
    mentionable BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Server invites table
CREATE TABLE IF NOT EXISTS server_invites (
    id SERIAL PRIMARY KEY,
    server_id INTEGER REFERENCES servers(id) ON DELETE CASCADE,
    code VARCHAR(32) UNIQUE NOT NULL,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    max_uses INTEGER,
    uses_count INTEGER DEFAULT 0,
    expires_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);

-- User sessions table (for JWT refresh tokens)
CREATE TABLE IF NOT EXISTS user_sessions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) NOT NULL,
    device_info VARCHAR(255),
    ip_address VARCHAR(45),
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

-- User settings table
CREATE TABLE IF NOT EXISTS user_settings (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE UNIQUE,
    theme VARCHAR(20) DEFAULT 'dark',
    notification_settings JSONB DEFAULT '{"dmNotifications": true, "channelNotifications": "all", "serverNotifications": "all"}',
    avatar_url VARCHAR(500),
    bio VARCHAR(500),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_messages_channel_id ON messages(channel_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);
CREATE INDEX IF NOT EXISTS idx_channels_server_id ON channels(server_id);
CREATE INDEX IF NOT EXISTS idx_server_members_server_id ON server_members(server_id);
CREATE INDEX IF NOT EXISTS idx_server_members_user_id ON server_members(user_id);
CREATE INDEX IF NOT EXISTS idx_roles_server_id ON roles(server_id);
CREATE INDEX IF NOT EXISTS idx_server_invites_code ON server_invites(code);
CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_token_hash ON user_sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_user_settings_user_id ON user_settings(user_id);

-- NOTE: No default admin user. Admin privileges are granted via token claim.
-- The server generates a single-use admin token on startup (shown in console).
-- Users can claim admin privileges from Settings → My Account → Claim Admin Privileges.

-- Insert default server
INSERT INTO servers (name, address, port, password)
VALUES ('Main Server', 'localhost', 9987, NULL)
ON CONFLICT DO NOTHING;

-- Insert default channels (idempotent: skip if name already exists in server 1)
INSERT INTO channels (server_id, name, type, position, is_category)
SELECT 1, 'general', 'text', 0, false WHERE NOT EXISTS (SELECT 1 FROM channels WHERE server_id=1 AND name='general');
INSERT INTO channels (server_id, name, type, position, is_category)
SELECT 1, 'random', 'text', 1, false WHERE NOT EXISTS (SELECT 1 FROM channels WHERE server_id=1 AND name='random');
INSERT INTO channels (server_id, name, type, position, is_category)
SELECT 1, 'music', 'text', 2, false WHERE NOT EXISTS (SELECT 1 FROM channels WHERE server_id=1 AND name='music');
INSERT INTO channels (server_id, name, type, position, is_category)
SELECT 1, 'gaming', 'text', 3, false WHERE NOT EXISTS (SELECT 1 FROM channels WHERE server_id=1 AND name='gaming');
INSERT INTO channels (server_id, name, type, position, is_category)
SELECT 1, 'Lounge', 'voice', 100, false WHERE NOT EXISTS (SELECT 1 FROM channels WHERE server_id=1 AND name='Lounge');
INSERT INTO channels (server_id, name, type, position, is_category)
SELECT 1, 'Raid Party', 'voice', 101, false WHERE NOT EXISTS (SELECT 1 FROM channels WHERE server_id=1 AND name='Raid Party');
INSERT INTO channels (server_id, name, type, position, is_category)
SELECT 1, 'AFK', 'voice', 102, false WHERE NOT EXISTS (SELECT 1 FROM channels WHERE server_id=1 AND name='AFK');

-- Message reactions table (Stoat-inspired)
CREATE TABLE IF NOT EXISTS message_reactions (
    id SERIAL PRIMARY KEY,
    message_id INTEGER REFERENCES messages(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    emoji VARCHAR(50) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(message_id, user_id, emoji)
);

-- Indexes for reactions
CREATE INDEX IF NOT EXISTS idx_message_reactions_message_id ON message_reactions(message_id);
CREATE INDEX IF NOT EXISTS idx_message_reactions_user_id ON message_reactions(user_id);
CREATE INDEX IF NOT EXISTS idx_message_reactions_emoji ON message_reactions(emoji);

-- Index for message search (full-text)
CREATE INDEX IF NOT EXISTS idx_messages_content_gin ON messages USING gin(to_tsvector('english', content));
CREATE INDEX IF NOT EXISTS idx_messages_parent_id ON messages(parent_id);
CREATE INDEX IF NOT EXISTS idx_messages_is_pinned ON messages(is_pinned);

-- ============================================
-- NEW TABLES FOR NERIMITY-STYLE FEATURES
-- ============================================

-- Channel permissions (role-based)
CREATE TABLE IF NOT EXISTS channel_permissions (
    id SERIAL PRIMARY KEY,
    channel_id INTEGER REFERENCES channels(id) ON DELETE CASCADE,
    role_id INTEGER REFERENCES roles(id) ON DELETE CASCADE,
    server_id INTEGER REFERENCES servers(id) ON DELETE CASCADE,
    permissions INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(channel_id, role_id)
);

-- Friends / friendships
CREATE TABLE IF NOT EXISTS friendships (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    friend_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    status VARCHAR(20) DEFAULT 'pending', -- pending, accepted
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(user_id, friend_id)
);

-- User blocks
CREATE TABLE IF NOT EXISTS user_blocks (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    blocked_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(user_id, blocked_user_id)
);

-- Direct message channels
CREATE TABLE IF NOT EXISTS dm_channels (
    id SERIAL PRIMARY KEY,
    recipient_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    created_by_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    last_message_at TIMESTAMP DEFAULT NOW(),
    created_at TIMESTAMP DEFAULT NOW()
);

-- Server bans
CREATE TABLE IF NOT EXISTS server_bans (
    id SERIAL PRIMARY KEY,
    server_id INTEGER REFERENCES servers(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    reason VARCHAR(500),
    banned_at TIMESTAMP DEFAULT NOW(),
    banned_by INTEGER REFERENCES users(id),
    UNIQUE(server_id, user_id)
);

-- Message embeds (for rich content)
CREATE TABLE IF NOT EXISTS message_embeds (
    id SERIAL PRIMARY KEY,
    message_id INTEGER REFERENCES messages(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL, -- link, image, video, etc.
    url VARCHAR(500),
    title VARCHAR(255),
    description TEXT,
    thumbnail_url VARCHAR(500),
    created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for new tables
CREATE INDEX IF NOT EXISTS idx_channel_permissions_channel_id ON channel_permissions(channel_id);
CREATE INDEX IF NOT EXISTS idx_channel_permissions_role_id ON channel_permissions(role_id);
CREATE INDEX IF NOT EXISTS idx_friendships_user_id ON friendships(user_id);
CREATE INDEX IF NOT EXISTS idx_friendships_friend_id ON friendships(friend_id);
CREATE INDEX IF NOT EXISTS idx_user_blocks_user_id ON user_blocks(user_id);
CREATE INDEX IF NOT EXISTS idx_dm_channels_recipient_id ON dm_channels(recipient_id);
CREATE INDEX IF NOT EXISTS idx_dm_channels_created_by_id ON dm_channels(created_by_id);
CREATE INDEX IF NOT EXISTS idx_server_bans_server_id ON server_bans(server_id);
CREATE INDEX IF NOT EXISTS idx_server_bans_user_id ON server_bans(user_id);
CREATE INDEX IF NOT EXISTS idx_message_embeds_message_id ON message_embeds(message_id);

-- Message pins
CREATE TABLE IF NOT EXISTS message_pins (
    id SERIAL PRIMARY KEY,
    message_id INTEGER REFERENCES messages(id) ON DELETE CASCADE,
    channel_id INTEGER REFERENCES channels(id) ON DELETE CASCADE,
    pinned_by INTEGER REFERENCES users(id),
    pinned_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(message_id)
);

CREATE INDEX IF NOT EXISTS idx_message_pins_channel_id ON message_pins(channel_id);
CREATE INDEX IF NOT EXISTS idx_message_pins_message_id ON message_pins(message_id);

-- Server kicks (audit)
CREATE TABLE IF NOT EXISTS server_kicks (
    id SERIAL PRIMARY KEY,
    server_id INTEGER REFERENCES servers(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    reason VARCHAR(500),
    kicked_at TIMESTAMP DEFAULT NOW(),
    kicked_by INTEGER REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_server_kicks_server_id ON server_kicks(server_id);
CREATE INDEX IF NOT EXISTS idx_server_kicks_user_id ON server_kicks(user_id);

-- Webhooks
CREATE TABLE IF NOT EXISTS webhooks (
    id SERIAL PRIMARY KEY,
    channel_id INTEGER REFERENCES channels(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    avatar_url VARCHAR(500),
    token VARCHAR(64) UNIQUE NOT NULL,
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webhooks_channel_id ON webhooks(channel_id);
CREATE INDEX IF NOT EXISTS idx_webhooks_token ON webhooks(token);

-- OAuth2 / User Connections
CREATE TABLE IF NOT EXISTS user_connections (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    provider VARCHAR(50) NOT NULL,
    provider_user_id VARCHAR(255) NOT NULL,
    access_token TEXT NOT NULL,
    refresh_token TEXT,
    expires_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(user_id, provider)
);

CREATE INDEX IF NOT EXISTS idx_user_connections_user_id ON user_connections(user_id);
CREATE INDEX IF NOT EXISTS idx_user_connections_provider ON user_connections(provider);

-- Push Notifications (FCM)
CREATE TABLE IF NOT EXISTS push_subscriptions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    endpoint TEXT NOT NULL,
    p256dh VARCHAR(255) NOT NULL,
    auth VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(user_id, endpoint)
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_id ON push_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_endpoint ON push_subscriptions(endpoint);

-- ============================================
-- MFA / 2FA TABLES (Priority 1)
-- ============================================

-- TOTP secrets for MFA
CREATE TABLE IF NOT EXISTS user_mfa (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE UNIQUE,
    secret VARCHAR(64) NOT NULL,
    enabled BOOLEAN DEFAULT TRUE,
    backup_codes JSONB DEFAULT '[]', -- Array of hashed backup codes
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_mfa_user_id ON user_mfa(user_id);

-- Password reset tokens
CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    used_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user_id ON password_reset_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_token ON password_reset_tokens(token_hash);

-- Email verification
CREATE TABLE IF NOT EXISTS email_verification (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    verified BOOLEAN DEFAULT FALSE,
    verified_at TIMESTAMP,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_verification_user_id ON email_verification(user_id);
CREATE INDEX IF NOT EXISTS idx_email_verification_token ON email_verification(token_hash);

-- ============================================
-- READ RECEIPTS (Priority 2)
-- ============================================

-- Read state (messages read by users)
CREATE TABLE IF NOT EXISTS read_state (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    channel_id INTEGER REFERENCES channels(id) ON DELETE CASCADE,
    message_id INTEGER REFERENCES messages(id) ON DELETE CASCADE,
    read_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(user_id, channel_id)
);

CREATE INDEX IF NOT EXISTS idx_read_state_user_id ON read_state(user_id);
CREATE INDEX IF NOT EXISTS idx_read_state_channel_id ON read_state(channel_id);

-- ============================================
-- GROUP DMS (Priority 4)
-- ============================================

-- Group DM channels
CREATE TABLE IF NOT EXISTS group_dms (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100),
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Group DM members
CREATE TABLE IF NOT EXISTS group_dm_members (
    id SERIAL PRIMARY KEY,
    group_dm_id INTEGER REFERENCES group_dms(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    nickname VARCHAR(100),
    joined_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(group_dm_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_group_dm_members_group_id ON group_dm_members(group_dm_id);
CREATE INDEX IF NOT EXISTS idx_group_dm_members_user_id ON group_dm_members(user_id);

-- Group DM messages
CREATE TABLE IF NOT EXISTS group_dm_messages (
    id SERIAL PRIMARY KEY,
    group_dm_id INTEGER REFERENCES group_dms(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_group_dm_messages_group_id ON group_dm_messages(group_dm_id);

-- ============================================
-- AUDIT LOGS (Priority 5)
-- ============================================

-- Audit logs for moderation
CREATE TABLE IF NOT EXISTS audit_logs (
    id SERIAL PRIMARY KEY,
    server_id INTEGER REFERENCES servers(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(50) NOT NULL, -- ban, kick, mute, warn, etc.
    target_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    reason VARCHAR(500),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_server_id ON audit_logs(server_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);

-- ============================================
-- WORD FILTERS (Priority 5)
-- ============================================

-- Word filters for auto-mod
CREATE TABLE IF NOT EXISTS word_filters (
    id SERIAL PRIMARY KEY,
    server_id INTEGER REFERENCES servers(id) ON DELETE CASCADE,
    word VARCHAR(255) NOT NULL,
    replacement VARCHAR(255),
    severity VARCHAR(20) DEFAULT 'warn', -- warn, mute, kick, ban
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_word_filters_server_id ON word_filters(server_id);

-- ============================================
-- BAN APPEALS (Priority 5)
-- ============================================

-- Ban appeals
CREATE TABLE IF NOT EXISTS ban_appeals (
    id SERIAL PRIMARY KEY,
    server_id INTEGER REFERENCES servers(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    ban_id INTEGER REFERENCES server_bans(id) ON DELETE CASCADE,
    appeal_text TEXT NOT NULL,
    status VARCHAR(20) DEFAULT 'pending', -- pending, approved, rejected
    reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    reviewed_at TIMESTAMP,
    review_notes VARCHAR(500),
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ban_appeals_server_id ON ban_appeals(server_id);
CREATE INDEX IF NOT EXISTS idx_ban_appeals_user_id ON ban_appeals(user_id);
CREATE INDEX IF NOT EXISTS idx_ban_appeals_status ON ban_appeals(status);

-- ============================================
-- AUTO-MOD RULES (Priority 5)
-- ============================================

-- Auto-mod rules
CREATE TABLE IF NOT EXISTS auto_mod_rules (
    id SERIAL PRIMARY KEY,
    server_id INTEGER REFERENCES servers(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    enabled BOOLEAN DEFAULT TRUE,
    rule_type VARCHAR(50) NOT NULL, -- spam, caps, links, invites, mentions
    action VARCHAR(20) DEFAULT 'warn', -- warn, mute, kick, ban
    threshold INTEGER DEFAULT 5,
    duration INTEGER, -- Duration in seconds
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_auto_mod_rules_server_id ON auto_mod_rules(server_id);

-- ============================================
-- DIRECT MESSAGES (1-to-1)
-- ============================================

-- DM conversations (unique pair of users, ordered by user ID to prevent duplicates)
CREATE TABLE IF NOT EXISTS dm_conversations (
    id SERIAL PRIMARY KEY,
    user1_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,  -- Lower user ID
    user2_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,  -- Higher user ID
    created_at TIMESTAMP DEFAULT NOW(),
    last_message_at TIMESTAMP,
    last_message_preview VARCHAR(100),
    UNIQUE(user1_id, user2_id),
    CHECK (user1_id < user2_id)  -- Ensure ordering
);

CREATE INDEX IF NOT EXISTS idx_dm_conversations_user1 ON dm_conversations(user1_id);
CREATE INDEX IF NOT EXISTS idx_dm_conversations_user2 ON dm_conversations(user2_id);

-- DM messages
CREATE TABLE IF NOT EXISTS dm_messages (
    id SERIAL PRIMARY KEY,
    conversation_id INTEGER NOT NULL REFERENCES dm_conversations(id) ON DELETE CASCADE,
    sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP,
    is_edited BOOLEAN DEFAULT FALSE,
    read_at TIMESTAMP  -- When the recipient read the message
);

CREATE INDEX IF NOT EXISTS idx_dm_messages_conversation_id ON dm_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_dm_messages_sender_id ON dm_messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_dm_messages_created_at ON dm_messages(created_at);
CREATE INDEX IF NOT EXISTS idx_dm_messages_read_at ON dm_messages(read_at);

-- ============================================
-- SERVER MUTES
-- ============================================

-- Server mutes (timeout users)
CREATE TABLE IF NOT EXISTS server_mutes (
    id SERIAL PRIMARY KEY,
    server_id INTEGER REFERENCES servers(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    muted_by INTEGER REFERENCES users(id),
    reason VARCHAR(500),
    expires_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(server_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_server_mutes_server_id ON server_mutes(server_id);
CREATE INDEX IF NOT EXISTS idx_server_mutes_user_id ON server_mutes(user_id);
CREATE INDEX IF NOT EXISTS idx_server_mutes_expires_at ON server_mutes(expires_at);
