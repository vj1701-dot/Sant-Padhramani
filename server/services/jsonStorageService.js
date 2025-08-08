const fs = require('fs').promises;
const path = require('path');

class JsonStorageService {
    constructor() {
        this.dataDir = path.join(__dirname, '../data');
        this.files = {
            padharamaniRequests: path.join(this.dataDir, 'padharamani-requests.json'),
            assignedPadharamanis: path.join(this.dataDir, 'assigned-padharamanis.json'),
            users: path.join(this.dataDir, 'users.json'),
            telegramConfig: path.join(this.dataDir, 'telegram-config.json')
        };
        this.initialized = false;
    }

    /**
     * Initialize JSON storage service
     */
    async initialize() {
        console.log('📂 JsonStorageService initialization started...');
        
        try {
            // Create data directory if it doesn't exist
            await this.ensureDirectoryExists(this.dataDir);
            console.log('✅ Data directory created/verified:', this.dataDir);

            // Initialize all JSON files with empty arrays/objects if they don't exist
            await this.initializeFile(this.files.padharamaniRequests, []);
            await this.initializeFile(this.files.assignedPadharamanis, []);
            await this.initializeFile(this.files.users, []);
            await this.initializeFile(this.files.telegramConfig, {
                botToken: '',
                botUsername: '',
                webhookUrl: '',
                allowedUsers: []
            });

            this.initialized = true;
            console.log('✅ JsonStorageService initialized successfully');
            
        } catch (error) {
            console.error('❌ Failed to initialize JsonStorageService:', error.message);
            throw error;
        }
    }

    /**
     * Ensure directory exists
     */
    async ensureDirectoryExists(dirPath) {
        try {
            await fs.mkdir(dirPath, { recursive: true });
        } catch (error) {
            if (error.code !== 'EEXIST') {
                throw error;
            }
        }
    }

    /**
     * Initialize file with default content if it doesn't exist
     */
    async initializeFile(filePath, defaultContent) {
        try {
            await fs.access(filePath);
            console.log(`📄 File already exists: ${path.basename(filePath)}`);
        } catch (error) {
            if (error.code === 'ENOENT') {
                await fs.writeFile(filePath, JSON.stringify(defaultContent, null, 2));
                console.log(`📄 Created new file: ${path.basename(filePath)}`);
            } else {
                throw error;
            }
        }
    }

    /**
     * Read JSON file
     */
    async readFile(filePath) {
        try {
            const data = await fs.readFile(filePath, 'utf8');
            return JSON.parse(data);
        } catch (error) {
            console.error(`❌ Error reading ${path.basename(filePath)}:`, error.message);
            throw error;
        }
    }

    /**
     * Write JSON file
     */
    async writeFile(filePath, data) {
        try {
            await fs.writeFile(filePath, JSON.stringify(data, null, 2));
            console.log(`💾 Saved data to ${path.basename(filePath)}`);
        } catch (error) {
            console.error(`❌ Error writing ${path.basename(filePath)}:`, error.message);
            throw error;
        }
    }

    /**
     * Schedule a padharamani request
     */
    async schedulePadharamani(padharamaniData) {
        try {
            const requests = await this.readFile(this.files.padharamaniRequests);
            
            const requestData = {
                id: Date.now().toString(),
                name: padharamaniData.name || '',
                phone: padharamaniData.phone || '',
                address: padharamaniData.address || '',
                city: padharamaniData.city || '',
                email: padharamaniData.email || '',
                comments: padharamaniData.comments || '',
                createdDate: new Date().toISOString(),
                status: 'Pending'
            };

            requests.push(requestData);
            await this.writeFile(this.files.padharamaniRequests, requests);
            
            return {
                success: true,
                data: requestData
            };
        } catch (error) {
            console.error('❌ Error scheduling padharamani:', error);
            throw error;
        }
    }

    /**
     * Add complete padharamani (assigned)
     */
    async addPadharamani(padharamaniData) {
        try {
            const assigned = await this.readFile(this.files.assignedPadharamanis);
            
            const assignedData = {
                id: padharamaniData.id || Date.now().toString(),
                date: padharamaniData.date || '',
                beginningTime: padharamaniData.beginningTime || '',
                endingTime: padharamaniData.endingTime || '',
                name: padharamaniData.name || '',
                phone: padharamaniData.phone || '',
                address: padharamaniData.address || '',
                city: padharamaniData.city || '',
                email: padharamaniData.email || '',
                transportVolunteer: padharamaniData.transportVolunteer || '',
                volunteerNumber: padharamaniData.volunteerNumber || '',
                zoneCoordinator: padharamaniData.zoneCoordinator || '',
                zoneCoordinatorPhone: padharamaniData.zoneCoordinatorPhone || '',
                comments: padharamaniData.comments || '',
                status: padharamaniData.status || 'Scheduled',
                createdDate: new Date().toISOString()
            };

            assigned.push(assignedData);
            await this.writeFile(this.files.assignedPadharamanis, assigned);
            
            return {
                success: true,
                data: assignedData
            };
        } catch (error) {
            console.error('❌ Error adding padharamani:', error);
            throw error;
        }
    }

    /**
     * Get all padharamani requests
     */
    async getScheduledPadharamanis() {
        try {
            return await this.readFile(this.files.padharamaniRequests);
        } catch (error) {
            console.error('❌ Error getting scheduled padharamanis:', error);
            return [];
        }
    }

    /**
     * Get upcoming padharamanis
     */
    async getUpcomingPadharamanis() {
        try {
            const assigned = await this.readFile(this.files.assignedPadharamanis);
            const today = new Date().toISOString().split('T')[0];
            
            return assigned.filter(item => {
                return item.date >= today && item.status !== 'Canceled';
            });
        } catch (error) {
            console.error('❌ Error getting upcoming padharamanis:', error);
            return [];
        }
    }

    /**
     * Get archived padharamanis
     */
    async getArchivedPadharamanis() {
        try {
            const assigned = await this.readFile(this.files.assignedPadharamanis);
            const today = new Date().toISOString().split('T')[0];
            
            return assigned.filter(item => {
                return item.date < today || item.status === 'Canceled';
            });
        } catch (error) {
            console.error('❌ Error getting archived padharamanis:', error);
            return [];
        }
    }

    /**
     * Update padharamani
     */
    async updatePadharamani(id, updatedData) {
        try {
            // Check requests first
            const requests = await this.readFile(this.files.padharamaniRequests);
            const requestIndex = requests.findIndex(item => item.id === id);
            
            if (requestIndex !== -1) {
                if (updatedData.date) {
                    // Move to assigned
                    const requestData = requests[requestIndex];
                    await this.addPadharamani({ ...requestData, ...updatedData, id });
                    requests.splice(requestIndex, 1);
                    await this.writeFile(this.files.padharamaniRequests, requests);
                } else {
                    // Update in requests
                    requests[requestIndex] = { ...requests[requestIndex], ...updatedData };
                    await this.writeFile(this.files.padharamaniRequests, requests);
                }
                return { success: true };
            }

            // Check assigned
            const assigned = await this.readFile(this.files.assignedPadharamanis);
            const assignedIndex = assigned.findIndex(item => item.id === id);
            
            if (assignedIndex !== -1) {
                assigned[assignedIndex] = { ...assigned[assignedIndex], ...updatedData };
                await this.writeFile(this.files.assignedPadharamanis, assigned);
                return { success: true };
            }

            throw new Error('Padharamani not found');
        } catch (error) {
            console.error('❌ Error updating padharamani:', error);
            throw error;
        }
    }

    /**
     * Delete padharamani
     */
    async deletePadharamani(id) {
        try {
            // Check requests first
            const requests = await this.readFile(this.files.padharamaniRequests);
            const requestIndex = requests.findIndex(item => item.id === id);
            
            if (requestIndex !== -1) {
                requests.splice(requestIndex, 1);
                await this.writeFile(this.files.padharamaniRequests, requests);
                return { success: true };
            }

            // Check assigned
            const assigned = await this.readFile(this.files.assignedPadharamanis);
            const assignedIndex = assigned.findIndex(item => item.id === id);
            
            if (assignedIndex !== -1) {
                assigned.splice(assignedIndex, 1);
                await this.writeFile(this.files.assignedPadharamanis, assigned);
                return { success: true };
            }

            throw new Error('Padharamani not found');
        } catch (error) {
            console.error('❌ Error deleting padharamani:', error);
            throw error;
        }
    }

    /**
     * User management methods
     */
    async getUsers() {
        try {
            return await this.readFile(this.files.users);
        } catch (error) {
            console.error('❌ Error getting users:', error);
            return [];
        }
    }

    async addUser(userData) {
        try {
            const users = await this.readFile(this.files.users);
            const newUser = {
                id: Date.now().toString(),
                ...userData,
                createdDate: new Date().toISOString()
            };
            users.push(newUser);
            await this.writeFile(this.files.users, users);
            return { success: true, data: newUser };
        } catch (error) {
            console.error('❌ Error adding user:', error);
            throw error;
        }
    }

    async updateUser(id, userData) {
        try {
            const users = await this.readFile(this.files.users);
            const userIndex = users.findIndex(user => user.id === id);
            
            if (userIndex !== -1) {
                users[userIndex] = { ...users[userIndex], ...userData };
                await this.writeFile(this.files.users, users);
                return { success: true };
            }

            throw new Error('User not found');
        } catch (error) {
            console.error('❌ Error updating user:', error);
            throw error;
        }
    }

    async deleteUser(id) {
        try {
            const users = await this.readFile(this.files.users);
            const userIndex = users.findIndex(user => user.id === id);
            
            if (userIndex !== -1) {
                users.splice(userIndex, 1);
                await this.writeFile(this.files.users, users);
                return { success: true };
            }

            throw new Error('User not found');
        } catch (error) {
            console.error('❌ Error deleting user:', error);
            throw error;
        }
    }

    /**
     * Telegram configuration methods
     */
    async getTelegramConfig() {
        try {
            return await this.readFile(this.files.telegramConfig);
        } catch (error) {
            console.error('❌ Error getting telegram config:', error);
            return {};
        }
    }

    async updateTelegramConfig(configData) {
        try {
            const currentConfig = await this.readFile(this.files.telegramConfig);
            const updatedConfig = { ...currentConfig, ...configData };
            await this.writeFile(this.files.telegramConfig, updatedConfig);
            return { success: true };
        } catch (error) {
            console.error('❌ Error updating telegram config:', error);
            throw error;
        }
    }

    /**
     * Get all data for backup
     */
    async getAllData() {
        try {
            const data = {};
            for (const [key, filePath] of Object.entries(this.files)) {
                data[key] = await this.readFile(filePath);
            }
            data.backupTimestamp = new Date().toISOString();
            return data;
        } catch (error) {
            console.error('❌ Error getting all data:', error);
            throw error;
        }
    }

    /**
     * Restore all data from backup
     */
    async restoreAllData(backupData) {
        try {
            for (const [key, filePath] of Object.entries(this.files)) {
                if (backupData[key]) {
                    await this.writeFile(filePath, backupData[key]);
                }
            }
            console.log('✅ All data restored from backup');
            return { success: true };
        } catch (error) {
            console.error('❌ Error restoring data:', error);
            throw error;
        }
    }
}

module.exports = JsonStorageService;