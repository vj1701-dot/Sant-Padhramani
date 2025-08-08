const { Storage } = require('@google-cloud/storage');
const fs = require('fs').promises;
const path = require('path');

class BackupService {
    constructor(jsonStorageService) {
        this.jsonStorage = jsonStorageService;
        this.storage = null;
        this.bucketName = process.env.BACKUP_BUCKET_NAME || 'sant-padharamani-backups';
        this.bucket = null;
        this.initialized = false;
    }

    /**
     * Initialize backup service
     */
    async initialize() {
        console.log('☁️ BackupService initialization started...');
        
        try {
            // Initialize Google Cloud Storage
            this.storage = new Storage();
            this.bucket = this.storage.bucket(this.bucketName);
            
            // Check if bucket exists, create if not
            await this.ensureBucketExists();
            
            this.initialized = true;
            console.log('✅ BackupService initialized successfully');
            console.log('📦 Using storage bucket:', this.bucketName);
            
        } catch (error) {
            console.error('❌ Failed to initialize BackupService:', error.message);
            console.log('⚠️ BackupService will work in local-only mode');
            // Don't throw error - allow local backups to work
        }
    }

    /**
     * Ensure backup bucket exists
     */
    async ensureBucketExists() {
        try {
            const [exists] = await this.bucket.exists();
            
            if (!exists) {
                console.log('📦 Creating backup bucket:', this.bucketName);
                await this.storage.createBucket(this.bucketName, {
                    location: 'US',
                    storageClass: 'STANDARD'
                });
                console.log('✅ Backup bucket created successfully');
            } else {
                console.log('📦 Backup bucket already exists:', this.bucketName);
            }
        } catch (error) {
            console.error('❌ Error with backup bucket:', error.message);
            throw error;
        }
    }

    /**
     * Create backup
     */
    async createBackup(backupType = 'manual') {
        console.log(`🔄 Creating ${backupType} backup...`);
        
        try {
            // Get all data from JSON storage
            const allData = await this.jsonStorage.getAllData();
            
            // Create backup metadata
            const backupMetadata = {
                timestamp: new Date().toISOString(),
                type: backupType,
                version: '1.0',
                dataKeys: Object.keys(allData).filter(key => key !== 'backupTimestamp')
            };

            const backupData = {
                metadata: backupMetadata,
                data: allData
            };

            // Create filename
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const filename = `backup-${backupType}-${timestamp}.json`;
            
            // Save locally first
            const localBackupPath = path.join(__dirname, '../backups');
            await this.ensureLocalBackupDir(localBackupPath);
            const localFilePath = path.join(localBackupPath, filename);
            await fs.writeFile(localFilePath, JSON.stringify(backupData, null, 2));
            console.log('💾 Local backup created:', filename);

            // Upload to cloud storage if available
            if (this.bucket) {
                try {
                    const file = this.bucket.file(filename);
                    await file.save(JSON.stringify(backupData, null, 2), {
                        metadata: {
                            contentType: 'application/json',
                            metadata: {
                                backupType,
                                timestamp: backupMetadata.timestamp
                            }
                        }
                    });
                    console.log('☁️ Cloud backup uploaded:', filename);
                } catch (cloudError) {
                    console.error('⚠️ Cloud backup failed, but local backup succeeded:', cloudError.message);
                }
            }

            // Clean up old backups (keep last 30 days)
            await this.cleanupOldBackups();

            return {
                success: true,
                filename,
                localPath: localFilePath,
                timestamp: backupMetadata.timestamp
            };
            
        } catch (error) {
            console.error('❌ Error creating backup:', error);
            throw error;
        }
    }

    /**
     * List available backups
     */
    async listBackups() {
        console.log('📋 Listing available backups...');
        
        try {
            const backups = [];

            // List local backups
            const localBackupPath = path.join(__dirname, '../backups');
            try {
                const localFiles = await fs.readdir(localBackupPath);
                for (const file of localFiles) {
                    if (file.endsWith('.json') && file.startsWith('backup-')) {
                        const filePath = path.join(localBackupPath, file);
                        const stats = await fs.stat(filePath);
                        backups.push({
                            filename: file,
                            location: 'local',
                            size: stats.size,
                            created: stats.mtime.toISOString(),
                            path: filePath
                        });
                    }
                }
            } catch (localError) {
                console.log('⚠️ No local backups found or error accessing local backups');
            }

            // List cloud backups if available
            if (this.bucket) {
                try {
                    const [files] = await this.bucket.getFiles({
                        prefix: 'backup-'
                    });
                    
                    for (const file of files) {
                        const [metadata] = await file.getMetadata();
                        backups.push({
                            filename: file.name,
                            location: 'cloud',
                            size: parseInt(metadata.size),
                            created: metadata.timeCreated,
                            cloudFile: file
                        });
                    }
                } catch (cloudError) {
                    console.log('⚠️ Error listing cloud backups:', cloudError.message);
                }
            }

            // Sort by creation date (newest first)
            backups.sort((a, b) => new Date(b.created) - new Date(a.created));
            
            console.log(`📋 Found ${backups.length} backups`);
            return backups;
            
        } catch (error) {
            console.error('❌ Error listing backups:', error);
            throw error;
        }
    }

    /**
     * Restore from backup
     */
    async restoreBackup(filename) {
        console.log('🔄 Restoring from backup:', filename);
        
        try {
            let backupData;

            // Try to load from local first
            const localBackupPath = path.join(__dirname, '../backups', filename);
            try {
                const localData = await fs.readFile(localBackupPath, 'utf8');
                backupData = JSON.parse(localData);
                console.log('📁 Loaded backup from local storage');
            } catch (localError) {
                // Try cloud storage
                if (this.bucket) {
                    try {
                        const file = this.bucket.file(filename);
                        const [cloudData] = await file.download();
                        backupData = JSON.parse(cloudData.toString());
                        console.log('☁️ Loaded backup from cloud storage');
                    } catch (cloudError) {
                        throw new Error(`Backup file not found locally or in cloud: ${filename}`);
                    }
                } else {
                    throw new Error(`Backup file not found: ${filename}`);
                }
            }

            // Validate backup data
            if (!backupData.data || !backupData.metadata) {
                throw new Error('Invalid backup file format');
            }

            // Create backup of current data before restore
            await this.createBackup('pre-restore');

            // Restore data
            await this.jsonStorage.restoreAllData(backupData.data);
            
            console.log('✅ Backup restored successfully');
            console.log('📅 Backup date:', backupData.metadata.timestamp);
            
            return {
                success: true,
                restoredFrom: filename,
                backupTimestamp: backupData.metadata.timestamp
            };
            
        } catch (error) {
            console.error('❌ Error restoring backup:', error);
            throw error;
        }
    }

    /**
     * Ensure local backup directory exists
     */
    async ensureLocalBackupDir(dirPath) {
        try {
            await fs.mkdir(dirPath, { recursive: true });
        } catch (error) {
            if (error.code !== 'EEXIST') {
                throw error;
            }
        }
    }

    /**
     * Clean up old backups (keep last 30 days)
     */
    async cleanupOldBackups() {
        console.log('🧹 Cleaning up old backups...');
        
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - 30);
        
        try {
            // Cleanup local backups
            const localBackupPath = path.join(__dirname, '../backups');
            try {
                const localFiles = await fs.readdir(localBackupPath);
                for (const file of localFiles) {
                    if (file.endsWith('.json') && file.startsWith('backup-')) {
                        const filePath = path.join(localBackupPath, file);
                        const stats = await fs.stat(filePath);
                        
                        if (stats.mtime < cutoffDate) {
                            await fs.unlink(filePath);
                            console.log('🗑️ Deleted old local backup:', file);
                        }
                    }
                }
            } catch (localError) {
                console.log('⚠️ Error cleaning up local backups:', localError.message);
            }

            // Cleanup cloud backups
            if (this.bucket) {
                try {
                    const [files] = await this.bucket.getFiles({
                        prefix: 'backup-'
                    });
                    
                    for (const file of files) {
                        const [metadata] = await file.getMetadata();
                        const fileDate = new Date(metadata.timeCreated);
                        
                        if (fileDate < cutoffDate) {
                            await file.delete();
                            console.log('🗑️ Deleted old cloud backup:', file.name);
                        }
                    }
                } catch (cloudError) {
                    console.log('⚠️ Error cleaning up cloud backups:', cloudError.message);
                }
            }
            
        } catch (error) {
            console.error('❌ Error during backup cleanup:', error);
        }
    }

    /**
     * Get backup statistics
     */
    async getBackupStats() {
        try {
            const backups = await this.listBackups();
            
            const stats = {
                totalBackups: backups.length,
                localBackups: backups.filter(b => b.location === 'local').length,
                cloudBackups: backups.filter(b => b.location === 'cloud').length,
                totalSize: backups.reduce((sum, b) => sum + b.size, 0),
                oldestBackup: backups.length > 0 ? backups[backups.length - 1].created : null,
                newestBackup: backups.length > 0 ? backups[0].created : null
            };
            
            return stats;
        } catch (error) {
            console.error('❌ Error getting backup stats:', error);
            throw error;
        }
    }
}

module.exports = BackupService;