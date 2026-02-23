# VibeSpeak Deployment Guide

This guide covers deploying VibeSpeak to a production VPS.

## Prerequisites

- Docker and Docker Compose
- A VPS with at least 2GB RAM (4GB recommended)
- Domain name (optional but recommended)
- Ports 80, 443, 3001, 3002, 9988/udp, 3478/udp available

## Quick Start

### 1. Clone the repository

```bash
git clone https://github.com/yourusername/vibespeak.git
cd vibespeak
```

### 2. Configure environment

```bash
cp infra/.env.example infra/.env
```

Edit `infra/.env` and set all required values:

```bash
# Database
POSTGRES_PASSWORD=your_secure_password_here

# JWT (generate with: node -e "console.log(require('crypto').randomBytes(64).toString('hex'))")
JWT_SECRET=your_jwt_secret_here

# TURN Server
COTURN_EXTERNAL_IP=your_vps_public_ip
COTURN_SECRET=your_turn_secret_here

# Voice encryption
VOICE_ENCRYPTION_KEY=your_voice_key_here
```

### 3. Deploy with Docker Compose

```bash
docker compose -f infra/docker-compose.prod.yml up -d
```

### 4. Run migrations

```bash
docker compose -f infra/docker-compose.prod.yml exec server-brain npm run migrate
```

### 5. Verify deployment

```bash
# Check health
curl http://localhost:3001/health

# Check API
curl http://localhost:3001/api/info
```

## Services

The deployment includes these services:

| Service | Port | Description |
|---------|------|-------------|
| PostgreSQL | 5432 | Primary database |
| Redis | 6379 | Presence, sessions, pub/sub |
| Server Brain | 3001 | HTTP API |
| WebSocket | 3002 | Real-time signaling |
| Voice Relay | 9988/udp | Voice data relay |
| Coturn | 3478/udp | TURN/STUN server |
| Backup | - | Automated backups |

## Development

For local development, use the development compose file:

```bash
# Start infrastructure only
docker compose -f infra/docker-compose.dev.yml up -d

# Run server locally
cd server-brain
npm run dev

# Run client locally
cd local-client
npm run dev
```

Development services:
- Adminer (DB GUI): http://localhost:8080
- Redis Commander: http://localhost:8081

## Database Migrations

```bash
# Check status
docker compose -f infra/docker-compose.prod.yml exec server-brain npm run migrate:status

# Run migrations
docker compose -f infra/docker-compose.prod.yml exec server-brain npm run migrate

# Rollback last migration
docker compose -f infra/docker-compose.prod.yml exec server-brain npm run migrate:down

# Create new migration
docker compose -f infra/docker-compose.prod.yml exec server-brain npm run migrate:create migration_name
```

## Backups

### Manual backup

```bash
# Database only
./infra/backup.sh

# Full backup (database + uploads + config)
./infra/backup-full.sh
```

### Restore from backup

```bash
# Database restore
./infra/backup.sh --restore /path/to/backup.sql.gz

# Full restore
./infra/backup-full.sh --restore /path/to/backup.tar.gz
```

### Automated backups

The production compose file includes an automated backup service that runs daily at midnight. Backups are stored in the `postgres_backup` volume with retention:
- Daily: 7 days
- Weekly: 4 weeks  
- Monthly: 6 months

## File Uploads

File uploads are secured with:
- Magic number validation (prevents file type spoofing)
- Dangerous extension blocking
- Path traversal prevention
- Malicious content scanning
- Rate limiting (50/hour, 200/day per user)

Maximum file size: 50MB (configurable via `MAX_FILE_SIZE`)

Allowed file types: Images, videos, audio, documents, archives

## Scaling

For horizontal scaling, you'll need:

1. **Load balancer** (nginx/traefik) for HTTP/WebSocket
2. **Redis pub/sub** for cross-instance messaging
3. **Shared file storage** (S3, NFS) for uploads
4. **Sticky sessions** for WebSocket connections

Example nginx config:

```nginx
upstream vibespeak_http {
    server server1:3001;
    server server2:3001;
}

upstream vibespeak_ws {
    ip_hash;  # Sticky sessions
    server server1:3002;
    server server2:3002;
}

server {
    listen 80;
    server_name vibespeak.example.com;

    location / {
        proxy_pass http://vibespeak_http;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location /ws {
        proxy_pass http://vibespeak_ws;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

## Monitoring

### Health checks

```bash
# Server health
curl http://localhost:3001/health

# Database health
docker compose -f infra/docker-compose.prod.yml exec postgres pg_isready

# Redis health
docker compose -f infra/docker-compose.prod.yml exec redis redis-cli ping
```

### Logs

```bash
# All services
docker compose -f infra/docker-compose.prod.yml logs -f

# Specific service
docker compose -f infra/docker-compose.prod.yml logs -f server-brain
```

## Troubleshooting

### Port already in use

```bash
# Find process using port
netstat -tlnp | grep :3001

# Kill process
kill -9 <PID>
```

### Database connection issues

```bash
# Check database is running
docker compose -f infra/docker-compose.prod.yml ps postgres

# Check logs
docker compose -f infra/docker-compose.prod.yml logs postgres
```

### Voice not working

1. Verify TURN server is running
2. Check `COTURN_EXTERNAL_IP` is set correctly
3. Ensure UDP ports are open in firewall
4. Check client ICE servers fetch: `curl http://localhost:3001/api/turn/ice-servers -H "Authorization: Bearer <token>"`

## Security Checklist

- [ ] Change all default passwords
- [ ] Set strong JWT_SECRET (64+ chars)
- [ ] Configure firewall (ufw)
- [ ] Enable HTTPS (Let's Encrypt)
- [ ] Set `ALLOWED_ORIGINS` to your domain
- [ ] Review file upload settings
- [ ] Enable rate limiting
- [ ] Set up monitoring/alerting
- [ ] Configure automated backups
- [ ] Test backup restoration

## License

MIT