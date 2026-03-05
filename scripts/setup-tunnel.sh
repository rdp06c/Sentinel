#!/bin/bash
# APEX Advisory Dashboard — Cloudflare Tunnel Setup
# Provides remote access to the dashboard via apex.yourdomain.com
#
# Prerequisites:
#   - APEX server running on Pi (bash scripts/deploy.sh)
#   - Cloudflare account with a domain
#   - cloudflared installed on Pi
#
# Run: bash scripts/setup-tunnel.sh

set -e

APEX_PORT=$(grep PORT .env 2>/dev/null | cut -d'=' -f2 || echo "4000")

echo "=== Cloudflare Tunnel Setup for APEX ==="
echo ""
echo "This script guides you through setting up a Cloudflare Tunnel"
echo "so you can access the APEX dashboard from anywhere."
echo ""

# ── 1. Install cloudflared ──
if command -v cloudflared &>/dev/null; then
    echo "[ok] cloudflared $(cloudflared --version 2>&1 | head -1) installed"
else
    echo "[install] Installing cloudflared..."
    # ARM64 (Pi 5) or ARM (Pi 4)
    ARCH=$(dpkg --print-architecture 2>/dev/null || uname -m)
    if [ "$ARCH" = "arm64" ] || [ "$ARCH" = "aarch64" ]; then
        curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm64.deb -o /tmp/cloudflared.deb
    elif [ "$ARCH" = "armhf" ] || [ "$ARCH" = "armv7l" ]; then
        curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm.deb -o /tmp/cloudflared.deb
    else
        echo "[error] Unsupported architecture: $ARCH"
        echo "  Download manually from: https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation/"
        exit 1
    fi
    sudo dpkg -i /tmp/cloudflared.deb
    rm /tmp/cloudflared.deb
    echo "[ok] cloudflared installed"
fi

# ── 2. Authenticate ──
echo ""
echo "[auth] Authenticating with Cloudflare..."
echo "  A browser window will open. Log in and select your domain."
echo ""
cloudflared tunnel login
echo "[ok] Authenticated"

# ── 3. Create tunnel ──
echo ""
read -p "Tunnel name [apex]: " TUNNEL_NAME
TUNNEL_NAME=${TUNNEL_NAME:-apex}

echo "[create] Creating tunnel '$TUNNEL_NAME'..."
cloudflared tunnel create "$TUNNEL_NAME"
TUNNEL_ID=$(cloudflared tunnel list | grep "$TUNNEL_NAME" | awk '{print $1}')
echo "[ok] Tunnel created: $TUNNEL_ID"

# ── 4. Configure tunnel ──
echo ""
read -p "Subdomain for dashboard (e.g., apex): " SUBDOMAIN
read -p "Your domain (e.g., yourdomain.com): " DOMAIN
HOSTNAME="${SUBDOMAIN}.${DOMAIN}"

CONFIG_DIR="$HOME/.cloudflared"
CONFIG_FILE="$CONFIG_DIR/config.yml"

cat > "$CONFIG_FILE" << EOF
tunnel: $TUNNEL_ID
credentials-file: $CONFIG_DIR/$TUNNEL_ID.json

ingress:
  - hostname: $HOSTNAME
    service: http://localhost:$APEX_PORT
  - service: http_status:404
EOF

echo "[ok] Config written to $CONFIG_FILE"

# ── 5. Add DNS route ──
echo ""
echo "[dns] Adding DNS route: $HOSTNAME → tunnel..."
cloudflared tunnel route dns "$TUNNEL_NAME" "$HOSTNAME"
echo "[ok] DNS configured"

# ── 6. Test tunnel ──
echo ""
echo "[test] Starting tunnel (Ctrl+C to stop test)..."
echo "  Visit: https://$HOSTNAME"
echo ""
read -p "Press Enter to test, or 's' to skip to service setup: " TEST_CHOICE
if [ "$TEST_CHOICE" != "s" ]; then
    timeout 30 cloudflared tunnel run "$TUNNEL_NAME" || true
fi

# ── 7. Install as systemd service ──
echo ""
echo "[service] Installing cloudflared as systemd service..."
sudo cloudflared service install
sudo systemctl enable cloudflared
sudo systemctl start cloudflared
echo "[ok] cloudflared service installed and started"

# ── 8. Cloudflare Access (manual step) ──
echo ""
echo "=== Setup Complete ==="
echo ""
echo "  Dashboard URL: https://$HOSTNAME"
echo "  Tunnel status: cloudflared tunnel info $TUNNEL_NAME"
echo "  Service logs:  sudo journalctl -u cloudflared -f"
echo ""
echo "  IMPORTANT — Set up Cloudflare Access:"
echo "    1. Go to: https://one.dash.cloudflare.com"
echo "    2. Access → Applications → Add an application"
echo "    3. Self-hosted → Name: APEX, Domain: $HOSTNAME"
echo "    4. Add policy: Allow → Emails → your@email.com"
echo "    5. Save"
echo ""
echo "  This ensures only authorized users can access the dashboard."
echo ""
