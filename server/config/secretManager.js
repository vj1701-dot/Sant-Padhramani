// Simple environment variable manager - no Secret Manager needed
// All secrets are provided via Cloud Run environment variables

class SecretManager {
    constructor() {
        console.log('🔧 SecretManager initialized - using environment variables only');
        this.cache = new Map();
        this.cacheExpiry = 5 * 60 * 1000; // 5 minutes
    }

    /**
     * Get a secret from environment variables
     * @param {string} secretName - Name of the secret
     * @param {string} version - Version of the secret (ignored, for compatibility)
     * @returns {Promise<string>} The secret value
     */
    async getSecret(secretName, version = 'latest') {
        console.log(`🔍 Getting secret: ${secretName}`);
        
        // Check cache first
        const cacheKey = `${secretName}:${version}`;
        const cached = this.cache.get(cacheKey);
        if (cached && (Date.now() - cached.timestamp) < this.cacheExpiry) {
            console.log(`📋 Using cached value for ${secretName}`);
            return cached.value;
        }

        // Get from environment variables
        const envValue = process.env[secretName.toUpperCase()] || process.env[secretName];
        if (envValue) {
            console.log(`✅ Found environment variable for ${secretName}`);
            // Cache the secret
            this.cache.set(cacheKey, {
                value: envValue,
                timestamp: Date.now()
            });
            return envValue;
        }
        
        console.error(`❌ Secret ${secretName} not found in environment variables`);
        throw new Error(`Secret ${secretName} not found in environment variables`);
    }

    /**
     * Get multiple secrets at once
     * @param {string[]} secretNames - Array of secret names
     * @returns {Promise<Object>} Object with secret names as keys and values as secrets
     */
    async getSecrets(secretNames) {
        const secrets = {};
        const promises = secretNames.map(async (name) => {
            try {
                secrets[name] = await this.getSecret(name);
            } catch (error) {
                console.error(`Failed to get secret ${name}:`, error.message);
                secrets[name] = null;
            }
        });
        
        await Promise.all(promises);
        return secrets;
    }

    /**
     * Get Google service account credentials
     * @returns {Promise<Object>} Service account credentials object
     */
    async getServiceAccountCredentials() {
        console.log('🔍 Getting Google service account credentials...');
        
        try {
            // Check for base64-encoded credentials in environment variable first
            if (process.env.GOOGLE_SERVICE_ACCOUNT_CREDENTIALS) {
                try {
                    const decoded = Buffer.from(process.env.GOOGLE_SERVICE_ACCOUNT_CREDENTIALS, 'base64').toString();
                    const credentials = JSON.parse(decoded);
                    console.log('✅ Using base64-encoded service account credentials from environment');
                    return credentials;
                } catch (decodeError) {
                    // If base64 decode fails, try as direct JSON
                    try {
                        const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_CREDENTIALS);
                        console.log('✅ Using direct JSON service account credentials from environment');
                        return credentials;
                    } catch (jsonError) {
                        console.error('❌ Failed to parse service account credentials from environment:', jsonError.message);
                    }
                }
            }

            // Try getting from environment variable as secret
            try {
                const credentialsJson = await this.getSecret('google-service-account-credentials');
                const credentials = JSON.parse(credentialsJson);
                console.log('✅ Using service account credentials from environment secret');
                return credentials;
            } catch (secretError) {
                console.log('⚠️ No service account credentials found in secrets');
            }
            
            // For local development, try the GOOGLE_APPLICATION_CREDENTIALS file
            if (process.env.GOOGLE_APPLICATION_CREDENTIALS && process.env.GOOGLE_APPLICATION_CREDENTIALS.endsWith('.json')) {
                const fs = require('fs');
                try {
                    const credentialsFile = fs.readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS, 'utf8');
                    console.log('✅ Using local credentials file');
                    return JSON.parse(credentialsFile);
                } catch (fileError) {
                    console.error('❌ Failed to read local credentials file:', fileError.message);
                }
            }
            
            throw new Error('Service account credentials not found in any location');
        } catch (error) {
            console.error('❌ Failed to get service account credentials:', error.message);
            throw error;
        }
    }

    /**
     * Clear the cache (useful for testing or forced refresh)
     */
    clearCache() {
        this.cache.clear();
    }
}

// Create a singleton instance
const secretManager = new SecretManager();

module.exports = secretManager;