import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Create backups directory if it doesn't exist
const backupsDir = join(__dirname, '..', 'backups');
if (!fs.existsSync(backupsDir)) {
  fs.mkdirSync(backupsDir, { recursive: true });
}

// Database paths
const mainDbPath = join(__dirname, '..', 'expenses.db');
const backup1Path = join(backupsDir, 'expenses_backup1.db');
const backup2Path = join(backupsDir, 'expenses_backup2.db');

// Initialize SQLite database
const db = new Database(mainDbPath);

// Enable WAL mode for better concurrency
db.pragma('journal_mode = WAL');

// Enable foreign keys
db.pragma('foreign_keys = ON');

// Initialize backup databases
let backup1Db = null;
let backup2Db = null;

try {
  backup1Db = new Database(backup1Path);
  backup1Db.pragma('journal_mode = WAL');
  backup1Db.pragma('foreign_keys = ON');
} catch (error) {
  console.error('Failed to initialize backup1:', error);
}

try {
  backup2Db = new Database(backup2Path);
  backup2Db.pragma('journal_mode = WAL');
  backup2Db.pragma('foreign_keys = ON');
} catch (error) {
  console.error('Failed to initialize backup2:', error);
}

// Backup Manager
class BackupManager {
  static syncToBackups() {
    try {
      if (backup1Db) {
        db.backup(backup1Path);
      }
      if (backup2Db) {
        db.backup(backup2Path);
      }
      return true;
    } catch (error) {
      console.error('Backup sync failed:', error);
      return false;
    }
  }

  static verifyIntegrity(database = db) {
    try {
      const result = database.pragma('integrity_check');
      return result[0].integrity_check === 'ok';
    } catch (error) {
      console.error('Integrity check failed:', error);
      return false;
    }
  }

  static restoreFromBackup(backupNum = 1) {
    try {
      const sourcePath = backupNum === 1 ? backup1Path : backup2Path;

      if (!fs.existsSync(sourcePath)) {
        console.error(`Backup ${backupNum} not found`);
        return false;
      }

      // Verify backup integrity before restore
      const backupDb = new Database(sourcePath);
      const isValid = this.verifyIntegrity(backupDb);
      backupDb.close();

      if (!isValid) {
        console.error(`Backup ${backupNum} is corrupted`);
        return false;
      }

      // Close main database
      db.close();

      // Copy backup to main
      fs.copyFileSync(sourcePath, mainDbPath);

      console.log(`✅ Restored from backup ${backupNum}`);
      return true;
    } catch (error) {
      console.error('Restore failed:', error);
      return false;
    }
  }
}

// Create tables
const initDB = () => {
  // Users table - must be created before expenses
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      passwordHash TEXT NOT NULL,
      salt TEXT NOT NULL,
      createdAt TEXT NOT NULL
    )
  `);

  // Categories table
  db.exec(`
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      icon TEXT NOT NULL,
      hexColor TEXT NOT NULL
    )
  `);

  // Expenses table
  db.exec(`
    CREATE TABLE IF NOT EXISTS expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      amount REAL NOT NULL,
      date TEXT NOT NULL,
      categoryId INTEGER NOT NULL,
      userId INTEGER NOT NULL,
      note TEXT,
      whereSpent TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      FOREIGN KEY (categoryId) REFERENCES categories(id) ON DELETE CASCADE,
      FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // Income Categories table
  db.exec(`
    CREATE TABLE IF NOT EXISTS income_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      icon TEXT NOT NULL,
      hexColor TEXT NOT NULL
    )
  `);

  // Accounts table
  db.exec(`
    CREATE TABLE IF NOT EXISTS accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      userId INTEGER NOT NULL,
      icon TEXT NOT NULL,
      hexColor TEXT NOT NULL,
      isDefault INTEGER DEFAULT 0,
      UNIQUE(name, userId),
      FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // Incomes table
  db.exec(`
    CREATE TABLE IF NOT EXISTS incomes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      amount REAL NOT NULL,
      date TEXT NOT NULL,
      categoryId INTEGER NOT NULL,
      userId INTEGER NOT NULL,
      accountId INTEGER,
      note TEXT,
      source TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      FOREIGN KEY (categoryId) REFERENCES income_categories(id) ON DELETE CASCADE,
      FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (accountId) REFERENCES accounts(id) ON DELETE SET NULL
    )
  `);

  // Migration: Add whereSpent column if it doesn't exist
  try {
    // Migrate main database
    const tableInfo = db.prepare("PRAGMA table_info(expenses)").all();
    const hasWhereSpent = tableInfo.some(col => col.name === 'whereSpent');

    if (!hasWhereSpent) {
      console.log('📦 Migrating main database: Adding whereSpent column...');
      db.prepare('ALTER TABLE expenses ADD COLUMN whereSpent TEXT DEFAULT ""').run();
      console.log('✅ Main database migration completed (whereSpent)');
    }

    const hasUserId = tableInfo.some(col => col.name === 'userId');
    if (!hasUserId) {
      console.log('📦 Migrating main database: Adding userId column...');
      // Default to user ID 1 for existing data
      db.prepare('ALTER TABLE expenses ADD COLUMN userId INTEGER NOT NULL DEFAULT 1').run();
      console.log('✅ Main database migration completed (userId)');
    }

    const hasAccountId = tableInfo.some(col => col.name === 'accountId');
    if (!hasAccountId) {
      console.log('📦 Migrating main database: Adding accountId column to expenses...');
      db.prepare('ALTER TABLE expenses ADD COLUMN accountId INTEGER').run();
      console.log('✅ Main database migration completed (accountId)');
    }

    // Migrate backup databases
    if (backup1Db) {
      // Check if table exists first
      const tableExists = backup1Db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='expenses'").get();

      if (tableExists) {
        const backup1Info = backup1Db.prepare("PRAGMA table_info(expenses)").all();
        const backup1HasWhereSpent = backup1Info.some(col => col.name === 'whereSpent');
        if (!backup1HasWhereSpent) {
          console.log('📦 Migrating backup1 database: Adding whereSpent column...');
          backup1Db.prepare('ALTER TABLE expenses ADD COLUMN whereSpent TEXT DEFAULT ""').run();
          console.log('✅ Backup1 migration completed (whereSpent)');
        }

        const backup1HasUserId = backup1Info.some(col => col.name === 'userId');
        if (!backup1HasUserId) {
          console.log('📦 Migrating backup1 database: Adding userId column...');
          backup1Db.prepare('ALTER TABLE expenses ADD COLUMN userId INTEGER NOT NULL DEFAULT 1').run();
          console.log('✅ Backup1 migration completed (userId)');
        }
      }
    }

    if (backup2Db) {
      // Check if table exists first
      const tableExists = backup2Db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='expenses'").get();

      if (tableExists) {
        const backup2Info = backup2Db.prepare("PRAGMA table_info(expenses)").all();
        const backup2HasWhereSpent = backup2Info.some(col => col.name === 'whereSpent');
        if (!backup2HasWhereSpent) {
          console.log('📦 Migrating backup2 database: Adding whereSpent column...');
          backup2Db.prepare('ALTER TABLE expenses ADD COLUMN whereSpent TEXT DEFAULT ""').run();
          console.log('✅ Backup2 migration completed (whereSpent)');
        }

        const backup2HasUserId = backup2Info.some(col => col.name === 'userId');
        if (!backup2HasUserId) {
          console.log('📦 Migrating backup2 database: Adding userId column...');
          backup2Db.prepare('ALTER TABLE expenses ADD COLUMN userId INTEGER NOT NULL DEFAULT 1').run();
          console.log('✅ Backup2 migration completed (userId)');
        }
      }
    }

    // Migrate incomes table
    const incomesTableInfo = db.prepare("PRAGMA table_info(incomes)").all();
    const incomesHasAccountId = incomesTableInfo.some(col => col.name === 'accountId');
    if (!incomesHasAccountId) {
      console.log('📦 Migrating main database: Adding accountId column to incomes...');
      db.prepare('ALTER TABLE incomes ADD COLUMN accountId INTEGER').run();
      console.log('✅ Main database migration completed (incomes accountId)');
    }
  } catch (error) {
    console.error('Migration error:', error);
  }

  // Initialize default accounts and link to user abhiknes
  try {
    const abhiknesUser = db.prepare("SELECT id FROM users WHERE username = 'abhiknes'").get();
    if (abhiknesUser) {
      const accountsCount = db.prepare('SELECT COUNT(*) as count FROM accounts WHERE userId = ?').get(abhiknesUser.id);
      
      if (accountsCount.count === 0) {
        console.log('📦 Creating default account for abhiknes...');
        const insertAccount = db.prepare(`
          INSERT INTO accounts (name, type, userId, icon, hexColor, isDefault)
          VALUES (?, ?, ?, ?, ?, ?)
        `);
        const result = insertAccount.run('HDFC 1372', 'Savings Account', abhiknesUser.id, '🏦', '#004C8F', 1);
        const defaultAccountId = result.lastInsertRowid;
        
        // Update all existing expenses for abhiknes to use this account
        const updateExpenses = db.prepare('UPDATE expenses SET accountId = ? WHERE userId = ? AND accountId IS NULL');
        const expensesUpdated = updateExpenses.run(defaultAccountId, abhiknesUser.id);
        console.log(`✅ Updated ${expensesUpdated.changes} existing expenses with default account`);
        
        // Update all existing incomes for abhiknes to use this account
        const updateIncomes = db.prepare('UPDATE incomes SET accountId = ? WHERE userId = ? AND accountId IS NULL');
        const incomesUpdated = updateIncomes.run(defaultAccountId, abhiknesUser.id);
        console.log(`✅ Updated ${incomesUpdated.changes} existing incomes with default account`);
      }
    }
  } catch (error) {
    console.error('Error setting up default accounts:', error);
  }

  // Insert default categories if table is empty
  const categoryCount = db.prepare('SELECT COUNT(*) as count FROM categories').get();

  if (categoryCount.count === 0) {
    const insertCategory = db.prepare(
      'INSERT INTO categories (name, icon, hexColor) VALUES (?, ?, ?)'
    );

    const defaultCategories = [
      { name: 'Food & Dining', icon: '🍽️', hexColor: '#FF6B6B' },
      { name: 'Transportation', icon: '🚗', hexColor: '#4ECDC4' },
      { name: 'Shopping', icon: '🛍️', hexColor: '#FFE66D' },
      { name: 'Entertainment', icon: '🎬', hexColor: '#A8E6CF' },
      { name: 'Bills & Utilities', icon: '💡', hexColor: '#C7CEEA' },
      { name: 'Health', icon: '⚕️', hexColor: '#FF8B94' },
      { name: 'Travel', icon: '✈️', hexColor: '#95E1D3' },
      { name: 'Other', icon: '📌', hexColor: '#D4AF37' }
    ];

    const insertMany = db.transaction((categories) => {
      for (const cat of categories) {
        insertCategory.run(cat.name, cat.icon, cat.hexColor);
      }
    });

    insertMany(defaultCategories);
  }

  // Insert default income categories if table is empty
  const incomeCategoryCount = db.prepare('SELECT COUNT(*) as count FROM income_categories').get();

  if (incomeCategoryCount.count === 0) {
    const insertIncomeCategory = db.prepare(
      'INSERT INTO income_categories (name, icon, hexColor) VALUES (?, ?, ?)'
    );

    const defaultIncomeCategories = [
      { name: 'Salary', icon: '💼', hexColor: '#4CAF50' },
      { name: 'Freelance', icon: '💻', hexColor: '#8BC34A' },
      { name: 'Investment', icon: '📈', hexColor: '#00BCD4' },
      { name: 'Gift', icon: '🎁', hexColor: '#E91E63' },
      { name: 'Refund', icon: '↩️', hexColor: '#9C27B0' },
      { name: 'Other Income', icon: '💰', hexColor: '#FF9800' }
    ];

    const insertManyIncome = db.transaction((categories) => {
      for (const cat of categories) {
        insertIncomeCategory.run(cat.name, cat.icon, cat.hexColor);
      }
    });

    insertManyIncome(defaultIncomeCategories);
  }
};

// Startup integrity check and recovery
const performStartupCheck = () => {
  console.log('🔍 Performing database integrity check...');

  if (BackupManager.verifyIntegrity()) {
    console.log('✅ Main database integrity OK');
    // Create initial backups if they don't exist
    BackupManager.syncToBackups();
    return true;
  }

  console.error('❌ Main database corrupted! Attempting recovery...');

  // Try restoring from backup1
  if (BackupManager.restoreFromBackup(1)) {
    console.log('✅ Restored from backup1');
    return true;
  }

  // Try restoring from backup2
  if (BackupManager.restoreFromBackup(2)) {
    console.log('✅ Restored from backup2');
    return true;
  }

  console.error('❌ All backups failed. Database cannot be recovered.');
  return false;
};

// Initialize database on import
initDB();

// Perform startup check
performStartupCheck();

export { BackupManager, backup1Db, backup2Db };
export default db;
