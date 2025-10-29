#!/bin/bash

# E-Reader App Setup Script
# This script sets up the e-reader application on your VPS

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}╔════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║     Personal E-Reader Setup Script     ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════╝${NC}"

# Get current user
CURRENT_USER=$(whoami)
APP_DIR="$HOME/ereader-app"

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Step 1: Update system packages
echo -e "\n${YELLOW}Step 1: Updating system packages...${NC}"
sudo apt-get update

# Step 2: Install Node.js if not present
echo -e "\n${YELLOW}Step 2: Checking Node.js installation...${NC}"
if ! command_exists node; then
    echo "Installing Node.js..."
    curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
    sudo apt-get install -y nodejs
else
    echo -e "${GREEN}✓ Node.js is already installed ($(node --version))${NC}"
fi

# Step 3: Install PM2 globally
echo -e "\n${YELLOW}Step 3: Installing PM2 for process management...${NC}"
if ! command_exists pm2; then
    sudo npm install pm2@latest -g
else
    echo -e "${GREEN}✓ PM2 is already installed${NC}"
fi

# Step 4: Navigate to app directory
echo -e "\n${YELLOW}Step 4: Setting up application directory...${NC}"
cd "$APP_DIR"

# Step 5: Install dependencies
echo -e "\n${YELLOW}Step 5: Installing application dependencies...${NC}"
npm install

# Step 6: Create default cover image
echo -e "\n${YELLOW}Step 6: Creating default cover image...${NC}"
mkdir -p public/img
cat > public/img/default-cover.svg << 'EOF'
<svg width="150" height="225" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="grad1" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#667eea;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#764ba2;stop-opacity:1" />
    </linearGradient>
  </defs>
  <rect width="150" height="225" fill="url(#grad1)"/>
  <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="white" font-size="60">📚</text>
</svg>
EOF

# Step 7: Set up firewall rules
echo -e "\n${YELLOW}Step 7: Configuring firewall...${NC}"
if command_exists ufw; then
    sudo ufw allow 3000/tcp
    echo -e "${GREEN}✓ Firewall rule added for port 3000${NC}"
else
    echo -e "${YELLOW}⚠ UFW not found. Please manually configure your firewall to allow port 3000${NC}"
fi

# Step 8: Set up systemd service
echo -e "\n${YELLOW}Step 8: Setting up systemd service...${NC}"
cat > /tmp/ereader.service << EOF
[Unit]
Description=Personal E-Reader Application
After=network.target

[Service]
Type=simple
User=$CURRENT_USER
WorkingDirectory=$APP_DIR
ExecStart=$(which node) $APP_DIR/server.js
Restart=on-failure
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

sudo mv /tmp/ereader.service /etc/systemd/system/ereader.service
sudo systemctl daemon-reload
sudo systemctl enable ereader.service

# Step 9: Make sync script executable
echo -e "\n${YELLOW}Step 9: Setting up sync script...${NC}"
chmod +x sync-calibre.sh

# Step 10: Get VPS IP address
VPS_IP=$(curl -s ifconfig.me)

# Step 11: Start the application
echo -e "\n${YELLOW}Step 10: Starting the application...${NC}"
sudo systemctl start ereader.service

# Check if service started successfully
sleep 2
if systemctl is-active --quiet ereader.service; then
    echo -e "${GREEN}✓ E-Reader application started successfully!${NC}"
else
    echo -e "${RED}✗ Failed to start the application. Check logs with: sudo journalctl -u ereader.service${NC}"
fi

# Display summary
echo -e "\n${GREEN}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║                  Setup Complete! 🎉                        ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════════════╝${NC}"
echo -e "\n${BLUE}Your e-reader app is now accessible at:${NC}"
echo -e "${YELLOW}  http://$VPS_IP:3000${NC}"
echo -e "\n${BLUE}Next steps:${NC}"
echo -e "1. Edit ${YELLOW}sync-calibre.sh${NC} with your local Calibre library path"
echo -e "2. Run ${YELLOW}./sync-calibre.sh${NC} from your local machine to sync books"
echo -e "3. Access your library from any device at the URL above"
echo -e "\n${BLUE}Useful commands:${NC}"
echo -e "  ${YELLOW}sudo systemctl status ereader.service${NC} - Check app status"
echo -e "  ${YELLOW}sudo systemctl restart ereader.service${NC} - Restart app"
echo -e "  ${YELLOW}sudo journalctl -u ereader.service -f${NC} - View logs"
echo -e "  ${YELLOW}pm2 logs${NC} - View PM2 logs (if using PM2)"

# Create a simple README
cat > README.md << EOF
# Personal E-Reader Application

## Access
Your e-reader is available at: http://$VPS_IP:3000

## Syncing Your Calibre Library
1. Edit \`sync-calibre.sh\` on your local machine
2. Update the following variables:
   - LOCAL_CALIBRE_PATH: Path to your Calibre library
   - VPS_USER: Your VPS username
   - VPS_IP: Your VPS IP address ($VPS_IP)
3. Run \`./sync-calibre.sh\` to sync your books

## Managing the Application
- Start: \`sudo systemctl start ereader.service\`
- Stop: \`sudo systemctl stop ereader.service\`
- Restart: \`sudo systemctl restart ereader.service\`
- Status: \`sudo systemctl status ereader.service\`
- Logs: \`sudo journalctl -u ereader.service -f\`

## Features
- Mobile-responsive design
- PDF and EPUB support
- Fuzzy search
- Reading position memory
- Dark/Sepia/Light themes
- Touch navigation
- Metadata from Calibre

## Troubleshooting
If books don't appear:
1. Check that Calibre library synced: \`ls ~/ereader-app/calibre-library\`
2. Check for metadata.db: \`ls ~/ereader-app/calibre-library/metadata.db\`
3. Restart the service: \`sudo systemctl restart ereader.service\`
4. Check logs: \`sudo journalctl -u ereader.service -n 50\`
EOF

echo -e "\n${GREEN}✓ README.md created with instructions${NC}"
