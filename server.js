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
import Income from './models/Income.js';
import IncomeCategory from './models/IncomeCategory.js';
import Account from './models/Account.js';
import User from './models/User.js';
import DatabaseHealth from './models/DatabaseHealth.js';
import Investment from './models/Investment.js';
import FixedDeposit from './models/FixedDeposit.js';
import PFEntry from './models/PFEntry.js';

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

// Set or update PIN for authenticated user
app.post('/api/auth/pin', authenticateToken, async (req, res) => {
    try {
        const { password, pin } = req.body;
        
        // Validate inputs
        if (!password || !pin) {
            return res.status(400).json({ error: 'Password and PIN are required' });
        }
        
        // Validate PIN format (4-6 digits)
        if (!/^\d{4,6}$/.test(pin)) {
            return res.status(400).json({ error: 'PIN must be 4-6 digits' });
        }
        
        // Get user and verify password
        const user = User.getById(req.user.userId);
        if (!user) {
            return res.status(401).json({ error: 'User not found' });
        }
        
        const fullUser = User.getByUsername(user.username);
        const isPasswordValid = await User.verifyPassword(password, fullUser.passwordHash, fullUser.salt);
        
        if (!isPasswordValid) {
            return res.status(401).json({ error: 'Invalid password' });
        }
        
        // Set the PIN
        await User.setPin(req.user.userId, pin);
        
        res.json({ success: true, message: 'PIN set successfully' });
    } catch (error) {
        handleDatabaseError(error, res);
    }
});

// Verify PIN for authenticated user
app.post('/api/auth/verify-pin', authenticateToken, async (req, res) => {
    try {
        const { pin } = req.body;
        
        if (!pin) {
            return res.status(400).json({ error: 'PIN is required' });
        }
        
        const isValid = await User.verifyPin(req.user.userId, pin);
        
        res.json({ valid: isValid });
    } catch (error) {
        handleDatabaseError(error, res);
    }
});

// Check if user has PIN set
app.get('/api/auth/has-pin', authenticateToken, (req, res) => {
    try {
        const hasPin = User.hasPin(req.user.userId);
        res.json({ hasPin });
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

// ===== Income Routes =====

// Get all incomes
app.get('/api/incomes', authenticateToken, (req, res) => {
    try {
        const filters = {};
        const { month, year } = req.query;
        if (month) filters.month = parseInt(month);
        if (year) filters.year = parseInt(year);

        const incomes = Income.getAll(req.user.userId, filters);
        res.json(incomes);
    } catch (error) {
        handleDatabaseError(error, res);
    }
});

// Get single income
app.get('/api/incomes/:id', authenticateToken, (req, res) => {
    try {
        const income = Income.getById(req.params.id, req.user.userId);
        if (!income) {
            return res.status(404).json({ error: 'Income not found' });
        }
        res.json(income);
    } catch (error) {
        handleDatabaseError(error, res);
    }
});

// Create new income
app.post('/api/incomes', authenticateToken, (req, res) => {
    try {
        const { amount, date, categoryId, source, note } = req.body;

        // Validation
        if (!amount || !date || !categoryId || !source) {
            return res.status(400).json({ error: 'Missing required fields: amount, date, categoryId, source' });
        }

        const income = Income.create(req.user.userId, { amount, date, categoryId, source, note });
        res.status(201).json(income);
    } catch (error) {
        handleDatabaseError(error, res);
    }
});

// Update income
app.put('/api/incomes/:id', authenticateToken, (req, res) => {
    try {
        const updates = req.body;
        const income = Income.update(req.params.id, req.user.userId, updates);

        if (!income) {
            return res.status(404).json({ error: 'Income not found or no valid fields to update' });
        }

        res.json(income);
    } catch (error) {
        handleDatabaseError(error, res);
    }
});

// Delete income
app.delete('/api/incomes/:id', authenticateToken, (req, res) => {
    try {
        const deleted = Income.delete(req.params.id, req.user.userId);

        if (!deleted) {
            return res.status(404).json({ error: 'Income not found' });
        }

        res.json({ success: true, message: 'Income deleted' });
    } catch (error) {
        handleDatabaseError(error, res);
    }
});

// Get income categories
app.get('/api/income-categories', authenticateToken, (req, res) => {
    try {
        const categories = IncomeCategory.getAll();
        res.json(categories);
    } catch (error) {
        handleDatabaseError(error, res);
    }
});

// Create income category
app.post('/api/income-categories', authenticateToken, (req, res) => {
    try {
        const { name, icon, hexColor } = req.body;

        if (!name || !icon || !hexColor) {
            return res.status(400).json({ error: 'Missing required fields: name, icon, hexColor' });
        }

        const category = IncomeCategory.create({ name, icon, hexColor });
        res.status(201).json(category);
    } catch (error) {
        handleDatabaseError(error, res);
    }
});

// Get yearly income summary
app.get('/api/income-summary/year/:year', authenticateToken, (req, res) => {
    try {
        const year = parseInt(req.params.year);
        const summary = Income.getYearlySummary(req.user.userId, year);
        res.json(summary);
    } catch (error) {
        handleDatabaseError(error, res);
    }
});

// Get monthly income summary
app.get('/api/income-summary/:year/:month', authenticateToken, (req, res) => {
    try {
        const year = parseInt(req.params.year);
        const month = parseInt(req.params.month);

        const summary = Income.getMonthlySummary(req.user.userId, year, month);
        res.json(summary);
    } catch (error) {
        handleDatabaseError(error, res);
    }
});

// ===== Account Routes =====

// Get all accounts for user
app.get('/api/accounts', authenticateToken, (req, res) => {
    try {
        const accounts = Account.getAll(req.user.userId);
        res.json(accounts);
    } catch (error) {
        handleDatabaseError(error, res);
    }
});

// Get account types
app.get('/api/accounts/types', authenticateToken, (req, res) => {
    try {
        const types = Account.getAccountTypes();
        res.json(types);
    } catch (error) {
        handleDatabaseError(error, res);
    }
});

// Get default account
app.get('/api/accounts/default', authenticateToken, (req, res) => {
    try {
        const account = Account.getDefaultAccount(req.user.userId);
        res.json(account);
    } catch (error) {
        handleDatabaseError(error, res);
    }
});

// Create new account
app.post('/api/accounts', authenticateToken, (req, res) => {
    try {
        const { name, type, icon, hexColor, isDefault } = req.body;

        if (!name || !type || !icon || !hexColor) {
            return res.status(400).json({ error: 'Missing required fields: name, type, icon, hexColor' });
        }

        const account = Account.create(req.user.userId, { name, type, icon, hexColor, isDefault });
        res.status(201).json(account);
    } catch (error) {
        handleDatabaseError(error, res);
    }
});

// Update account
app.put('/api/accounts/:id', authenticateToken, (req, res) => {
    try {
        const updates = req.body;
        const account = Account.update(req.params.id, req.user.userId, updates);

        if (!account) {
            return res.status(404).json({ error: 'Account not found or no valid fields to update' });
        }

        res.json(account);
    } catch (error) {
        handleDatabaseError(error, res);
    }
});

// Delete account
app.delete('/api/accounts/:id', authenticateToken, (req, res) => {
    try {
        const deleted = Account.delete(req.params.id, req.user.userId);

        if (!deleted) {
            return res.status(404).json({ error: 'Account not found' });
        }

        res.json({ success: true, message: 'Account deleted' });
    } catch (error) {
        handleDatabaseError(error, res);
    }
});

// ===== PF (Provident Fund) Routes =====

app.get('/api/pf', authenticateToken, (req, res) => {
    try {
        const { type, financialYear } = req.query;
        const filters = {};
        if (type) filters.type = type;
        if (financialYear) filters.financialYear = financialYear;

        const entries = PFEntry.getAll(req.user.userId, filters);
        const summary = PFEntry.getSummary(req.user.userId);
        const years = PFEntry.getFinancialYears(req.user.userId);

        res.json({
            entries,
            summary,
            financialYears: years
        });
    } catch (error) {
        handleDatabaseError(error, res);
    }
});

app.post('/api/pf', authenticateToken, (req, res) => {
    try {
        const { type, amount, date, financialYear, note } = req.body;
        
        if (!type || !amount || !date) {
            return res.status(400).json({ error: 'type, amount, and date are required' });
        }

        if (type === 'interest' && !financialYear) {
            return res.status(400).json({ error: 'financialYear is required for interest entries' });
        }

        const entry = PFEntry.create(req.user.userId, {
            type,
            amount: parseFloat(amount),
            date,
            financialYear,
            note
        });

        res.json(entry);
    } catch (error) {
        handleDatabaseError(error, res);
    }
});

app.delete('/api/pf/:id', authenticateToken, (req, res) => {
    try {
        const success = PFEntry.delete(parseInt(req.params.id), req.user.userId);
        if (success) {
            res.json({ success: true, message: 'PF entry deleted' });
        } else {
            res.status(404).json({ error: 'PF entry not found' });
        }
    } catch (error) {
        handleDatabaseError(error, res);
    }
});

// ===== Database Health Routes =====

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

// ===== Investment Routes =====

// Cache for Alpha Vantage API responses (60 second TTL)
const apiCache = new Map();
const CACHE_TTL = 60000; // 60 seconds

// Helper function to fetch with caching
async function fetchWithCache(url, cacheKey) {
    const cached = apiCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        return cached.data;
    }

    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`API request failed: ${response.statusText}`);
    }
    
    const data = await response.json();
    apiCache.set(cacheKey, { data, timestamp: Date.now() });
    
    return data;
}

// Get all investments for user
app.get('/api/investments', authenticateToken, (req, res) => {
    try {
        const investments = Investment.getAll(req.user.userId);
        res.json(investments);
    } catch (error) {
        handleDatabaseError(error, res);
    }
});

// Create or update an investment
app.post('/api/investments', authenticateToken, (req, res) => {
    try {
        const { ticker, shares_owned, manual_price_override, manual_rate_override } = req.body;

        if (!ticker || shares_owned === undefined || shares_owned === null) {
            return res.status(400).json({ error: 'Ticker and shares_owned are required' });
        }

        const investment = Investment.upsert(req.user.userId, {
            ticker,
            shares_owned: parseFloat(shares_owned),
            manual_price_override: manual_price_override ? parseFloat(manual_price_override) : null,
            manual_rate_override: manual_rate_override ? parseFloat(manual_rate_override) : null
        });

        res.json(investment);
    } catch (error) {
        handleDatabaseError(error, res);
    }
});

// Delete an investment
app.delete('/api/investments/:ticker', authenticateToken, (req, res) => {
    try {
        const { ticker } = req.params;
        const success = Investment.delete(req.user.userId, ticker);

        if (success) {
            res.json({ success: true, message: 'Investment deleted' });
        } else {
            res.status(404).json({ error: 'Investment not found' });
        }
    } catch (error) {
        handleDatabaseError(error, res);
    }
});

// Calculate investment portfolio value
app.get('/api/investments/calculate', authenticateToken, async (req, res) => {
    try {
        const investments = Investment.getAll(req.user.userId);

        if (investments.length === 0) {
            return res.json({
                holdings: [],
                totalINR: 0,
                exchangeRate: null,
                timestamp: new Date().toISOString()
            });
        }

        const apiKey = process.env.ALPHA_VANTAGE_KEY;
        if (!apiKey) {
            return res.status(500).json({ error: 'ALPHA_VANTAGE_KEY not configured' });
        }

        // Helper to delay between API calls
        const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

        // Fetch exchange rate (USD to INR)
        let exchangeRate = null;
        const rateOverride = investments.find(inv => inv.manual_rate_override);
        
        if (rateOverride && rateOverride.manual_rate_override) {
            exchangeRate = rateOverride.manual_rate_override;
        } else {
            try {
                const rateUrl = `https://www.alphavantage.co/query?function=CURRENCY_EXCHANGE_RATE&from_currency=USD&to_currency=INR&apikey=${apiKey}`;
                const rateData = await fetchWithCache(rateUrl, 'USD_INR');
                
                if (rateData['Realtime Currency Exchange Rate']) {
                    exchangeRate = parseFloat(rateData['Realtime Currency Exchange Rate']['5. Exchange Rate']);
                } else {
                    throw new Error('Failed to fetch exchange rate');
                }
                
                // Wait 2 seconds before next API call
                await delay(2000);
            } catch (error) {
                console.error('Exchange rate fetch error:', error);
                return res.status(500).json({ error: 'Failed to fetch USD/INR exchange rate. Try setting manual_rate_override.' });
            }
        }

        // Fetch stock prices sequentially with delays to avoid rate limiting
        const holdings = [];
        for (const investment of investments) {
            let stockPrice = investment.manual_price_override;

            if (!stockPrice) {
                try {
                    const quoteUrl = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${investment.ticker}&apikey=${apiKey}`;
                    const quoteData = await fetchWithCache(quoteUrl, investment.ticker);
                    
                    console.log(`API Response for ${investment.ticker}:`, JSON.stringify(quoteData));
                    
                    if (quoteData['Global Quote'] && quoteData['Global Quote']['05. price']) {
                        stockPrice = parseFloat(quoteData['Global Quote']['05. price']);
                    } else if (quoteData['Note']) {
                        // API rate limit exceeded
                        holdings.push({
                            ticker: investment.ticker,
                            shares: investment.shares_owned,
                            priceUSD: null,
                            valueUSD: null,
                            valueINR: null,
                            error: 'API rate limit exceeded. Please wait a moment or set manual_price_override.'
                        });
                        continue;
                    } else if (quoteData['Information']) {
                        // API information message
                        holdings.push({
                            ticker: investment.ticker,
                            shares: investment.shares_owned,
                            priceUSD: null,
                            valueUSD: null,
                            valueINR: null,
                            error: 'API message: ' + quoteData['Information']
                        });
                        continue;
                    } else {
                        console.error(`Unexpected API response structure for ${investment.ticker}:`, quoteData);
                        throw new Error('Failed to fetch stock price');
                    }
                    
                    // Wait 2 seconds before next API call (if not last investment)
                    if (investments.indexOf(investment) < investments.length - 1) {
                        await delay(2000);
                    }
                } catch (error) {
                    console.error(`Stock price fetch error for ${investment.ticker}:`, error);
                    holdings.push({
                        ticker: investment.ticker,
                        shares: investment.shares_owned,
                        priceUSD: null,
                        valueUSD: null,
                        valueINR: null,
                        error: 'Failed to fetch price. Set manual_price_override.'
                    });
                    continue;
                }
            }

            const valueUSD = investment.shares_owned * stockPrice;
            const valueINR = valueUSD * exchangeRate;

            holdings.push({
                ticker: investment.ticker,
                shares: investment.shares_owned,
                priceUSD: stockPrice,
                valueUSD: valueUSD,
                valueINR: valueINR,
                manualPrice: !!investment.manual_price_override,
                manualRate: !!investment.manual_rate_override
            });
        }

        const totalINR = holdings.reduce((sum, h) => sum + (h.valueINR || 0), 0);

        res.json({
            holdings,
            totalINR,
            exchangeRate,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('Calculate error:', error);
        handleDatabaseError(error, res);
    }
});

// ===== Fixed Deposit Routes =====

app.get('/api/fixed-deposits', authenticateToken, (req, res) => {
    try {
        const deposits = FixedDeposit.getAll(req.user.userId);
        const depositsWithValues = deposits.map(fd => ({
            ...fd,
            currentValue: FixedDeposit.calculateCurrentValue(fd),
            maturityValue: FixedDeposit.calculateMaturityValue(fd)
        }));
        res.json(depositsWithValues);
    } catch (error) {
        handleDatabaseError(error, res);
    }
});

app.post('/api/fixed-deposits', authenticateToken, (req, res) => {
    try {
        const { bankName, principal, rateOfInterest, startDate, maturityDate, note } = req.body;
        if (!bankName || !principal || !rateOfInterest || !startDate || !maturityDate) {
            return res.status(400).json({ error: 'bankName, principal, rateOfInterest, startDate, and maturityDate are required' });
        }
        const deposit = FixedDeposit.create(req.user.userId, {
            bankName,
            principal: parseFloat(principal),
            rateOfInterest: parseFloat(rateOfInterest),
            startDate,
            maturityDate,
            note
        });
        res.json({
            ...deposit,
            currentValue: FixedDeposit.calculateCurrentValue(deposit),
            maturityValue: FixedDeposit.calculateMaturityValue(deposit)
        });
    } catch (error) {
        handleDatabaseError(error, res);
    }
});

app.put('/api/fixed-deposits/:id', authenticateToken, (req, res) => {
    try {
        const { bankName, principal, rateOfInterest, startDate, maturityDate, note } = req.body;
        const deposit = FixedDeposit.update(parseInt(req.params.id), req.user.userId, {
            bankName,
            principal: parseFloat(principal),
            rateOfInterest: parseFloat(rateOfInterest),
            startDate,
            maturityDate,
            note
        });
        if (deposit) {
            res.json({
                ...deposit,
                currentValue: FixedDeposit.calculateCurrentValue(deposit),
                maturityValue: FixedDeposit.calculateMaturityValue(deposit)
            });
        } else {
            res.status(404).json({ error: 'Fixed deposit not found' });
        }
    } catch (error) {
        handleDatabaseError(error, res);
    }
});

app.delete('/api/fixed-deposits/:id', authenticateToken, (req, res) => {
    try {
        const success = FixedDeposit.delete(parseInt(req.params.id), req.user.userId);
        if (success) {
            res.json({ success: true, message: 'Fixed deposit deleted' });
        } else {
            res.status(404).json({ error: 'Fixed deposit not found' });
        }
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
