#!/bin/bash

# Expense Tracker PWA Setup Helper

set -e

echo "🚀 Starting setup for Expense Tracker PWA..."

# 1. Check for Node.js
if ! command -v node &> /dev/null
then
    echo "❌ Node.js is not installed. Please install it first from https://nodejs.org/"
    exit 1
fi

echo "✅ Node.js found: $(node -v)"

# 2. Install dependencies
echo "📦 Installing npm dependencies..."
npm install

# 3. Setup environment file
if [ ! -f .env ]; then
    echo "📄 Creating .env from .env.example..."
    cp .env.example .env
else
    echo "ℹ️  .env file already exists, skipping."
fi

# 4. Success message
echo "------------------------------------------------"
echo "✅ Setup complete!"
echo "------------------------------------------------"
echo "To start the server, run:"
echo "  npm start"
echo ""
echo "Access the app at http://localhost:3000"
echo "------------------------------------------------"
