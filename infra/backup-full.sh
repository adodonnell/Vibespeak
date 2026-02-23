#!/bin/bash
# VibeSpeak — Full Backup Script
# Backs up database, uploads, and configuration
# Usage: ./backup-full.sh [--restore /path/to/backup.tar.gz]

set -e

# Configuration
BACKUP_DIR="${BACKUP_DIR:-/opt/vibespeak/backups}"
DB_CONTAINER="${DB_CONTAINER:-vibespeak-db}"
SERVER_CONTAINER="${SERVER_CONTAINER:-vibespeak-server}"
DB_USER="${POSTGRES_USER:-vibespeak}"
DB_NAME="${POSTGRES_DB:-vibespeak}"
UPLOADS_DIR="${UPLOADS_DIR:-/var/lib/docker/volumes/vibespeak_uploads_data/_data}"
RETENTION_DAYS="${RETENTION_DAYS:-7}"
RETENTION_WEEKS="${RETENTION_WEEKS:-4}"
RETENTION_MONTHS="${RETENTION_MONTHS:-6}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
DATE_ONLY=$(date +%Y%m%d)

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_step() {
    echo -e "${BLUE}[STEP]${NC} $1"
}

# Create backup directories
mkdir -p "$BACKUP_DIR"/{daily,weekly,monthly}

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    log_error "Docker is not running or not accessible"
    exit 1
fi

# Restore mode
if [ "$1" == "--restore" ] && [ -n "$2" ]; then
    RESTORE_FILE="$2"
    
    if [ ! -f "$RESTORE_FILE" ]; then
        log_error "Backup file not found: $RESTORE_FILE"
        exit 1
    fi
    
    log_info "Restoring from: $RESTORE_FILE"
    
    # Create temp directory
    TEMP_DIR=$(mktemp -d)
    
    # Extract backup
    log_step "Extracting backup archive..."
    tar -xzf "$RESTORE_FILE" -C "$TEMP_DIR"
    
    # Restore database
    if [ -f "$TEMP_DIR/database.sql.gz" ]; then
        log_step "Restoring database..."
        gunzip -c "$TEMP_DIR/database.sql.gz" | docker exec -i "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME"
        log_info "Database restored"
    fi
    
    # Restore uploads
    if [ -d "$TEMP_DIR/uploads" ] && [ -d "$UPLOADS_DIR" ]; then
        log_step "Restoring uploads..."
        rm -rf "$UPLOADS_DIR"/*
        cp -r "$TEMP_DIR/uploads/"* "$UPLOADS_DIR"/ 2>/dev/null || true
        log_info "Uploads restored"
    fi
    
    # Restore configuration
    if [ -f "$TEMP_DIR/config/.env" ]; then
        log_step "Restoring configuration..."
        cp "$TEMP_DIR/config/.env" ./infra/.env
        log_info "Configuration restored"
    fi
    
    # Cleanup
    rm -rf "$TEMP_DIR"
    
    log_info "Restore completed successfully!"
    exit 0
fi

# Backup mode
log_info "Starting full backup..."
log_info "Timestamp: $TIMESTAMP"

# Create temp directory for this backup
TEMP_DIR=$(mktemp -d)
BACKUP_NAME="vibespeak_full_${TIMESTAMP}"

# Step 1: Database backup
log_step "Backing up database..."
docker exec "$DB_CONTAINER" pg_dump -U "$DB_USER" "$DB_NAME" | gzip > "$TEMP_DIR/database.sql.gz"
DB_SIZE=$(du -h "$TEMP_DIR/database.sql.gz" | cut -f1)
log_info "Database backup: $DB_SIZE"

# Step 2: Uploads backup
log_step "Backing up uploads..."
if [ -d "$UPLOADS_DIR" ]; then
    cp -r "$UPLOADS_DIR" "$TEMP_DIR/uploads"
    UPLOADS_SIZE=$(du -sh "$TEMP_DIR/uploads" | cut -f1)
    log_info "Uploads backup: $UPLOADS_SIZE"
else
    log_warn "Uploads directory not found, skipping"
    mkdir -p "$TEMP_DIR/uploads"
fi

# Step 3: Configuration backup
log_step "Backing up configuration..."
mkdir -p "$TEMP_DIR/config"
if [ -f "./infra/.env" ]; then
    cp "./infra/.env" "$TEMP_DIR/config/.env"
    # Mask sensitive values for security
    sed -i 's/\(PASSWORD=\).*/\1***MASKED***/g' "$TEMP_DIR/config/.env" 2>/dev/null || true
    sed -i 's/\(SECRET=\).*/\1***MASKED***/g' "$TEMP_DIR/config/.env" 2>/dev/null || true
    sed -i 's/\(TOKEN=\).*/\1***MASKED***/g' "$TEMP_DIR/config/.env" 2>/dev/null || true
fi
if [ -f "./infra/coturn/turnserver.conf" ]; then
    cp "./infra/coturn/turnserver.conf" "$TEMP_DIR/config/"
fi

# Step 4: Migration status
log_step "Saving migration status..."
docker exec "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -c "SELECT * FROM schema_migrations ORDER BY id" > "$TEMP_DIR/migrations.txt" 2>/dev/null || echo "No migrations table found"

# Step 5: Create archive
log_step "Creating archive..."
BACKUP_FILE="${BACKUP_DIR}/daily/${BACKUP_NAME}.tar.gz"
tar -czf "$BACKUP_FILE" -C "$TEMP_DIR" .
BACKUP_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
log_info "Archive created: $BACKUP_SIZE"

# Cleanup temp
rm -rf "$TEMP_DIR"

# Step 6: Weekly/Monthly retention
DAY_OF_WEEK=$(date +%u)  # 1-7, 1=Monday
DAY_OF_MONTH=$(date +%d)

# Weekly backup (on Sundays)
if [ "$DAY_OF_WEEK" -eq 7 ]; then
    log_step "Creating weekly backup..."
    cp "$BACKUP_FILE" "${BACKUP_DIR}/weekly/vibespeak_weekly_${DATE_ONLY}.tar.gz"
fi

# Monthly backup (on 1st of month)
if [ "$DAY_OF_MONTH" -eq 01 ]; then
    log_step "Creating monthly backup..."
    cp "$BACKUP_FILE" "${BACKUP_DIR}/monthly/vibespeak_monthly_${DATE_ONLY}.tar.gz"
fi

# Step 7: Cleanup old backups
log_step "Cleaning old backups..."

# Daily backups - keep for RETENTION_DAYS
DELETED_DAILY=$(find "$BACKUP_DIR/daily" -name "*.tar.gz" -mtime +$RETENTION_DAYS -delete -print 2>/dev/null | wc -l)
log_info "Deleted $DELETED_DAILY daily backup(s)"

# Weekly backups - keep for RETENTION_WEEKS weeks
DELETED_WEEKLY=$(find "$BACKUP_DIR/weekly" -name "*.tar.gz" -mtime +$((RETENTION_WEEKS * 7)) -delete -print 2>/dev/null | wc -l)
log_info "Deleted $DELETED_WEEKLY weekly backup(s)"

# Monthly backups - keep for RETENTION_MONTHS months
DELETED_MONTHLY=$(find "$BACKUP_DIR/monthly" -name "*.tar.gz" -mtime +$((RETENTION_MONTHS * 30)) -delete -print 2>/dev/null | wc -l)
log_info "Deleted $DELETED_MONTHLY monthly backup(s)"

# Step 8: Summary
log_info "==================================="
log_info "Backup Summary:"
log_info "  File: $BACKUP_FILE"
log_info "  Size: $BACKUP_SIZE"
log_info "  Database: $DB_SIZE"
log_info "  Uploads: ${UPLOADS_SIZE:-N/A}"
log_info "==================================="

# List current backups
log_info "Current backups:"
echo ""
echo "Daily (last 5):"
ls -lht "$BACKUP_DIR/daily"/*.tar.gz 2>/dev/null | head -5 || echo "  No daily backups"
echo ""
echo "Weekly:"
ls -lht "$BACKUP_DIR/weekly"/*.tar.gz 2>/dev/null | head -4 || echo "  No weekly backups"
echo ""
echo "Monthly:"
ls -lht "$BACKUP_DIR/monthly"/*.tar.gz 2>/dev/null | head -6 || echo "  No monthly backups"

# Total backup size
TOTAL_SIZE=$(du -sh "$BACKUP_DIR" | cut -f1)
log_info "Total backup size: $TOTAL_SIZE"

log_info "Backup completed successfully!"