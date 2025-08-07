const { SecretManagerServiceClient } = require('@google-cloud/secret-manager');

class SecretManager {
    constructor() {
        this.client = new SecretManagerServiceClient();
        this.projectId = process.env.GOOGLE_CLOUD_PROJECT_ID;
        this.cache = new Map();
        this.cacheExpiry = 5 * 60 * 1000; // 5 minutes
    }

    /**
     * Get a secret from Google Cloud Secret Manager or environment variable
     * @param {string} secretName - Name of the secret
     * @param {string} version - Version of the secret (default: 'latest')
     * @returns {Promise<string>} The secret value
     */
    async getSecret(secretName, version = 'latest') {
        // For local development, try environment variable first
        if (process.env.NODE_ENV === 'development') {
            const envValue = process.env[secretName.toUpperCase()];
            if (envValue) {
                return envValue;
            }
        }

        // Check cache first
        const cacheKey = `${secretName}:${version}`;
        const cached = this.cache.get(cacheKey);
        if (cached && (Date.now() - cached.timestamp) < this.cacheExpiry) {
            return cached.value;
        }

        try {
            // Cloud Run environment - get from Secret Manager
            const name = `projects/${this.projectId}/secrets/${secretName}/versions/${version}`;
            const [version_response] = await this.client.accessSecretVersion({ name });
            const secret = version_response.payload.data.toString();
            
            // Cache the secret
            this.cache.set(cacheKey, {
                value: secret,
                timestamp: Date.now()
            });
            
            return secret;
        } catch (error) {
            console.error(`Failed to retrieve secret ${secretName}:`, error.message);
            
            // Fallback to environment variable
            const envValue = process.env[secretName.toUpperCase()];
            if (envValue) {
                return envValue;
            }
            
            throw new Error(`Secret ${secretName} not found in Secret Manager or environment variables`);
        }
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
        try {
            const credentialsJson = await this.getSecret('google-service-account-credentials');
            return JSON.parse(credentialsJson);
        } catch (error) {
            console.error('Failed to get service account credentials:', error.message);
            
            // For local development, try the GOOGLE_APPLICATION_CREDENTIALS file
            if (process.env.NODE_ENV === 'development' && process.env.GOOGLE_APPLICATION_CREDENTIALS) {
                const fs = require('fs');
                try {
                    const credentialsFile = fs.readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS, 'utf8');
                    return JSON.parse(credentialsFile);
                } catch (fileError) {
                    console.error('Failed to read local credentials file:', fileError.message);
                }
            }
            
            throw new Error('Service account credentials not found');
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