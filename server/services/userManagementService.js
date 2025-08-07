const bcrypt = require('bcrypt');
const fs = require('fs').promises;
const path = require('path');

const USERS_FILE_PATH = path.join(__dirname, '../data/users.json');

class UserManagementService {
    constructor() {
        this.initialized = false;
        this.users = [];
    }

    async initialize() {
        try {
            // Ensure data directory exists
            const dataDir = path.dirname(USERS_FILE_PATH);
            await fs.mkdir(dataDir, { recursive: true });
            
            // Load existing users
            await this.loadUsers();
            
            // Create default admin user if no users exist
            if (this.users.length === 0) {
                await this.createDefaultAdmin();
            }
            
            this.initialized = true;
            console.log(`User management initialized with ${this.users.length} users`);
        } catch (error) {
            console.error('Failed to initialize user management:', error);
            throw error;
        }
    }

    async loadUsers() {
        try {
            const data = await fs.readFile(USERS_FILE_PATH, 'utf8');
            this.users = JSON.parse(data);
        } catch (error) {
            if (error.code === 'ENOENT') {
                this.users = [];
                await this.saveUsers();
            } else {
                throw error;
            }
        }
    }

    async saveUsers() {
        await fs.writeFile(USERS_FILE_PATH, JSON.stringify(this.users, null, 2));
    }

    async createDefaultAdmin() {
        const defaultAdmin = {
            id: 'admin_' + Date.now(),
            email: 'admin@santpadharamani.com',
            name: 'Sant Padharamani Admin',
            password: await bcrypt.hash('admin123456', 10),
            isApproved: true,
            isAdmin: true,
            createdAt: new Date().toISOString()
        };

        this.users.push(defaultAdmin);
        await this.saveUsers();
        
        console.log('🔐 Default admin user created:');
        console.log('   Email: admin@santpadharamani.com');
        console.log('   Password: admin123456');
        console.log('   ⚠️  Please change password after first login!');
    }

    async createUser(email, password, name, isAdmin = false) {
        // Check if user already exists
        const existingUser = this.users.find(u => u.email === email);
        if (existingUser) {
            throw new Error('User already exists');
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = {
            id: 'user_' + Date.now(),
            email,
            name,
            password: hashedPassword,
            isApproved: false, // Require admin approval
            isAdmin,
            createdAt: new Date().toISOString()
        };

        this.users.push(newUser);
        await this.saveUsers();

        // Return user without password
        const { password: _, ...userWithoutPassword } = newUser;
        return userWithoutPassword;
    }

    async authenticateUser(email, password) {
        const user = this.users.find(u => u.email === email);
        if (!user) {
            throw new Error('Invalid credentials');
        }

        if (!user.isApproved) {
            throw new Error('Account not approved');
        }

        const isValidPassword = await bcrypt.compare(password, user.password);
        if (!isValidPassword) {
            throw new Error('Invalid credentials');
        }

        // Return user without password
        const { password: _, ...userWithoutPassword } = user;
        return userWithoutPassword;
    }

    async approveUser(email) {
        const userIndex = this.users.findIndex(u => u.email === email);
        if (userIndex === -1) {
            throw new Error('User not found');
        }

        this.users[userIndex].isApproved = true;
        this.users[userIndex].approvedAt = new Date().toISOString();
        await this.saveUsers();

        const { password: _, ...userWithoutPassword } = this.users[userIndex];
        return userWithoutPassword;
    }

    async getAllUsers() {
        return this.users.map(user => {
            const { password: _, ...userWithoutPassword } = user;
            return userWithoutPassword;
        });
    }

    async deleteUser(email) {
        const userIndex = this.users.findIndex(u => u.email === email);
        if (userIndex === -1) {
            throw new Error('User not found');
        }

        // Prevent deleting the last admin
        const adminUsers = this.users.filter(u => u.isAdmin && u.isApproved);
        if (adminUsers.length === 1 && this.users[userIndex].isAdmin) {
            throw new Error('Cannot delete the last admin user');
        }

        this.users.splice(userIndex, 1);
        await this.saveUsers();
        return { success: true, message: 'User deleted successfully' };
    }

    async updateUser(email, updates) {
        const userIndex = this.users.findIndex(u => u.email === email);
        if (userIndex === -1) {
            throw new Error('User not found');
        }

        // Hash password if provided
        if (updates.password) {
            updates.password = await bcrypt.hash(updates.password, 10);
        }

        // Update user
        this.users[userIndex] = { ...this.users[userIndex], ...updates, updatedAt: new Date().toISOString() };
        await this.saveUsers();

        const { password: _, ...userWithoutPassword } = this.users[userIndex];
        return userWithoutPassword;
    }

    // Create Telegram user (auto-approved)
    async createTelegramUser(telegramData) {
        const email = telegramData.username ? 
            `${telegramData.username}@telegram.local` : 
            `user_${telegramData.id}@telegram.local`;

        // Check if Telegram user already exists
        const existingUser = this.users.find(u => u.telegramId === telegramData.id);
        if (existingUser) {
            return existingUser;
        }

        const telegramUser = {
            id: `tg_${telegramData.id}`,
            email,
            name: `${telegramData.first_name} ${telegramData.last_name || ''}`.trim(),
            telegramId: telegramData.id,
            isApproved: true, // Auto-approve Telegram users
            isAdmin: false,
            isTelegramUser: true,
            createdAt: new Date().toISOString()
        };

        this.users.push(telegramUser);
        await this.saveUsers();

        return telegramUser;
    }
}

module.exports = UserManagementService;