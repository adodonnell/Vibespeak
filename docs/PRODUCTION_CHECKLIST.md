# VibeSpeak Production Deployment Checklist

## Pre-Deployment

### Server Requirements
- [ ] VPS with at least 2GB RAM (4GB recommended)
- [ ] Ubuntu 22.04 or similar Linux distribution
- [ ] Root or sudo access
- [ ] Domain name (optional but recommended for HTTPS)

### Required Ports
- [ ] Port 80 (HTTP) - for Let's Encrypt
- [ ] Port 443 (HTTPS) - for secure connections
- [ ] Port 3001 (API) - HTTP API server
- [ ] Port 3002 (WebSocket) - Real-time signaling
- [ ] Port 9988/UDP (Voice) - Voice relay
- [ ] Port 3478/UDP (TURN) - NAT traversal
- [ ] Port 5349/UDP (TURN TLS) - Secure NAT traversal
- [ ] Ports 49152-49200/UDP (TURN relay) - Media relay

---

## Environment Configuration

### Step 1: Clone Repository
```bash
git clone https://github.com/yourusername/vibespeak.git
cd vibespeak
```

### Step 2: Create Environment File
```bash
cp infra/.env.example infra/.env
nano infra/.env
```

### Step 3: Set Required Values

#### Database
- [ ] `POSTGRES_PASSWORD` - Strong password (32+ characters)
  ```bash
  openssl rand -base64 32
  ```

#### JWT Authentication
- [ ] `JWT_SECRET` - Secret for signing tokens (64+ characters)
  ```bash
  node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
  ```

#### TURN Server (Critical for Voice)
- [ ] `COTURN_EXTERNAL_IP` - Your server's public IP address
  ```bash
  curl -4 ifconfig.me
  ```
- [ ] `COTURN_SECRET` - Secret for TURN credentials
  ```bash
  openssl rand -hex 32
  ```

#### CORS (Optional)
- [ ] `ALLOWED_ORIGINS` - Your domain(s), comma-separated
  - Example: `https://vibespeak.example.com,https://app.vibespeak.com`
  - Use `*` for testing only

---

## Deployment

### Step 1: Configure Firewall
```bash
# Allow required ports
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 3001/tcp
ufw allow 3002/tcp
ufw allow 9988/udp
ufw allow 3478/udp
ufw allow 5349/udp
ufw allow 49152:49200/udp

# Enable firewall
ufw enable
```

### Step 2: Deploy with Docker Compose
```bash
docker compose -f infra/docker-compose.prod.yml up -d
```

### Step 3: Run Database Migrations
```bash
docker compose -f infra/docker-compose.prod.yml exec server-brain npm run migrate
```

### Step 4: Verify Deployment
```bash
# Check all services are running
docker compose -f infra/docker-compose.prod.yml ps

# Check server health
curl http://localhost:3001/health

# Check API info
curl http://localhost:3001/api/info
```

### Step 5: Note Admin Token
```bash
# Check logs for the admin token (generated on first startup)
docker compose -f infra/docker-compose.prod.yml logs server-brain | grep -A5 "ADMIN TOKEN"
```

**Save this token securely!** It's used to claim admin privileges.

---

## Post-Deployment

### HTTPS Configuration (Recommended)

#### Option 1: Caddy (Automatic HTTPS)
```bash
# Install Caddy
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update
sudo apt install caddy

# Create Caddyfile
cat > /etc/caddy/Caddyfile << EOF
vibespeak.example.com {
    reverse_proxy localhost:3001
    reverse_proxy /ws localhost:3002 {
        header_up Upgrade {http.request.header.Upgrade}
        header_up Connection {http.request.header.Connection}
    }
}
EOF

# Restart Caddy
systemctl restart caddy
```

#### Option 2: Nginx + Let's Encrypt
```bash
# Install Nginx and Certbot
sudo apt install -y nginx certbot python3-certbot-nginx

# Get certificate
sudo certbot --nginx -d vibespeak.example.com

# Configure Nginx
sudo nano /etc/nginx/sites-available/vibespeak
```

### TURN Server Verification

Test TURN connectivity at: https://webrtc.github.io/samples/src/content/peerconnection/trickle-ice/

Settings:
- STUN or TURN URI: `turn:YOUR_SERVER_IP:3478`
- STUN or TURN username: `vibespeak`
- STUN or TURN password: `vibespeak123`

Click "Gather candidates" - you should see relay candidates.

---

## Monitoring

### Health Checks

#### Manual Health Check
```bash
# Server health
curl http://localhost:3001/health

# Database health
docker compose -f infra/docker-compose.prod.yml exec postgres pg_isready

# Redis health
docker compose -f infra/docker-compose.prod.yml exec redis redis-cli ping
```

#### Automated Monitoring (Recommended)
Set up external monitoring with:
- [UptimeRobot](https://uptimerobot.com/) (free)
- [Pingdom](https://www.pingdom.com/)
- [Better Uptime](https://betteruptime.com/)

### Log Management

#### View Logs
```bash
# All services
docker compose -f infra/docker-compose.prod.yml logs -f

# Specific service
docker compose -f infra/docker-compose.prod.yml logs -f server-brain
```

#### Log Rotation
Logs are automatically rotated by Docker. Configure retention in `docker-compose.prod.yml` if needed.

---

## Backup Strategy

### Automated Backups
Backups run daily at midnight (configured in `docker-compose.prod.yml`).

Retention:
- Daily: 7 days
- Weekly: 4 weeks
- Monthly: 6 months

### Manual Backup
```bash
# Database only
./infra/backup.sh

# Full backup (database + uploads)
./infra/backup-full.sh
```

### Restore from Backup
```bash
# Database restore
./infra/backup.sh --restore /path/to/backup.sql.gz

# Full restore
./infra/backup-full.sh --restore /path/to/backup.tar.gz
```

---

## Security Checklist

### Critical
- [ ] Changed all default passwords
- [ ] Set strong `JWT_SECRET` (64+ chars)
- [ ] Set strong `POSTGRES_PASSWORD` (32+ chars)
- [ ] Configured firewall (ufw)
- [ ] Set `ALLOWED_ORIGINS` to your domain (not `*`)
- [ ] Enabled HTTPS (Let's Encrypt)
- [ ] Saved admin token securely

### Recommended
- [ ] Set up fail2ban for SSH protection
- [ ] Configure unattended-upgrades for security patches
- [ ] Set up external monitoring
- [ ] Configure log aggregation
- [ ] Document backup restoration process
- [ ] Create incident response plan

### Optional
- [ ] Set up VPN for admin access only
- [ ] Configure rate limiting in Nginx
- [ ] Enable HTTP/2 in web server
- [ ] Set up CDN for static assets

---

## Scaling Considerations

### For Higher Load

1. **Increase Resources**
   - Upgrade VPS to 4-8GB RAM
   - Increase PostgreSQL shared_buffers

2. **Horizontal Scaling**
   - Use Redis pub/sub for multi-instance messaging
   - Add load balancer (nginx/traefik)
   - Configure sticky sessions for WebSocket
   - Use shared file storage (S3, NFS) for uploads

3. **Database Optimization**
   - Add read replicas
   - Configure connection pooling (PgBouncer)
   - Add database indexes for frequently queried columns

---

## Troubleshooting

### Voice Not Working
1. Check TURN server is running: `docker compose ps coturn`
2. Verify `COTURN_EXTERNAL_IP` is set correctly
3. Ensure UDP ports are open in firewall
4. Test TURN at https://webrtc.github.io/samples/src/content/peerconnection/trickle-ice/

### WebSocket Connection Failed
1. Check WebSocket server: `curl http://localhost:3002`
2. Verify `WS_PORT` is correct
3. Check nginx/Caddy configuration for WebSocket proxy

### Database Connection Issues
1. Check PostgreSQL is running: `docker compose ps postgres`
2. Verify `POSTGRES_*` environment variables
3. Check logs: `docker compose logs postgres`

### High Memory Usage
1. Check container stats: `docker stats`
2. Reduce PostgreSQL memory in `docker-compose.prod.yml`
3. Add Redis memory limit

---

## Support

- GitHub Issues: https://github.com/yourusername/vibespeak/issues
- Documentation: `/docs`
- Logs: `docker compose logs`