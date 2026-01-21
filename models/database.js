import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Initialize SQLite database
const db = new Database(join(__dirname, '..', 'expenses.db'));

// Enable foreign keys
db.pragma('foreign_keys = ON');

// Create tables
const initDB = () => {
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
      note TEXT,
      timestamp INTEGER NOT NULL,
      FOREIGN KEY (categoryId) REFERENCES categories(id) ON DELETE CASCADE
    )
  `);

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
};

// Initialize database on import
initDB();

export default db;
