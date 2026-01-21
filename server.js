import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';
import https from 'https';
import http from 'http';
import dotenv from 'dotenv';
import Expense from './models/Expense.js';
import Category from './models/Category.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static(join(__dirname, 'public')));

// API Routes

// Get all categories
app.get('/api/categories', (req, res) => {
    try {
        const categories = Category.getAll();
        res.json(categories);
    } catch (error) {
        res.status(500).json({ error: error.message });
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
        res.status(500).json({ error: error.message });
    }
});

// Get all expenses with optional filters
app.get('/api/expenses', (req, res) => {
    try {
        const { month, year } = req.query;
        const filters = {};

        if (month) filters.month = parseInt(month);
        if (year) filters.year = parseInt(year);

        const expenses = Expense.getAll(filters);
        res.json(expenses);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get single expense
app.get('/api/expenses/:id', (req, res) => {
    try {
        const expense = Expense.getById(req.params.id);
        if (!expense) {
            return res.status(404).json({ error: 'Expense not found' });
        }
        res.json(expense);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Create new expense
app.post('/api/expenses', (req, res) => {
    try {
        const { amount, date, categoryId, note } = req.body;

        // Validation
        if (!amount || !date || !categoryId) {
            return res.status(400).json({ error: 'Missing required fields: amount, date, categoryId' });
        }

        const expense = Expense.create({ amount, date, categoryId, note });
        res.status(201).json(expense);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Update expense
app.put('/api/expenses/:id', (req, res) => {
    try {
        const updates = req.body;
        const expense = Expense.update(req.params.id, updates);

        if (!expense) {
            return res.status(404).json({ error: 'Expense not found or no valid fields to update' });
        }

        res.json(expense);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Delete expense
app.delete('/api/expenses/:id', (req, res) => {
    try {
        const deleted = Expense.delete(req.params.id);

        if (!deleted) {
            return res.status(404).json({ error: 'Expense not found' });
        }

        res.json({ success: true, message: 'Expense deleted' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get monthly summary
app.get('/api/summary/:year/:month', (req, res) => {
    try {
        const year = parseInt(req.params.year);
        const month = parseInt(req.params.month);

        const summary = Expense.getMonthlySummary(year, month);
        res.json(summary);
    } catch (error) {
        res.status(500).json({ error: error.message });
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
