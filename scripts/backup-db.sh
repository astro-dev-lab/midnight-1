#!/bin/bash
# =============================================================================
# StudioOS Database Backup Script
#
# Usage:
#   ./scripts/backup-db.sh                    # Backup to default location
#   ./scripts/backup-db.sh /path/to/backups   # Backup to custom location
#   BACKUP_RETENTION_DAYS=14 ./scripts/backup-db.sh  # Keep 14 days of backups
#
# Environment variables:
#   DATABASE_URL       - PostgreSQL connection string (required)
#   BACKUP_DIR         - Backup directory (default: ./backups)
#   BACKUP_RETENTION   - Days to keep backups (default: 7)
#   BACKUP_PREFIX      - Backup file prefix (default: studioos)
#
# =============================================================================

set -euo pipefail

# Configuration
BACKUP_DIR="${1:-${BACKUP_DIR:-./backups}}"
BACKUP_RETENTION="${BACKUP_RETENTION_DAYS:-7}"
BACKUP_PREFIX="${BACKUP_PREFIX:-studioos}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/${BACKUP_PREFIX}_${TIMESTAMP}.dump"
LOG_FILE="${BACKUP_DIR}/backup.log"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log() {
    local level=$1
    shift
    local message="$*"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo -e "[${timestamp}] ${level}: ${message}" | tee -a "$LOG_FILE"
}

log_info() {
    log "${GREEN}INFO${NC}" "$@"
}

log_warn() {
    log "${YELLOW}WARN${NC}" "$@"
}

log_error() {
    log "${RED}ERROR${NC}" "$@"
}

# Check required environment variables
if [ -z "${DATABASE_URL:-}" ]; then
    log_error "DATABASE_URL environment variable is required"
    echo "Set DATABASE_URL to your PostgreSQL connection string"
    echo "Example: DATABASE_URL='postgresql://user:pass@host:5432/dbname'"
    exit 1
fi

# Create backup directory if it doesn't exist
mkdir -p "$BACKUP_DIR"

log_info "Starting database backup"
log_info "Backup directory: $BACKUP_DIR"
log_info "Retention period: $BACKUP_RETENTION days"

# Parse DATABASE_URL for pg_dump
# Format: postgresql://user:password@host:port/database
parse_db_url() {
    local url=$1
    # Remove protocol prefix
    url=${url#postgresql://}
    url=${url#postgres://}
    
    # Extract user:password
    local auth=${url%%@*}
    PGUSER=${auth%%:*}
    PGPASSWORD=${auth#*:}
    
    # Extract host:port/database
    local rest=${url#*@}
    local hostport=${rest%%/*}
    PGDATABASE=${rest#*/}
    # Remove query params
    PGDATABASE=${PGDATABASE%%\?*}
    
    PGHOST=${hostport%%:*}
    PGPORT=${hostport#*:}
    if [ "$PGPORT" = "$PGHOST" ]; then
        PGPORT=5432
    fi
}

parse_db_url "$DATABASE_URL"
export PGPASSWORD

log_info "Connecting to: $PGHOST:$PGPORT/$PGDATABASE"

# Perform backup
log_info "Creating backup: $BACKUP_FILE"
START_TIME=$(date +%s)

if pg_dump -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -Fc -f "$BACKUP_FILE" "$PGDATABASE"; then
    END_TIME=$(date +%s)
    DURATION=$((END_TIME - START_TIME))
    SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
    
    log_info "Backup completed successfully"
    log_info "File: $BACKUP_FILE"
    log_info "Size: $SIZE"
    log_info "Duration: ${DURATION}s"
    
    # Create latest symlink
    ln -sf "$(basename "$BACKUP_FILE")" "${BACKUP_DIR}/${BACKUP_PREFIX}_latest.dump"
    log_info "Updated symlink: ${BACKUP_PREFIX}_latest.dump -> $(basename "$BACKUP_FILE")"
else
    log_error "Backup failed!"
    rm -f "$BACKUP_FILE"
    exit 1
fi

# Clean up old backups
log_info "Cleaning up backups older than $BACKUP_RETENTION days"
DELETED_COUNT=0
while IFS= read -r file; do
    if [ -f "$file" ]; then
        log_info "Deleting old backup: $(basename "$file")"
        rm -f "$file"
        DELETED_COUNT=$((DELETED_COUNT + 1))
    fi
done < <(find "$BACKUP_DIR" -name "${BACKUP_PREFIX}_*.dump" -type f -mtime +$BACKUP_RETENTION ! -name "${BACKUP_PREFIX}_latest.dump" 2>/dev/null || true)

if [ $DELETED_COUNT -gt 0 ]; then
    log_info "Deleted $DELETED_COUNT old backup(s)"
fi

# List current backups
log_info "Current backups:"
ls -lh "$BACKUP_DIR"/${BACKUP_PREFIX}_*.dump 2>/dev/null | tail -10 || true

log_info "Backup process completed"
