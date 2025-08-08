const bcrypt = require('bcrypt');
const fs = require('fs').promises;
const path = require('path');

const USERS_FILE_PATH = path.join(__dirname, '../data/users.json');
const ACCOUNT_LOCKOUT_TIME = 15 * 60 * 1000; // 15 minutes
const MAX_LOGIN_ATTEMPTS = 5;

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
            mustChangePassword: true, // Force password change on first login
            failedLoginAttempts: 0,
            accountLockedUntil: null,
            createdAt: new Date().toISOString()
        };

        this.users.push(defaultAdmin);
        await this.saveUsers();
        
        console.log('🔐 Default admin user created:');
        console.log('   Email: admin@santpadharamani.com');
        console.log('   Password: admin123456');
        console.log('   ⚠️  MUST change password on first login!');
    }

    async ensureDefaultAdmin() {
        // Check if admin user exists in memory
        const adminExists = this.users.some(u => u.email === 'admin@santpadharamani.com');
        if (!adminExists) {
            console.log('⚠️ Admin user not found in memory, recreating...');
            await this.createDefaultAdmin();
        }
    }

    validatePasswordComplexity(password) {
        if (password.length < 8) {
            throw new Error('Password must be at least 8 characters long');
        }
        if (!/[a-z]/.test(password)) {
            throw new Error('Password must contain at least one lowercase letter');
        }
        if (!/[A-Z]/.test(password)) {
            throw new Error('Password must contain at least one uppercase letter');
        }
        if (!/\d/.test(password)) {
            throw new Error('Password must contain at least one number');
        }
        if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
            throw new Error('Password must contain at least one special character');
        }
        return true;
    }

    async createUser(email, password, name, isAdmin = false) {
        // Check if user already exists
        const existingUser = this.users.find(u => u.email === email);
        if (existingUser) {
            throw new Error('User already exists');
        }

        // Validate password complexity
        this.validatePasswordComplexity(password);

        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = {
            id: 'user_' + Date.now(),
            email,
            name,
            password: hashedPassword,
            isApproved: false, // Require admin approval
            isAdmin,
            mustChangePassword: false,
            failedLoginAttempts: 0,
            accountLockedUntil: null,
            createdAt: new Date().toISOString()
        };

        this.users.push(newUser);
        await this.saveUsers();

        // Return user without password
        const { password: _, ...userWithoutPassword } = newUser;
        return userWithoutPassword;
    }

    async authenticateUser(email, password) {
        // Always ensure admin user exists (Cloud Run ephemeral storage fix)
        await this.ensureDefaultAdmin();
        
        const userIndex = this.users.findIndex(u => u.email === email);
        if (userIndex === -1) {
            // Log failed attempt for non-existent user
            console.log(`🚨 Authentication attempt for non-existent user: ${email}`);
            throw new Error('Invalid credentials');
        }

        const user = this.users[userIndex];

        // Check if account is locked
        if (user.accountLockedUntil && new Date() < new Date(user.accountLockedUntil)) {
            const unlockTime = new Date(user.accountLockedUntil).toLocaleString();
            console.log(`🔒 Account locked for user: ${email} until ${unlockTime}`);
            throw new Error(`Account locked until ${unlockTime}`);
        }

        // Reset failed attempts if lockout time has passed
        if (user.accountLockedUntil && new Date() >= new Date(user.accountLockedUntil)) {
            user.failedLoginAttempts = 0;
            user.accountLockedUntil = null;
        }

        if (!user.isApproved) {
            console.log(`🚨 Authentication attempt for unapproved user: ${email}`);
            throw new Error('Account not approved');
        }

        const isValidPassword = await bcrypt.compare(password, user.password);
        if (!isValidPassword) {
            // Increment failed login attempts
            user.failedLoginAttempts = (user.failedLoginAttempts || 0) + 1;
            
            if (user.failedLoginAttempts >= MAX_LOGIN_ATTEMPTS) {
                user.accountLockedUntil = new Date(Date.now() + ACCOUNT_LOCKOUT_TIME).toISOString();
                console.log(`🔒 Account locked for user: ${email} after ${MAX_LOGIN_ATTEMPTS} failed attempts`);
                
                // Track account lockout for security monitoring
                if (global.securityService) {
                    await global.securityService.trackAccountLocked(email, 'unknown', user.failedLoginAttempts);
                }
                
                await this.saveUsers();
                throw new Error(`Account locked after ${MAX_LOGIN_ATTEMPTS} failed attempts. Try again in 15 minutes.`);
            }
            
            await this.saveUsers();
            console.log(`🚨 Invalid password for user: ${email}. Attempt ${user.failedLoginAttempts}/${MAX_LOGIN_ATTEMPTS}`);
            throw new Error('Invalid credentials');
        }

        // Reset failed attempts on successful login
        if (user.failedLoginAttempts > 0) {
            user.failedLoginAttempts = 0;
            user.accountLockedUntil = null;
            await this.saveUsers();
        }

        console.log(`✅ Successful authentication for user: ${email}`);

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

    async changePassword(email, currentPassword, newPassword) {
        const userIndex = this.users.findIndex(u => u.email === email);
        if (userIndex === -1) {
            throw new Error('User not found');
        }

        const user = this.users[userIndex];

        // If user must change password, skip current password check
        if (!user.mustChangePassword) {
            const isValidCurrentPassword = await bcrypt.compare(currentPassword, user.password);
            if (!isValidCurrentPassword) {
                console.log(`🚨 Invalid current password for user: ${email}`);
                throw new Error('Current password is incorrect');
            }
        }

        // Validate new password complexity
        this.validatePasswordComplexity(newPassword);

        const hashedNewPassword = await bcrypt.hash(newPassword, 10);
        user.password = hashedNewPassword;
        user.mustChangePassword = false;
        user.updatedAt = new Date().toISOString();

        await this.saveUsers();
        console.log(`✅ Password changed successfully for user: ${email}`);

        const { password: _, ...userWithoutPassword } = user;
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