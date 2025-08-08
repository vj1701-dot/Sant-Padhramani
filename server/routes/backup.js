const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');

// All backup routes require authentication
router.use(requireAuth);

/**
 * Create manual backup
 */
router.post('/create', async (req, res) => {
    console.log('🔄 Manual backup requested');
    
    try {
        const result = await global.schedulerService.createManualBackup();
        
        res.json({
            success: true,
            message: 'Backup created successfully',
            data: result
        });
    } catch (error) {
        console.error('❌ Error creating backup:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create backup',
            error: error.message
        });
    }
});

/**
 * List available backups
 */
router.get('/list', async (req, res) => {
    console.log('📋 Backup list requested');
    
    try {
        const backups = await global.backupService.listBackups();
        
        res.json({
            success: true,
            data: backups
        });
    } catch (error) {
        console.error('❌ Error listing backups:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to list backups',
            error: error.message
        });
    }
});

/**
 * Get backup statistics
 */
router.get('/stats', async (req, res) => {
    console.log('📊 Backup stats requested');
    
    try {
        const stats = await global.backupService.getBackupStats();
        const schedulerStatus = global.schedulerService.getStatus();
        
        res.json({
            success: true,
            data: {
                backupStats: stats,
                schedulerStatus: schedulerStatus
            }
        });
    } catch (error) {
        console.error('❌ Error getting backup stats:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get backup statistics',
            error: error.message
        });
    }
});

/**
 * Restore from backup
 */
router.post('/restore', async (req, res) => {
    const { filename } = req.body;
    
    console.log('🔄 Backup restore requested:', filename);
    
    try {
        if (!filename) {
            return res.status(400).json({
                success: false,
                message: 'Filename is required'
            });
        }
        
        const result = await global.backupService.restoreBackup(filename);
        
        res.json({
            success: true,
            message: 'Backup restored successfully',
            data: result
        });
    } catch (error) {
        console.error('❌ Error restoring backup:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to restore backup',
            error: error.message
        });
    }
});

/**
 * Download backup file
 */
router.get('/download/:filename', async (req, res) => {
    const { filename } = req.params;
    
    console.log('📥 Backup download requested:', filename);
    
    try {
        const backups = await global.backupService.listBackups();
        const backup = backups.find(b => b.filename === filename);
        
        if (!backup) {
            return res.status(404).json({
                success: false,
                message: 'Backup file not found'
            });
        }
        
        if (backup.location === 'local' && backup.path) {
            res.download(backup.path, filename);
        } else if (backup.location === 'cloud' && backup.cloudFile) {
            const [buffer] = await backup.cloudFile.download();
            res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
            res.setHeader('Content-Type', 'application/json');
            res.send(buffer);
        } else {
            res.status(404).json({
                success: false,
                message: 'Backup file not accessible'
            });
        }
    } catch (error) {
        console.error('❌ Error downloading backup:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to download backup',
            error: error.message
        });
    }
});

/**
 * Upload and restore backup
 */
router.post('/upload', async (req, res) => {
    console.log('📤 Backup upload requested');
    
    try {
        // This would typically handle multipart file upload
        // For now, we expect the backup data in the request body
        const { backupData } = req.body;
        
        if (!backupData) {
            return res.status(400).json({
                success: false,
                message: 'Backup data is required'
            });
        }
        
        // Validate backup data format
        if (!backupData.data || !backupData.metadata) {
            return res.status(400).json({
                success: false,
                message: 'Invalid backup data format'
            });
        }
        
        // Create backup of current data before restore
        await global.schedulerService.createManualBackup();
        
        // Restore the uploaded data
        await global.jsonStorage.restoreAllData(backupData.data);
        
        res.json({
            success: true,
            message: 'Backup uploaded and restored successfully'
        });
    } catch (error) {
        console.error('❌ Error uploading/restoring backup:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to upload/restore backup',
            error: error.message
        });
    }
});

module.exports = router;