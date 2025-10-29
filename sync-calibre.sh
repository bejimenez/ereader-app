#!/bin/bash

# Sync Calibre Library to VPS
# Usage: ./sync-calibre.sh

# Configuration - Update these values
LOCAL_CALIBRE_PATH="C:\Users\lucre\Calibre Library"  # Update this to your local Calibre library path
VPS_USER="root"                     # Your VPS username
VPS_IP="72.60.31.136"                # Your VPS IP address
VPS_CALIBRE_PATH="~/ereader-app/calibre-library"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}Starting Calibre Library Sync...${NC}"

# Check if local Calibre library exists
if [ ! -d "$LOCAL_CALIBRE_PATH" ]; then
    echo -e "${RED}Error: Local Calibre library not found at: $LOCAL_CALIBRE_PATH${NC}"
    echo "Please update the LOCAL_CALIBRE_PATH variable in this script"
    exit 1
fi

# Sync the library
echo -e "${YELLOW}Syncing from: $LOCAL_CALIBRE_PATH${NC}"
echo -e "${YELLOW}Syncing to: $VPS_USER@$VPS_IP:$VPS_CALIBRE_PATH${NC}"

rsync -avz --delete \
    --exclude="*.pdf.original_*" \
    --exclude="*.epub.original_*" \
    --exclude="metadata_db_prefs_backup.json" \
    --progress \
    "$LOCAL_CALIBRE_PATH/" \
    "$VPS_USER@$VPS_IP:$VPS_CALIBRE_PATH/"

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Calibre library synced successfully!${NC}"
    
    # Restart the server on VPS to ensure database connection refreshes
    echo -e "${YELLOW}Restarting e-reader application...${NC}"
    ssh "$VPS_USER@$VPS_IP" "cd ~/ereader-app && pm2 restart ereader-app || (npm install -g pm2 && pm2 start server.js --name ereader-app)"
    
    echo -e "${GREEN}✓ E-reader application restarted${NC}"
else
    echo -e "${RED}✗ Sync failed. Please check your connection and credentials.${NC}"
    exit 1
fi

echo -e "${GREEN}Done! You can now access your library at http://$VPS_IP:3000${NC}"
