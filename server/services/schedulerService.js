const cron = require('cron');

class SchedulerService {
    constructor(backupService) {
        this.backupService = backupService;
        this.jobs = [];
        this.initialized = false;
    }

    /**
     * Initialize scheduler service
     */
    async initialize() {
        console.log('⏰ SchedulerService initialization started...');
        
        try {
            // Schedule nightly backup at 2:00 AM
            this.scheduleNightlyBackup();
            
            // Schedule weekly cleanup at 3:00 AM on Sundays
            this.scheduleWeeklyCleanup();
            
            this.initialized = true;
            console.log('✅ SchedulerService initialized successfully');
            console.log('📅 Nightly backups scheduled for 2:00 AM');
            console.log('🧹 Weekly cleanup scheduled for 3:00 AM on Sundays');
            
        } catch (error) {
            console.error('❌ Failed to initialize SchedulerService:', error.message);
            throw error;
        }
    }

    /**
     * Schedule nightly backup
     */
    scheduleNightlyBackup() {
        console.log('📅 Setting up nightly backup schedule...');
        
        // Run at 2:00 AM every day
        const nightlyBackupJob = new cron.CronJob(
            '0 2 * * *', // Second Minute Hour DayOfMonth Month DayOfWeek
            async () => {
                console.log('🌙 Starting nightly backup...');
                try {
                    const result = await this.backupService.createBackup('nightly');
                    console.log('✅ Nightly backup completed successfully:', result.filename);
                } catch (error) {
                    console.error('❌ Nightly backup failed:', error.message);
                }
            },
            null, // onComplete
            false, // start
            'America/New_York' // timezone
        );
        
        this.jobs.push({
            name: 'nightly-backup',
            job: nightlyBackupJob,
            schedule: '2:00 AM daily'
        });
        
        nightlyBackupJob.start();
        console.log('✅ Nightly backup job scheduled');
    }

    /**
     * Schedule weekly cleanup
     */
    scheduleWeeklyCleanup() {
        console.log('🧹 Setting up weekly cleanup schedule...');
        
        // Run at 3:00 AM every Sunday
        const weeklyCleanupJob = new cron.CronJob(
            '0 3 * * 0', // Second Minute Hour DayOfMonth Month DayOfWeek (0 = Sunday)
            async () => {
                console.log('🧹 Starting weekly backup cleanup...');
                try {
                    await this.backupService.cleanupOldBackups();
                    console.log('✅ Weekly cleanup completed successfully');
                } catch (error) {
                    console.error('❌ Weekly cleanup failed:', error.message);
                }
            },
            null, // onComplete
            false, // start
            'America/New_York' // timezone
        );
        
        this.jobs.push({
            name: 'weekly-cleanup',
            job: weeklyCleanupJob,
            schedule: '3:00 AM every Sunday'
        });
        
        weeklyCleanupJob.start();
        console.log('✅ Weekly cleanup job scheduled');
    }

    /**
     * Create manual backup
     */
    async createManualBackup() {
        console.log('🔄 Creating manual backup...');
        try {
            const result = await this.backupService.createBackup('manual');
            console.log('✅ Manual backup created:', result.filename);
            return result;
        } catch (error) {
            console.error('❌ Manual backup failed:', error);
            throw error;
        }
    }

    /**
     * Get scheduler status
     */
    getStatus() {
        return {
            initialized: this.initialized,
            activeJobs: this.jobs.map(job => ({
                name: job.name,
                schedule: job.schedule,
                running: job.job.running,
                lastDate: job.job.lastDate(),
                nextDate: job.job.nextDate()
            }))
        };
    }

    /**
     * Stop all scheduled jobs
     */
    stop() {
        console.log('🛑 Stopping all scheduled jobs...');
        
        for (const jobInfo of this.jobs) {
            jobInfo.job.stop();
            console.log(`🛑 Stopped job: ${jobInfo.name}`);
        }
        
        console.log('✅ All scheduled jobs stopped');
    }

    /**
     * Start all scheduled jobs
     */
    start() {
        console.log('▶️ Starting all scheduled jobs...');
        
        for (const jobInfo of this.jobs) {
            jobInfo.job.start();
            console.log(`▶️ Started job: ${jobInfo.name}`);
        }
        
        console.log('✅ All scheduled jobs started');
    }
}

module.exports = SchedulerService;