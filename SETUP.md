# 🚀 Quick Start Guide

## Prerequisites

You need to install Node.js first. Here's how:

### Install Node.js on Mac

**Option 1: Using Homebrew (Recommended)**
```bash
# Install Homebrew if you don't have it
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Install Node.js
brew install node

# Verify installation
node --version
npm --version
```

**Option 2: Download from nodejs.org**
1. Visit https://nodejs.org/
2. Download the LTS version for macOS
3. Run the installer
4. Verify installation by opening Terminal and running:
   ```bash
   node --version
   npm --version
   ```

## Quick Start with Setup Script

The easiest way to get started is to use the helper script:

```bash
chmod +x setup.sh && ./setup.sh
```

## Manual Setup

1. **Install Node.js** (if not done):
   ```bash
   cd /Users/abhiksen/Documents/git/expense-tracker-pwa
   npm install
   ```

2. **Start the server** (HTTP mode):
   ```bash
   npm start
   ```
   
   The app will be available at `http://0.0.0.0:3000`

3. **Access from iPhone**:
   - Find your Mac's IP: System Preferences → Network
   - On iPhone Safari: `http://<mac-ip>:3000`

## Setting Up HTTPS (for PWA Installation)

1. **Generate SSL certificates**:
   ```bash
   mkdir certs
   cd certs
   openssl req -x509 -newkey rsa:4096 -keyout key.pem -out cert.pem -days 365 -nodes -subj "/CN=localhost"
   cd ..
   ```

2. **Create .env file**:
   ```bash
   cp .env.example .env
   ```

3. **Edit .env** and uncomment/update:
   ```
   PORT=3000
   SSL_KEY_PATH=./certs/key.pem
   SSL_CERT_PATH=./certs/cert.pem
   ```

4. **Restart server**:
   ```bash
   npm start
   ```
   
   Now accessible at `https://0.0.0.0:3000`

5. **Install on iPhone**:
   - Safari: `https://<mac-ip>:3000`
   - Accept certificate warning (tap "Advanced" → "Proceed")
   - Tap Share → "Add to Home Screen"
   - Enjoy! 🎉

## Troubleshooting

### "Cannot connect" from iPhone
- Ensure Mac and iPhone are on the same Wi-Fi
- Check Mac Firewall: System Preferences → Security & Privacy → Firewall
- Temporarily allow incoming connections

### Port already in use
Change the PORT in `.env`:
```
PORT=3001
```

### Database issues
Delete and recreate:
```bash
rm expenses.db
npm start
```

The database will be recreated with default categories.

## Project Status

✅ Backend (Express + SQLite)  
✅ Frontend (HTML/CSS/JS)  
✅ PWA Manifest  
✅ Service Worker  
✅ App Icons  
✅ Dark Mode Design  

**Next Step**: Install Node.js and run `npm install` 🚀
