import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';
import https from 'https';
import http from 'http';
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import Expense from './models/Expense.js';
import Category from './models/Category.js';
import User from './models/User.js';
import DatabaseHealth from './models/DatabaseHealth.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

// Custom error classes
class DatabaseCorruptionError extends Error {
    constructor(message) {
        super(message);
        this.name = 'DatabaseCorruptionError';
        this.statusCode = 500;
    }
}

class DatabaseBusyError extends Error {
    constructor(message) {
        super(message);
        this.name = 'DatabaseBusyError';
        this.statusCode = 503;
    }
}

class ConstraintViolationError extends Error {
    constructor(message) {
        super(message);
        this.name = 'ConstraintViolationError';
        this.statusCode = 409;
    }
}

// Error handler helper
const handleDatabaseError = (error, res) => {
    console.error('Database error:', error);

    // Check error type and respond accordingly
    if (error.message.includes('UNIQUE constraint failed')) {
        return res.status(409).json({ 
            error: 'Duplicate entry - resource already exists',
            type: 'ConstraintViolation'
        });
    }

    if (error.message.includes('FOREIGN KEY constraint failed')) {
        return res.status(400).json({ 
            error: 'Invalid reference - related resource not found',
            type: 'ForeignKeyViolation'
        });
    }

    if (error.message.includes('SQLITE_BUSY') || error.message.includes('database is locked')) {
        return res.status(503).json({ 
            error: 'Database is busy, please try again',
            type: 'DatabaseBusy'
        });
    }

    if (error.message.includes('backup') || error.message.includes('corruption')) {
        return res.status(500).json({ 
            error: 'Database backup or integrity issue',
            type: 'DatabaseError'
        });
    }

    // Generic database error
    return res.status(500).json({ 
        error: error.message || 'Database operation failed',
        type: 'DatabaseError'
    });
};

// Middleware
app.use(express.json());

// Serve static files with no-cache for JS/CSS to prevent stale code issues
app.use(express.static(join(__dirname, 'public'), {
    setHeaders: (res, path) => {
        if (path.endsWith('.js') || path.endsWith('.css')) {
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
            res.setHeader('Pragma', 'no-cache');
            res.setHeader('Expires', '0');
        }
    }
}));

// Auth middleware
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
        return res.status(401).json({ error: 'Access token required' });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ error: 'Invalid or expired token' });
        }
        req.user = user; // { userId, username }
        next();
    });
};

// Authentication Routes

// Register new user
app.post('/api/auth/register', async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password required' });
        }

        if (password.length < 6) {
            return res.status(400).json({ error: 'Password must be at least 6 characters' });
        }

        const user = await User.create({ username, password });
        
        // Generate JWT token
        const token = jwt.sign(
            { userId: user.id, username: user.username },
            JWT_SECRET,
            { expiresIn: '30d' }
        );

        res.status(201).json({
            user: {
                id: user.id,
                username: user.username,
                createdAt: user.createdAt
            },
            token
        });
    } catch (error) {
        handleDatabaseError(error, res);
    }
});

// Login
app.post('/api/auth/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password required' });
        }

        const user = await User.validateCredentials(username, password);

        if (!user) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        // Generate JWT token
        const token = jwt.sign(
            { userId: user.id, username: user.username },
            JWT_SECRET,
            { expiresIn: '30d' }
        );

        res.json({
            user: {
                id: user.id,
                username: user.username,
                createdAt: user.createdAt
            },
            token
        });
    } catch (error) {
        handleDatabaseError(error, res);
    }
});

// Verify token and return user data
app.post('/api/auth/verify', authenticateToken, (req, res) => {
    try {
        // Token already verified by authenticateToken middleware
        // req.user contains { userId, username } from the token
        const user = User.getById(req.user.userId);
        
        if (!user) {
            return res.status(401).json({ error: 'User not found' });
        }

        res.json({
            user: {
                id: user.id,
                username: user.username,
                createdAt: user.createdAt
            }
        });
    } catch (error) {
        handleDatabaseError(error, res);
    }
});

// API Routes

// Get all categories
app.get('/api/categories', (req, res) => {
    try {
        const categories = Category.getAll();
        res.json(categories);
    } catch (error) {
        handleDatabaseError(error, res);
    }
});

// Create new category
app.post('/api/categories', (req, res) => {
    try {
        const { name, icon, hexColor } = req.body;

        if (!name || !icon || !hexColor) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const category = Category.create({ name, icon, hexColor });
        res.status(201).json(category);
    } catch (error) {
        handleDatabaseError(error, res);
    }
});

// Get all expenses with optional filters
app.get('/api/expenses', authenticateToken, (req, res) => {
    try {
        const { month, year } = req.query;
        const filters = {};

        if (month) filters.month = parseInt(month);
        if (year) filters.year = parseInt(year);

        const expenses = Expense.getAll(req.user.userId, filters);
        res.json(expenses);
    } catch (error) {
        handleDatabaseError(error, res);
    }
});

// Get single expense
app.get('/api/expenses/:id', authenticateToken, (req, res) => {
    try {
        const expense = Expense.getById(req.params.id, req.user.userId);
        if (!expense) {
            return res.status(404).json({ error: 'Expense not found' });
        }
        res.json(expense);
    } catch (error) {
        handleDatabaseError(error, res);
    }
});

// Create new expense
app.post('/api/expenses', authenticateToken, (req, res) => {
    try {
        const { amount, date, categoryId, whereSpent, note } = req.body;

        // Validation
        if (!amount || !date || !categoryId || !whereSpent) {
            return res.status(400).json({ error: 'Missing required fields: amount, date, categoryId, whereSpent' });
        }

        const expense = Expense.create(req.user.userId, { amount, date, categoryId, whereSpent, note });
        res.status(201).json(expense);
    } catch (error) {
        handleDatabaseError(error, res);
    }
});

// Update expense
app.put('/api/expenses/:id', authenticateToken, (req, res) => {
    try {
        const updates = req.body;
        const expense = Expense.update(req.params.id, req.user.userId, updates);

        if (!expense) {
            return res.status(404).json({ error: 'Expense not found or no valid fields to update' });
        }

        res.json(expense);
    } catch (error) {
        handleDatabaseError(error, res);
    }
});

// Delete expense
app.delete('/api/expenses/:id', authenticateToken, (req, res) => {
    try {
        const deleted = Expense.delete(req.params.id, req.user.userId);

        if (!deleted) {
            return res.status(404).json({ error: 'Expense not found' });
        }

        res.json({ success: true, message: 'Expense deleted' });
    } catch (error) {
        handleDatabaseError(error, res);
    }
});

// Get yearly summary (must be before monthly summary route to avoid conflicts)
app.get('/api/summary/year/:year', authenticateToken, (req, res) => {
    try {
        const year = parseInt(req.params.year);
        const summary = Expense.getYearlySummary(req.user.userId, year);
        res.json(summary);
    } catch (error) {
        handleDatabaseError(error, res);
    }
});

// Get monthly summary
app.get('/api/summary/:year/:month', authenticateToken, (req, res) => {
    try {
        const year = parseInt(req.params.year);
        const month = parseInt(req.params.month);

        const summary = Expense.getMonthlySummary(req.user.userId, year, month);
        res.json(summary);
    } catch (error) {
        handleDatabaseError(error, res);
    }
});

// Database health check endpoint
app.get('/api/health/database', authenticateToken, (req, res) => {
    try {
        const health = DatabaseHealth.checkHealth();
        const stats = DatabaseHealth.getStats();

        res.json({
            health,
            stats,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        handleDatabaseError(error, res);
    }
});

// Manual backup trigger endpoint (for admin use)
app.post('/api/health/backup', authenticateToken, (req, res) => {
    try {
        const result = DatabaseHealth.triggerBackup();
        res.json({
            success: true,
            message: 'Manual backup completed',
            result
        });
    } catch (error) {
        handleDatabaseError(error, res);
    }
});

// Serve index.html for all other routes (SPA)
app.get('*', (req, res) => {
    res.sendFile(join(__dirname, 'public', 'index.html'));
});

// Start server with optional HTTPS
const startServer = () => {
    const sslKeyPath = process.env.SSL_KEY_PATH;
    const sslCertPath = process.env.SSL_CERT_PATH;

    // Check if SSL certificates are provided and exist
    if (sslKeyPath && sslCertPath && fs.existsSync(sslKeyPath) && fs.existsSync(sslCertPath)) {
        const httpsOptions = {
            key: fs.readFileSync(sslKeyPath),
            cert: fs.readFileSync(sslCertPath)
        };

        https.createServer(httpsOptions, app).listen(PORT, '0.0.0.0', () => {
            console.log(`✅ HTTPS Server running on https://0.0.0.0:${PORT}`);
            console.log(`📱 Access from iPhone using: https://<your-mac-ip>:${PORT}`);
        });
    } else {
        http.createServer(app).listen(PORT, '0.0.0.0', () => {
            console.log(`✅ HTTP Server running on http://0.0.0.0:${PORT}`);
            console.log(`📱 Access from iPhone using: http://<your-mac-ip>:${PORT}`);
            console.log(`⚠️  Note: PWA installation requires HTTPS. Add SSL certificates to enable.`);
        });
    }
};

startServer();
