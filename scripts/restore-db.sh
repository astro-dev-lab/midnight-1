#!/bin/bash
# =============================================================================
# StudioOS Database Restore Script
#
# Usage:
#   ./scripts/restore-db.sh backup.dump           # Restore from specific file
#   ./scripts/restore-db.sh                       # Restore from latest backup
#   FORCE=1 ./scripts/restore-db.sh backup.dump   # Skip confirmation
#
# Environment variables:
#   DATABASE_URL       - PostgreSQL connection string (required)
#   BACKUP_DIR         - Backup directory (default: ./backups)
#   FORCE              - Skip confirmation prompt (default: 0)
#
# =============================================================================

set -euo pipefail

# Configuration
BACKUP_DIR="${BACKUP_DIR:-./backups}"
FORCE="${FORCE:-0}"
BACKUP_PREFIX="${BACKUP_PREFIX:-studioos}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log() {
    local level=$1
    shift
    echo -e "[$(date '+%Y-%m-%d %H:%M:%S')] ${level}: $*"
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
    exit 1
fi

# Determine backup file to restore
if [ $# -ge 1 ]; then
    BACKUP_FILE="$1"
    # If just a filename, look in backup dir
    if [ ! -f "$BACKUP_FILE" ] && [ -f "${BACKUP_DIR}/${BACKUP_FILE}" ]; then
        BACKUP_FILE="${BACKUP_DIR}/${BACKUP_FILE}"
    fi
else
    BACKUP_FILE="${BACKUP_DIR}/${BACKUP_PREFIX}_latest.dump"
fi

if [ ! -f "$BACKUP_FILE" ]; then
    log_error "Backup file not found: $BACKUP_FILE"
    echo ""
    echo "Available backups:"
    ls -lh "$BACKUP_DIR"/${BACKUP_PREFIX}_*.dump 2>/dev/null || echo "  (none)"
    exit 1
fi

# Parse DATABASE_URL for pg_restore
parse_db_url() {
    local url=$1
    url=${url#postgresql://}
    url=${url#postgres://}
    
    local auth=${url%%@*}
    PGUSER=${auth%%:*}
    PGPASSWORD=${auth#*:}
    
    local rest=${url#*@}
    local hostport=${rest%%/*}
    PGDATABASE=${rest#*/}
    PGDATABASE=${PGDATABASE%%\?*}
    
    PGHOST=${hostport%%:*}
    PGPORT=${hostport#*:}
    if [ "$PGPORT" = "$PGHOST" ]; then
        PGPORT=5432
    fi
}

parse_db_url "$DATABASE_URL"
export PGPASSWORD

# Get backup info
BACKUP_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
BACKUP_DATE=$(stat -c %y "$BACKUP_FILE" 2>/dev/null || stat -f %Sm "$BACKUP_FILE" 2>/dev/null || echo "unknown")

log_info "Restore target: $PGHOST:$PGPORT/$PGDATABASE"
log_info "Backup file: $BACKUP_FILE"
log_info "Backup size: $BACKUP_SIZE"
log_info "Backup date: $BACKUP_DATE"

# Confirmation prompt
if [ "$FORCE" != "1" ]; then
    echo ""
    echo -e "${YELLOW}WARNING: This will DROP and recreate all tables in the database!${NC}"
    echo -e "Database: ${RED}$PGDATABASE${NC} on $PGHOST"
    echo ""
    read -p "Are you sure you want to continue? (yes/no): " confirm
    if [ "$confirm" != "yes" ]; then
        log_info "Restore cancelled"
        exit 0
    fi
fi

log_info "Starting database restore..."
START_TIME=$(date +%s)

# Drop existing schema and restore
if pg_restore -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE" \
    --clean --if-exists --no-owner --no-privileges "$BACKUP_FILE"; then
    END_TIME=$(date +%s)
    DURATION=$((END_TIME - START_TIME))
    
    log_info "Restore completed successfully"
    log_info "Duration: ${DURATION}s"
else
    log_error "Restore failed!"
    log_warn "The database may be in an inconsistent state"
    exit 1
fi

# Verify restore
log_info "Verifying restore..."
if psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE" -c "SELECT COUNT(*) FROM \"User\"" > /dev/null 2>&1; then
    log_info "Database verification: OK"
else
    log_warn "Database verification: Could not verify User table"
fi

log_info "Restore process completed"
