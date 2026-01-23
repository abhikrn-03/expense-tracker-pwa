import db, { BackupManager } from './database.js';

class DatabaseHealth {
  /**
   * Perform comprehensive database health check
   */
  static checkHealth() {
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      mainDb: { integrity: false, size: 0 },
      backup1: { exists: false, integrity: false },
      backup2: { exists: false, integrity: false },
      errors: []
    };

    try {
      // Check main database integrity
      health.mainDb.integrity = BackupManager.verifyIntegrity(db);
      
      if (!health.mainDb.integrity) {
        health.status = 'corrupted';
        health.errors.push('Main database integrity check failed');
      }

      // Get database size
      const fs = require('fs');
      const path = require('path');
      const dbPath = path.join(__dirname, '..', 'expenses.db');
      
      if (fs.existsSync(dbPath)) {
        const stats = fs.statSync(dbPath);
        health.mainDb.size = stats.size;
      }

      // Check backups
      const backup1Path = path.join(__dirname, '..', 'backups', 'expenses_backup1.db');
      const backup2Path = path.join(__dirname, '..', 'backups', 'expenses_backup2.db');

      health.backup1.exists = fs.existsSync(backup1Path);
      health.backup2.exists = fs.existsSync(backup2Path);

      if (!health.backup1.exists && !health.backup2.exists) {
        health.status = 'warning';
        health.errors.push('No backups found');
      }

    } catch (error) {
      health.status = 'error';
      health.errors.push(error.message);
    }

    return health;
  }

  /**
   * Get database statistics
   */
  static getStats() {
    try {
      const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get();
      const expenseCount = db.prepare('SELECT COUNT(*) as count FROM expenses').get();
      const categoryCount = db.prepare('SELECT COUNT(*) as count FROM categories').get();

      return {
        users: userCount.count,
        expenses: expenseCount.count,
        categories: categoryCount.count,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('Failed to get database stats:', error);
      return null;
    }
  }

  /**
   * Attempt automatic recovery if corruption detected
   */
  static attemptRecovery() {
    console.log('🔧 Attempting automatic recovery...');
    
    if (!BackupManager.verifyIntegrity(db)) {
      console.log('Main database corrupted, attempting restore...');
      
      // Try backup1
      if (BackupManager.restoreFromBackup(1)) {
        console.log('✅ Recovered from backup1');
        return { success: true, source: 'backup1' };
      }

      // Try backup2
      if (BackupManager.restoreFromBackup(2)) {
        console.log('✅ Recovered from backup2');
        return { success: true, source: 'backup2' };
      }

      console.error('❌ Recovery failed - all backups invalid');
      return { success: false, error: 'All backups invalid' };
    }

    return { success: true, message: 'No recovery needed' };
  }

  /**
   * Trigger manual backup
   */
  static triggerBackup() {
    try {
      const success = BackupManager.syncToBackups();
      return {
        success,
        timestamp: new Date().toISOString(),
        message: success ? 'Backup completed successfully' : 'Backup failed'
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }
}

export default DatabaseHealth;
