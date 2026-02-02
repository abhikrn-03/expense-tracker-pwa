import db, { BackupManager, backup1Db, backup2Db } from './database.js';
import crypto from 'crypto';
import { promisify } from 'util';

const scrypt = promisify(crypto.scrypt);

// Users table is created in database.js

class User {
  /**
   * Hash a password using scrypt
   */
  static async hashPassword(password) {
    const salt = crypto.randomBytes(16).toString('hex');
    const derivedKey = await scrypt(password, salt, 64);
    return {
      hash: derivedKey.toString('hex'),
      salt
    };
  }

  /**
   * Verify a password against a hash
   */
  static async verifyPassword(password, hash, salt) {
    const derivedKey = await scrypt(password, salt, 64);
    return derivedKey.toString('hex') === hash;
  }

  /**
   * Create a new user (with IMMEDIATE transaction to prevent race conditions)
   */
  static async create({ username, password }) {
    // Hash password first (outside transaction)
    const { hash, salt } = await this.hashPassword(password);
    const createdAt = new Date().toISOString();
    
    // Use IMMEDIATE transaction to prevent race conditions
    const createUser = db.transaction(() => {
      // Check if username exists within transaction
      const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
      if (existing) {
        throw new Error('Username already exists');
      }

      // Insert user in main db
      const stmt = db.prepare(`
        INSERT INTO users (username, passwordHash, salt, createdAt)
        VALUES (?, ?, ?, ?)
      `);
      const result = stmt.run(username, hash, salt, createdAt);
      
      // Sync to backup databases
      try {
        if (backup1Db) {
          backup1Db.prepare(`
            INSERT OR REPLACE INTO users (id, username, passwordHash, salt, createdAt)
            VALUES (?, ?, ?, ?, ?)
          `).run(result.lastInsertRowid, username, hash, salt, createdAt);
        }
        if (backup2Db) {
          backup2Db.prepare(`
            INSERT OR REPLACE INTO users (id, username, passwordHash, salt, createdAt)
            VALUES (?, ?, ?, ?, ?)
          `).run(result.lastInsertRowid, username, hash, salt, createdAt);
        }
      } catch (error) {
        console.error('Failed to sync user to backups:', error);
        throw new Error('Failed to write to backup databases');
      }

      return {
        id: result.lastInsertRowid,
        username,
        createdAt
      };
    });
    
    // Execute with IMMEDIATE mode
    return createUser.immediate();
  }

  /**
   * Get user by username
   */
  static getByUsername(username) {
    const stmt = db.prepare(`
      SELECT id, username, passwordHash, salt, createdAt
      FROM users
      WHERE username = ?
    `);

    return stmt.get(username);
  }

  /**
   * Get user by ID
   */
  static getById(id) {
    const stmt = db.prepare(`
      SELECT id, username, createdAt
      FROM users
      WHERE id = ?
    `);

    return stmt.get(id);
  }

  /**
   * Validate user credentials
   */
  static async validateCredentials(username, password) {
    const user = this.getByUsername(username);
    
    if (!user) {
      return null;
    }

    const isValid = await this.verifyPassword(password, user.passwordHash, user.salt);
    
    if (!isValid) {
      return null;
    }

    // Return user without password fields
    return {
      id: user.id,
      username: user.username,
      createdAt: user.createdAt
    };
  }

  /**
   * Set or update PIN for a user (with triple-write)
   */
  static async setPin(userId, pin) {
    const { hash, salt } = await this.hashPassword(pin);
    
    // Update in main database
    db.prepare('UPDATE users SET pinHash = ?, pinSalt = ? WHERE id = ?')
      .run(hash, salt, userId);
    
    // Sync to backup databases
    try {
      if (backup1Db) {
        backup1Db.prepare('UPDATE users SET pinHash = ?, pinSalt = ? WHERE id = ?')
          .run(hash, salt, userId);
      }
      if (backup2Db) {
        backup2Db.prepare('UPDATE users SET pinHash = ?, pinSalt = ? WHERE id = ?')
          .run(hash, salt, userId);
      }
    } catch (error) {
      console.error('Failed to sync PIN to backups:', error);
      throw new Error('Failed to write to backup databases');
    }

    return true;
  }

  /**
   * Verify PIN for a user
   */
  static async verifyPin(userId, pin) {
    const user = db.prepare('SELECT pinHash, pinSalt FROM users WHERE id = ?').get(userId);
    if (!user || !user.pinHash) {
      return false;
    }
    return this.verifyPassword(pin, user.pinHash, user.pinSalt);
  }

  /**
   * Check if user has a PIN set
   */
  static hasPin(userId) {
    const user = db.prepare('SELECT pinHash FROM users WHERE id = ?').get(userId);
    return !!(user && user.pinHash);
  }
}

export default User;
