# 💰 Expense Tracker PWA

An elegant, lightweight, and high-performance expense management Progressive Web App designed for single-user local hosting on Mac Mini.

## ✨ Features

- **🌑 Elegant Dark Mode**: Deep charcoal background with gold/champagne accents
- **📱 Mobile-First Design**: Optimized for iPhone with smooth CSS transitions
- **⚡ Lightning Fast**: Vanilla JavaScript, no heavy frameworks
- **💾 Local SQLite Database**: Fast and reliable data storage
- **📊 Analytics Dashboard**: Visual category breakdown and monthly summaries
- **🔒 HTTPS Ready**: Designed for secure PWA installation on iOS
- **📴 Offline Capable**: Service Worker caching for instant loading

## 🚀 Tech Stack

- **Backend**: Node.js + Express
- **Database**: SQLite with better-sqlite3
- **Frontend**: Pure HTML5, CSS Variables, Vanilla JavaScript
- **PWA**: Service Worker + Manifest

## 📦 Installation

1. **Run the setup script**:
   ```bash
   chmod +x setup.sh && ./setup.sh
   ```

2. **Alternatively, manually install dependencies**:
   ```bash
   npm install
   ```

2. **Configure environment** (optional):
   ```bash
   cp .env.example .env
   ```
   
   Edit `.env` to configure:
   - `PORT` (default: 3000)
   - `SSL_KEY_PATH` and `SSL_CERT_PATH` for HTTPS

3. **Start the server**:
   ```bash
   npm start
   ```

The app will be accessible at:
- HTTP: `http://0.0.0.0:3000`
- HTTPS: `https://0.0.0.0:3000` (if SSL configured)

## 🌐 Access from iPhone

1. **Find Your Mac's IP Address**:
   - Go to System Preferences → Network
   - Note your local IP (e.g., 192.168.1.100)

2. **Access from iPhone**:
   - Open Safari
   - Navigate to `https://<your-mac-ip>:3000`
   - For HTTPS: Tap "Advanced" → "Proceed" to accept self-signed certificate

3. **Install as PWA**:
   - Tap the Share button
   - Select "Add to Home Screen"
   - Enjoy the native app experience!

## 🔐 HTTPS Setup (Required for iOS PWA)

To install as a PWA on iOS, you need HTTPS. Generate a self-signed certificate:

```bash
mkdir certs
openssl req -x509 -newkey rsa:4096 -keyout certs/key.pem -out certs/cert.pem -days 365 -nodes
```

Then update `.env`:
```
SSL_KEY_PATH=./certs/key.pem
SSL_CERT_PATH=./certs/cert.pem
```

## 📁 Project Structure

```
expense-tracker-pwa/
├── models/
│   ├── database.js      # SQLite initialization
│   ├── Expense.js       # Expense model & operations
│   └── Category.js      # Category model & operations
├── public/
│   ├── index.html       # Main HTML
│   ├── style.css        # Elegant dark mode styles
│   ├── app.js           # Vanilla JavaScript app logic
│   ├── manifest.json    # PWA manifest
│   ├── sw.js            # Service Worker
│   ├── icon-192.png     # App icon (192x192)
│   └── icon-512.png     # App icon (512x512)
├── server.js            # Express server
├── package.json         # Dependencies
└── .env.example         # Environment template
```

## 🎨 Design Features

- **Color Palette**:
  - Background: Deep Charcoal (#121212)
  - Accents: Gold/Champagne (#D4AF37)
  - Text: Soft Gray (#E0E0E0, #A0A0A0)

- **Typography**: System fonts with elegant spacing
- **Animations**: Smooth CSS transitions and micro-interactions
- **Layout**: Mobile-first with responsive breakpoints

## 🔌 API Endpoints

### Expenses
- `GET /api/expenses?month={m}&year={y}` - Get expenses with filters
- `GET /api/expenses/:id` - Get single expense
- `POST /api/expenses` - Create expense
- `PUT /api/expenses/:id` - Update expense
- `DELETE /api/expenses/:id` - Delete expense
- `GET /api/summary/:year/:month` - Get monthly summary

### Categories
- `GET /api/categories` - Get all categories

## 📊 Database Schema

### Expenses Table
```sql
{
  id: INTEGER PRIMARY KEY,
  amount: REAL,
  date: TEXT,
  categoryId: INTEGER,
  note: TEXT,
  timestamp: INTEGER
}
```

### Categories Table
```sql
{
  id: INTEGER PRIMARY KEY,
  name: TEXT,
  icon: TEXT,
  hexColor: TEXT
}
```

## 🎯 Default Categories

The app comes with 8 pre-configured categories:
- 🍽️ Food & Dining
- 🚗 Transportation
- 🛍️ Shopping
- 🎬 Entertainment
- 💡 Bills & Utilities
- ⚕️ Health
- ✈️ Travel
- 📌 Other

## 🛠️ Development

The app uses ES modules (`"type": "module"` in package.json). All JavaScript files use `import/export` syntax.

To run in development:
```bash
npm run dev
```

## 🔧 Troubleshooting

**Cannot access from iPhone:**
- Ensure Mac and iPhone are on the same Wi-Fi network
- Check Mac firewall settings (System Preferences → Security & Privacy → Firewall)
- Try disabling "Block all incoming connections" temporarily

**PWA won't install on iOS:**
- HTTPS is required - set up SSL certificates
- Ensure manifest.json is accessible
- Check that service worker is registered (check browser console)

**Database errors:**
- Delete `expenses.db` to reset the database
- Check file permissions in the project directory

## 📝 License

MIT

## 🙏 Credits

Built with ❤️ using vanilla web technologies for maximum performance and elegance.