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

        // Get from environment variables (direct value or secret manager path)
        const envValue = process.env[secretName.toUpperCase()] || process.env[secretName];
        if (envValue) {
            // If it's a secret manager path, read from file system
            if (envValue.startsWith('/secrets/')) {
                try {
                    const fs = require('fs');
                    const secretValue = fs.readFileSync(envValue, 'utf8').trim();
                    console.log(`✅ Found secret from mounted volume: ${envValue}`);
                    // Cache the secret
                    this.cache.set(cacheKey, {
                        value: secretValue,
                        timestamp: Date.now()
                    });
                    return secretValue;
                } catch (error) {
                    console.error(`❌ Failed to read secret from ${envValue}:`, error.message);
                    throw new Error(`Failed to read secret from ${envValue}: ${error.message}`);
                }
            } else {
                console.log(`✅ Found direct environment variable for ${secretName}`);
                // Cache the secret
                this.cache.set(cacheKey, {
                    value: envValue,
                    timestamp: Date.now()
                });
                return envValue;
            }
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
            // Check for GOOGLE_SERVICE_ACCOUNT_PATH first (Cloud Run mounted volume)
            if (process.env.GOOGLE_SERVICE_ACCOUNT_PATH) {
                const fs = require('fs');
                try {
                    const credentialsFile = fs.readFileSync(process.env.GOOGLE_SERVICE_ACCOUNT_PATH, 'utf8');
                    const credentials = JSON.parse(credentialsFile);
                    console.log('✅ Using service account credentials from mounted volume:', process.env.GOOGLE_SERVICE_ACCOUNT_PATH);
                    return credentials;
                } catch (fileError) {
                    console.error('❌ Failed to read credentials from GOOGLE_SERVICE_ACCOUNT_PATH:', fileError.message);
                    console.log('🔄 Volume mount may not be configured, trying other methods...');
                }
            }

            // Check for base64-encoded credentials in environment variable
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

            // Try getting JWT_SECRET from secret manager (if it contains credentials)
            try {
                const jwtSecret = await this.getSecret('jwt-secret');
                if (jwtSecret.startsWith('{')) {
                    // If JWT secret looks like JSON, it might be credentials
                    const credentials = JSON.parse(jwtSecret);
                    console.log('✅ Using service account credentials from JWT secret');
                    return credentials;
                }
            } catch (secretError) {
                console.log('⚠️ JWT secret not found or not JSON credentials');
            }

            // Try getting from google-service-account secret
            try {
                const credentialsJson = await this.getSecret('google-service-account');
                const credentials = JSON.parse(credentialsJson);
                console.log('✅ Using service account credentials from google-service-account secret');
                return credentials;
            } catch (secretError) {
                console.log('⚠️ No google-service-account secret found');
            }
            
            // For local development, try the GOOGLE_APPLICATION_CREDENTIALS file
            if (process.env.GOOGLE_APPLICATION_CREDENTIALS && process.env.GOOGLE_APPLICATION_CREDENTIALS.endsWith('.json')) {
                const fs = require('fs');
                try {
                    const credentialsFile = fs.readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS, 'utf8');
                    console.log('✅ Using local GOOGLE_APPLICATION_CREDENTIALS file');
                    return JSON.parse(credentialsFile);
                } catch (fileError) {
                    console.error('❌ Failed to read local credentials file:', fileError.message);
                }
            }
            
            // Try using Google Cloud default credentials (metadata service)
            try {
                const { GoogleAuth } = require('google-auth-library');
                const auth = new GoogleAuth({
                    scopes: ['https://www.googleapis.com/auth/spreadsheets']
                });
                const client = await auth.getClient();
                if (client && client.email) {
                    console.log('✅ Using Google Cloud default credentials (metadata service)');
                    // Return a compatible format
                    return {
                        client_email: client.email,
                        // Note: We'll use the auth client directly in GoogleSheetsService
                        _isDefaultCredentials: true,
                        _authClient: client
                    };
                }
            } catch (defaultError) {
                console.log('❌ Google Cloud default credentials not available:', defaultError.message);
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