# Personal E-Reader Application

## Access
Your e-reader is available at: http://2a02:4780:2d:2b4c::1:3000

## Syncing Your Calibre Library
1. Edit `sync-calibre.sh` on your local machine
2. Update the following variables:
   - LOCAL_CALIBRE_PATH: Path to your Calibre library
   - VPS_USER: Your VPS username
   - VPS_IP: Your VPS IP address (2a02:4780:2d:2b4c::1)
3. Run `./sync-calibre.sh` to sync your books

## Managing the Application
- Start: `sudo systemctl start ereader.service`
- Stop: `sudo systemctl stop ereader.service`
- Restart: `sudo systemctl restart ereader.service`
- Status: `sudo systemctl status ereader.service`
- Logs: `sudo journalctl -u ereader.service -f`

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
1. Check that Calibre library synced: `ls ~/ereader-app/calibre-library`
2. Check for metadata.db: `ls ~/ereader-app/calibre-library/metadata.db`
3. Restart the service: `sudo systemctl restart ereader.service`
4. Check logs: `sudo journalctl -u ereader.service -n 50`
