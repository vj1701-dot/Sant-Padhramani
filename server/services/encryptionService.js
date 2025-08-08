const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');

const ENCRYPTION_KEY_PATH = path.join(__dirname, '../data/encryption.key');
const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32; // 256 bits
const IV_LENGTH = 16;  // 128 bits
const TAG_LENGTH = 16; // 128 bits

class EncryptionService {
    constructor() {
        this.initialized = false;
        this.encryptionKey = null;
    }

    async initialize() {
        try {
            // Ensure data directory exists
            const dataDir = path.dirname(ENCRYPTION_KEY_PATH);
            await fs.mkdir(dataDir, { recursive: true });
            
            // Load or generate encryption key
            await this.loadOrGenerateKey();
            
            this.initialized = true;
            console.log('✅ EncryptionService initialized successfully');
        } catch (error) {
            console.error('❌ Failed to initialize EncryptionService:', error);
            throw error;
        }
    }

    async loadOrGenerateKey() {
        try {
            // Try to load existing key
            const keyData = await fs.readFile(ENCRYPTION_KEY_PATH, 'utf8');
            this.encryptionKey = Buffer.from(keyData, 'hex');
            console.log('🔑 Loaded existing encryption key');
        } catch (error) {
            if (error.code === 'ENOENT') {
                // Key doesn't exist, generate new one
                console.log('🔑 Generating new encryption key...');
                this.encryptionKey = crypto.randomBytes(KEY_LENGTH);
                await fs.writeFile(ENCRYPTION_KEY_PATH, this.encryptionKey.toString('hex'), {
                    mode: 0o600 // Read/write for owner only
                });
                console.log('✅ New encryption key generated and saved');
            } else {
                throw error;
            }
        }
    }

    encrypt(text) {
        if (!this.initialized || !this.encryptionKey) {
            throw new Error('EncryptionService not initialized');
        }

        try {
            const iv = crypto.randomBytes(IV_LENGTH);
            const cipher = crypto.createCipher(ALGORITHM, this.encryptionKey);
            cipher.setAAD(Buffer.from('sant-padharamani-data'));

            let encrypted = cipher.update(text, 'utf8', 'hex');
            encrypted += cipher.final('hex');

            const tag = cipher.getAuthTag();

            // Combine IV, tag, and encrypted data
            const combined = iv.toString('hex') + tag.toString('hex') + encrypted;
            
            return combined;
        } catch (error) {
            console.error('❌ Encryption failed:', error);
            throw new Error('Failed to encrypt data');
        }
    }

    decrypt(encryptedText) {
        if (!this.initialized || !this.encryptionKey) {
            throw new Error('EncryptionService not initialized');
        }

        try {
            // Extract IV, tag, and encrypted data
            const ivHex = encryptedText.slice(0, IV_LENGTH * 2);
            const tagHex = encryptedText.slice(IV_LENGTH * 2, (IV_LENGTH + TAG_LENGTH) * 2);
            const encrypted = encryptedText.slice((IV_LENGTH + TAG_LENGTH) * 2);

            const iv = Buffer.from(ivHex, 'hex');
            const tag = Buffer.from(tagHex, 'hex');

            const decipher = crypto.createDecipher(ALGORITHM, this.encryptionKey);
            decipher.setAAD(Buffer.from('sant-padharamani-data'));
            decipher.setAuthTag(tag);

            let decrypted = decipher.update(encrypted, 'hex', 'utf8');
            decrypted += decipher.final('utf8');

            return decrypted;
        } catch (error) {
            console.error('❌ Decryption failed:', error);
            throw new Error('Failed to decrypt data');
        }
    }

    encryptObject(obj) {
        const jsonString = JSON.stringify(obj);
        return this.encrypt(jsonString);
    }

    decryptObject(encryptedText) {
        const jsonString = this.decrypt(encryptedText);
        return JSON.parse(jsonString);
    }

    // Encrypt sensitive fields in user objects
    encryptUserSensitiveData(user) {
        const sensitiveUser = { ...user };
        
        // Encrypt sensitive fields
        if (user.email) {
            sensitiveUser.email_encrypted = this.encrypt(user.email);
            delete sensitiveUser.email; // Remove plaintext
        }
        
        if (user.name) {
            sensitiveUser.name_encrypted = this.encrypt(user.name);
            delete sensitiveUser.name; // Remove plaintext
        }
        
        return sensitiveUser;
    }

    decryptUserSensitiveData(encryptedUser) {
        const user = { ...encryptedUser };
        
        // Decrypt sensitive fields
        if (encryptedUser.email_encrypted) {
            user.email = this.decrypt(encryptedUser.email_encrypted);
            delete user.email_encrypted;
        }
        
        if (encryptedUser.name_encrypted) {
            user.name = this.decrypt(encryptedUser.name_encrypted);
            delete user.name_encrypted;
        }
        
        return user;
    }

    // Hash sensitive data (one-way encryption for searches)
    hashSensitiveData(data) {
        return crypto.createHash('sha256').update(data + 'sant-padharamani-salt').digest('hex');
    }

    // Encrypt file contents
    async encryptFile(filePath) {
        try {
            const data = await fs.readFile(filePath, 'utf8');
            const encryptedData = this.encrypt(data);
            await fs.writeFile(filePath + '.enc', encryptedData);
            console.log(`🔒 File encrypted: ${filePath}.enc`);
            return filePath + '.enc';
        } catch (error) {
            console.error('❌ File encryption failed:', error);
            throw error;
        }
    }

    // Decrypt file contents
    async decryptFile(encryptedFilePath, outputPath = null) {
        try {
            const encryptedData = await fs.readFile(encryptedFilePath, 'utf8');
            const decryptedData = this.decrypt(encryptedData);
            
            const outputFilePath = outputPath || encryptedFilePath.replace('.enc', '');
            await fs.writeFile(outputFilePath, decryptedData);
            console.log(`🔓 File decrypted: ${outputFilePath}`);
            return outputFilePath;
        } catch (error) {
            console.error('❌ File decryption failed:', error);
            throw error;
        }
    }

    // Generate secure random token
    generateSecureToken(length = 32) {
        return crypto.randomBytes(length).toString('hex');
    }

    // Secure password hashing (in addition to bcrypt)
    hashPassword(password) {
        const salt = crypto.randomBytes(16);
        const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512');
        return salt.toString('hex') + ':' + hash.toString('hex');
    }

    verifyPassword(password, hashedPassword) {
        const [salt, hash] = hashedPassword.split(':');
        const saltBuffer = Buffer.from(salt, 'hex');
        const hashBuffer = Buffer.from(hash, 'hex');
        const computedHash = crypto.pbkdf2Sync(password, saltBuffer, 100000, 64, 'sha512');
        return crypto.timingSafeEqual(hashBuffer, computedHash);
    }

    // Secure data comparison to prevent timing attacks
    secureCompare(a, b) {
        if (a.length !== b.length) {
            return false;
        }
        return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
    }

    // Get encryption stats
    getStats() {
        return {
            initialized: this.initialized,
            algorithm: ALGORITHM,
            keyLength: KEY_LENGTH,
            hasKey: !!this.encryptionKey,
            keyPath: ENCRYPTION_KEY_PATH
        };
    }
}

module.exports = EncryptionService;