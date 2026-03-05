#!/bin/bash
# Daily SQLite backup — rotated on-disk (last 30 copies)
# Add to crontab: 0 5 * * * /path/to/scripts/backup.sh

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
DB_PATH="$PROJECT_DIR/data/apex.db"
BACKUP_DIR="$PROJECT_DIR/data/backups"
KEEP=30

if [ ! -f "$DB_PATH" ]; then
    echo "Database not found: $DB_PATH"
    exit 1
fi

mkdir -p "$BACKUP_DIR"

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/apex_${TIMESTAMP}.db"

# Use SQLite backup API via .backup command for safe hot copy
sqlite3 "$DB_PATH" ".backup '$BACKUP_FILE'" 2>/dev/null

# Fallback: simple copy if sqlite3 not available
if [ $? -ne 0 ]; then
    cp "$DB_PATH" "$BACKUP_FILE"
fi

echo "Backup created: $BACKUP_FILE"

# Rotate: keep only last N backups
cd "$BACKUP_DIR"
ls -1t apex_*.db 2>/dev/null | tail -n +$((KEEP + 1)) | xargs -r rm -f

echo "Rotation complete. $(ls -1 apex_*.db 2>/dev/null | wc -l) backups retained."
