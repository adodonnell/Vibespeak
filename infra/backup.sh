#!/bin/bash
# Disorder — Database Backup Script
# Usage: ./backup.sh [--restore /path/to/backup.sql.gz]

set -e

# Configuration
BACKUP_DIR="${BACKUP_DIR:-/opt/disorder/backups}"
DB_CONTAINER="${DB_CONTAINER:-disorder-db}"
DB_USER="${POSTGRES_USER:-disorder}"
DB_NAME="${POSTGRES_DB:-disorder}"
RETENTION_DAYS="${RETENTION_DAYS:-7}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
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

# Create backup directory if it doesn't exist
mkdir -p "$BACKUP_DIR"

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    log_error "Docker is not running or not accessible"
    exit 1
fi

# Check if database container is running
if ! docker ps --format '{{.Names}}' | grep -q "^${DB_CONTAINER}$"; then
    log_error "Database container '$DB_CONTAINER' is not running"
    exit 1
fi

# Restore mode
if [ "$1" == "--restore" ] && [ -n "$2" ]; then
    RESTORE_FILE="$2"
    
    if [ ! -f "$RESTORE_FILE" ]; then
        log_error "Backup file not found: $RESTORE_FILE"
        exit 1
    fi
    
    log_info "Restoring database from: $RESTORE_FILE"
    
    # Decompress and restore
    if [[ "$RESTORE_FILE" == *.gz ]]; then
        log_info "Decompressing and restoring..."
        gunzip -c "$RESTORE_FILE" | docker exec -i "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME"
    else
        log_info "Restoring..."
        docker exec -i "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" < "$RESTORE_FILE"
    fi
    
    log_info "Database restored successfully!"
    exit 0
fi

# Backup mode
BACKUP_FILE="${BACKUP_DIR}/disorder_${TIMESTAMP}.sql"

log_info "Starting database backup..."
log_info "Database: $DB_NAME"
log_info "Container: $DB_CONTAINER"

# Create the backup
docker exec "$DB_CONTAINER" pg_dump -U "$DB_USER" "$DB_NAME" > "$BACKUP_FILE"

if [ $? -eq 0 ]; then
    # Compress the backup
    log_info "Compressing backup..."
    gzip "$BACKUP_FILE"
    BACKUP_FILE="${BACKUP_FILE}.gz"
    
    # Get file size
    FILE_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
    
    log_info "Backup created: $BACKUP_FILE ($FILE_SIZE)"
    
    # Clean old backups
    log_info "Cleaning backups older than $RETENTION_DAYS days..."
    DELETED_COUNT=$(find "$BACKUP_DIR" -name "disorder_*.sql.gz" -mtime +$RETENTION_DAYS -delete -print | wc -l)
    
    if [ "$DELETED_COUNT" -gt 0 ]; then
        log_info "Deleted $DELETED_COUNT old backup(s)"
    fi
    
    # List current backups
    log_info "Current backups:"
    ls -lh "$BACKUP_DIR"/disorder_*.sql.gz 2>/dev/null | tail -5
    
    # Calculate total backup size
    TOTAL_SIZE=$(du -sh "$BACKUP_DIR" | cut -f1)
    log_info "Total backup size: $TOTAL_SIZE"
    
else
    log_error "Backup failed!"
    exit 1
fi

log_info "Backup completed successfully!"
</task_progress>
</write_to_file>