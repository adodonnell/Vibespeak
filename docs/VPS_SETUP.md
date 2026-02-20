# VibeSpeak — VPS Deployment Guide

Complete guide to deploy VibeSpeak on a Virtual Private Server (VPS).

## 📋 Prerequisites

- **VPS** with at least:
  - 2 CPU cores
  - 4GB RAM (8GB recommended for 50+ users)
  - 40GB SSD storage
  - Ubuntu 22.04 LTS or Debian 12 (recommended)
- **Domain name** (optional but recommended for SSL)
- **Root or sudo access**

---

## 🔌 Port Summary (Minimal Setup)

Only **7 firewall rules** needed:

| Port | Protocol | Purpose |
|------|----------|---------|
| **22** | TCP | SSH |
| **80** | TCP | HTTP (SSL challenges only) |
| **443** | TCP | HTTPS (API + WebSocket combined) |
| **3478** | TCP+UDP | TURN/STUN (WebRTC NAT traversal) |
| **9988** | UDP | Voice relay |
| **49152-49172** | UDP | TURN relay (only 20 ports) |

**Architecture:**
```
Internet → Nginx (443) → Server Brain (3001/3002 internal only)
                      ↓
                   TURN (3478) + Voice Relay (9988)
```

All API and WebSocket traffic goes through **port 443** — Nginx routes `/ws` to the WebSocket server internally.

---

## 🚀 Quick Start (5 Minutes)

```bash
# 1. Clone the repository
git clone https://github.com/yourusername/vibespeak.git
cd vibespeak

# 2. Copy and configure environment
cp infra/.env.example infra/.env
nano infra/.env  # Fill in required values

# 3. Start all services
docker compose -f infra/docker-compose.prod.yml up -d

# 4. Verify services are running
docker compose -f infra/docker-compose.prod.yml ps
curl http://localhost:3001/health
```

---

## 📦 Detailed Installation

### Step 1: System Preparation

```bash
# Update system packages
sudo apt update && sudo apt upgrade -y

# Install required packages
sudo apt install -y curl git ufw fail2ban

# Install Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER

# Install Docker Compose (if not included)
sudo apt install -y docker-compose-plugin

# Log out and back in for Docker group to take effect
```

### Step 2: Clone and Configure

```bash
# Clone repository
git clone https://github.com/yourusername/vibespeak.git
cd vibespeak

# Create environment file
cp infra/.env.example infra/.env
```

### Step 3: Environment Configuration

Edit `infra/.env` with your settings:

```bash
# PostgreSQL Configuration
POSTGRES_USER=vibespeak
POSTGRES_PASSWORD=<generate-strong-password>
POSTGRES_DB=vibespeak

# JWT Configuration
JWT_SECRET=<generate-64-char-random-string>

# CORS (your domain or * for testing)
CORS_ORIGIN=https://yourdomain.com

# TURN Server (for WebRTC through NAT)
COTURN_EXTERNAL_IP=<your-vps-public-ip>
COTURN_SECRET=<generate-strong-password>

# Optional: OAuth providers
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
DISCORD_CLIENT_ID=
DISCORD_CLIENT_SECRET=
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=

# Optional: Disable server creation (static server mode)
DISABLE_SERVER_CREATION=true
```

**Generate secure secrets:**
```bash
# Generate JWT secret (64 characters)
openssl rand -base64 48

# Generate PostgreSQL password
openssl rand -base64 24
```

### Step 4: Configure Firewall

```bash
# Enable UFW
sudo ufw default deny incoming
sudo ufw default allow outgoing

# SSH
sudo ufw allow 22/tcp

# HTTP/HTTPS
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# TURN/STUN (for WebRTC)
sudo ufw allow 3478/tcp
sudo ufw allow 3478/udp

# Voice relay
sudo ufw allow 9988/udp

# TURN relay ports (minimal range)
sudo ufw allow 49152:49172/udp

# Enable firewall
sudo ufw --force enable
sudo ufw status
```

### Step 5: Oracle Cloud Security List (If using Oracle)

In Oracle Cloud Console → Instance → Security Lists → Add Ingress Rules:

| Source | Protocol | Dest Port |
|--------|----------|-----------|
| 0.0.0.0/0 | TCP | 22 |
| 0.0.0.0/0 | TCP | 80 |
| 0.0.0.0/0 | TCP | 443 |
| 0.0.0.0/0 | TCP | 3478 |
| 0.0.0.0/0 | UDP | 3478 |
| 0.0.0.0/0 | UDP | 9988 |
| 0.0.0.0/0 | UDP | 49152-49172 |

### Step 6: Start Services

```bash
# Start all services
docker compose -f infra/docker-compose.prod.yml up -d

# Check logs
docker compose -f infra/docker-compose.prod.yml logs -f

# Verify health
curl http://localhost:3001/health
```

---

## 🔒 SSL Configuration (Recommended)

### Option A: Let's Encrypt with Caddy

Create a reverse proxy with automatic SSL:

```bash
# Create Caddy docker-compose override
cat > infra/docker-compose.override.yml << 'EOF'
version: '3.9'
services:
  caddy:
    image: caddy:latest
    container_name: vibespeak-caddy
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy_data:/data
      - caddy_config:/config
    networks:
      - vibespeak-net

volumes:
  caddy_data:
  caddy_config:
EOF

# Create Caddyfile
cat > infra/Caddyfile << 'EOF'
yourdomain.com {
    reverse_proxy server-brain:3001
    reverse_proxy /ws server-brain:3002
}

# TURN server
turn.yourdomain.com {
    reverse_proxy coturn:3478
}
EOF

# Start with override
docker compose -f infra/docker-compose.prod.yml -f infra/docker-compose.override.yml up -d
```

### Option B: Nginx with Certbot

```bash
# Install Nginx and Certbot
sudo apt install -y nginx certbot python3-certbot-nginx

# Create Nginx config
sudo nano /etc/nginx/sites-available/vibespeak
```

Nginx configuration:
```nginx
server {
    listen 80;
    server_name yourdomain.com;
    
    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    
    location /ws {
        proxy_pass http://localhost:3002;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

```bash
# Enable site
sudo ln -s /etc/nginx/sites-available/vibespeak /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx

# Get SSL certificate
sudo certbot --nginx -d yourdomain.com

# Auto-renewal
sudo systemctl enable certbot.timer
```

---

## 🔧 Systemd Services (Alternative to Docker)

For direct installation without Docker:

### Server Service

```bash
sudo nano /etc/systemd/system/vibespeak-server.service
```

```ini
[Unit]
Description=VibeSpeak Server
After=network.target postgresql.service

[Service]
Type=simple
User=vibespeak
WorkingDirectory=/opt/vibespeak/server-brain
ExecStart=/usr/bin/node dist/index.js
Restart=on-failure
RestartSec=10
Environment=NODE_ENV=production
EnvironmentFile=/opt/vibespeak/.env

[Install]
WantedBy=multi-user.target
```

### Voice Relay Service

```bash
sudo nano /etc/systemd/system/vibespeak-voice.service
```

```ini
[Unit]
Description=VibeSpeak Voice Relay
After=network.target

[Service]
Type=simple
User=vibespeak
WorkingDirectory=/opt/vibespeak/server-brain
ExecStart=/usr/bin/node dist/voice-relay.js
Restart=on-failure
RestartSec=10
Environment=NODE_ENV=production
EnvironmentFile=/opt/vibespeak/.env

[Install]
WantedBy=multi-user.target
```

### Enable Services

```bash
# Create vibespeak user
sudo useradd -r -s /bin/false vibespeak

# Set permissions
sudo chown -R vibespeak:vibespeak /opt/vibespeak

# Enable and start
sudo systemctl daemon-reload
sudo systemctl enable vibespeak-server vibespeak-voice
sudo systemctl start vibespeak-server vibespeak-voice

# Check status
sudo systemctl status vibespeak-server
```

---

## 📊 Monitoring

### Health Checks

```bash
# HTTP API health
curl http://localhost:3001/health

# Server info
curl http://localhost:3001/api/info

# Database status
docker exec vibespeak-db pg_isready -U vibespeak
```

### Logs

```bash
# All services
docker compose -f infra/docker-compose.prod.yml logs -f

# Specific service
docker compose -f infra/docker-compose.prod.yml logs -f server-brain
docker compose -f infra/docker-compose.prod.yml logs -f postgres

# System logs (if using systemd)
journalctl -u vibespeak-server -f
```

### Resource Monitoring

```bash
# Docker stats
docker stats

# System resources
htop

# Disk usage
df -h
```

---

## 🔄 Maintenance

### Backup Database

```bash
# Create backup script
cat > /opt/vibespeak/backup.sh << 'EOF'
#!/bin/bash
BACKUP_DIR="/opt/vibespeak/backups"
DATE=$(date +%Y%m%d_%H%M%S)
mkdir -p $BACKUP_DIR

# PostgreSQL backup
docker exec vibespeak-db pg_dump -U vibespeak vibespeak > $BACKUP_DIR/vibespeak_$DATE.sql

# Compress
gzip $BACKUP_DIR/vibespeak_$DATE.sql

# Keep last 7 days
find $BACKUP_DIR -name "*.gz" -mtime +7 -delete

echo "Backup completed: vibespeak_$DATE.sql.gz"
EOF

chmod +x /opt/vibespeak/backup.sh

# Add to cron (daily at 2 AM)
(crontab -l 2>/dev/null; echo "0 2 * * * /opt/vibespeak/backup.sh >> /var/log/vibespeak-backup.log 2>&1") | crontab -
```

### Restore Database

```bash
# Decompress and restore
gunzip -c /opt/vibespeak/backups/vibespeak_YYYYMMDD_HHMMSS.sql.gz | \
  docker exec -i vibespeak-db psql -U vibespeak vibespeak
```

### Update

```bash
# Pull latest changes
cd /opt/vibespeak
git pull

# Rebuild and restart
docker compose -f infra/docker-compose.prod.yml build --no-cache
docker compose -f infra/docker-compose.prod.yml up -d

# Check logs
docker compose -f infra/docker-compose.prod.yml logs -f
```

---

## 🔐 Security Checklist

- [ ] Change default PostgreSQL password
- [ ] Generate strong JWT secret (64+ characters)
- [ ] Configure firewall (UFW)
- [ ] Enable fail2ban for SSH
- [ ] Set up SSL certificates
- [ ] Disable server creation if using static servers
- [ ] Configure TURN server credentials
- [ ] Set up automated backups
- [ ] Configure log rotation
- [ ] Review CORS settings

---

## 🐛 Troubleshooting

### Port Already in Use

```bash
# Find process using port
sudo lsof -i :3001
sudo kill -9 <PID>
```

### Database Connection Failed

```bash
# Check PostgreSQL is running
docker exec vibespeak-db pg_isready -U vibespeak

# Check logs
docker compose -f infra/docker-compose.prod.yml logs postgres
```

### WebSocket Not Connecting

```bash
# Check WebSocket port is open
curl http://localhost:3002

# Check Nginx/Proxy config includes upgrade headers
```

### Voice Not Working

```bash
# Check TURN server
sudo netstat -tulpn | grep 3478

# Check UDP voice relay
sudo netstat -tulpn | grep 9988

# Check TURN logs
docker compose -f infra/docker-compose.prod.yml logs coturn
```

---

## 📈 Scaling

### For High Traffic (100+ concurrent users)

1. **Increase VPS resources**: 4+ CPU, 8GB+ RAM
2. **Add Redis for presence caching**:
   ```yaml
   redis:
     image: redis:alpine
     container_name: vibespeak-redis
     restart: unless-stopped
     volumes:
       - redis_data:/data
     networks:
       - vibespeak-net
   ```
3. **Enable PostgreSQL connection pooling**
4. **Set up a CDN for static assets**
5. **Consider horizontal scaling with Docker Swarm**

---

## 🆘 Support

- **Documentation**: `/docs`
- **Issues**: GitHub Issues
- **Logs**: Always check `docker compose logs` first