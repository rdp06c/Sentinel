#!/bin/bash
# APEX Advisory Dashboard — Pi Deployment Script
# Run on Raspberry Pi after cloning the repo:
#   cd ~/apex-advisory && bash scripts/deploy.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

echo "=== APEX Advisory Dashboard — Pi Setup ==="
echo ""

# ── 1. Check/install Node.js 20 LTS ──
if command -v node &>/dev/null; then
    NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
    echo "[ok] Node.js $(node -v) installed"
    if [ "$NODE_VERSION" -lt 18 ]; then
        echo "[warn] Node.js 18+ recommended. Current: $(node -v)"
        echo "       Install via: curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt-get install -y nodejs"
        exit 1
    fi
else
    echo "[install] Node.js not found. Installing Node.js 20 LTS..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y nodejs
    echo "[ok] Node.js $(node -v) installed"
fi

# ── 2. Install dependencies ──
echo ""
echo "[install] Running npm install (better-sqlite3 compiles natively on ARM)..."
npm install --production
echo "[ok] Dependencies installed"

# ── 3. Set up .env ──
echo ""
if [ ! -f .env ]; then
    cp .env.example .env
    echo "[setup] Created .env from .env.example"
    echo ""
    echo "  You need to configure the following in .env:"
    echo "    MASSIVE_API_KEY   — Polygon.io API key (required for market data)"
    echo "    ANTHROPIC_API_KEY — Anthropic API key (optional, for chat)"
    echo "    NTFY_TOPIC        — ntfy.sh topic name (optional, for notifications)"
    echo "    API_SECRET        — Shared secret for API auth (required)"
    echo "    PORT              — Server port (default: 4000)"
    echo ""
    read -p "  Edit .env now? [Y/n] " EDIT_ENV
    if [ "${EDIT_ENV,,}" != "n" ]; then
        ${EDITOR:-nano} .env
    fi
else
    echo "[ok] .env already exists"
fi

# ── 4. Create data directory ──
mkdir -p data
echo "[ok] data/ directory ready"

# ── 5. Build dashboard ──
echo ""
echo "[build] Building dashboard..."
bash build.sh
echo "[ok] Dashboard built → public/index.html"

# ── 6. Optional: migrate legacy data ──
if [ -f data/Apex_Portfolio.json ]; then
    echo ""
    read -p "[migrate] Found legacy Apex_Portfolio.json. Import into SQLite? [Y/n] " DO_MIGRATE
    if [ "${DO_MIGRATE,,}" != "n" ]; then
        node server/migrate.js data/Apex_Portfolio.json
        echo "[ok] Legacy data migrated"
    fi
fi

# ── 7. Install pm2 + start server ──
echo ""
if ! command -v pm2 &>/dev/null; then
    echo "[install] Installing pm2..."
    sudo npm install -g pm2
fi

# Stop existing instance if running
pm2 delete apex 2>/dev/null || true

echo "[start] Starting APEX server with pm2..."
pm2 start server/index.js --name apex --time
echo "[ok] Server started"

# ── 8. Set up pm2 startup (auto-restart on reboot) ──
echo ""
echo "[setup] Configuring pm2 startup..."
pm2 save
sudo env PATH=$PATH:$(which node | xargs dirname) $(which pm2) startup systemd -u $USER --hp $HOME
echo "[ok] pm2 startup configured"

# ── 9. Add daily backup cron job ──
echo ""
BACKUP_CRON="0 2 * * * cd $PROJECT_DIR && bash scripts/backup.sh"
if crontab -l 2>/dev/null | grep -q "backup.sh"; then
    echo "[ok] Backup cron already configured"
else
    (crontab -l 2>/dev/null; echo "$BACKUP_CRON") | crontab -
    echo "[ok] Daily backup cron added (2 AM)"
fi

# ── 10. Summary ──
PORT=$(grep PORT .env 2>/dev/null | cut -d'=' -f2 || echo "4000")
echo ""
echo "=== APEX Setup Complete ==="
echo ""
echo "  Server:     http://localhost:${PORT}"
echo "  Dashboard:  http://$(hostname -I | awk '{print $1}'):${PORT}"
echo "  Logs:       pm2 logs apex"
echo "  Status:     pm2 status"
echo "  Restart:    pm2 restart apex"
echo ""
echo "  Next steps:"
echo "    1. Verify API keys in .env"
echo "    2. Open dashboard in browser"
echo "    3. For remote access: bash scripts/setup-tunnel.sh"
echo ""
