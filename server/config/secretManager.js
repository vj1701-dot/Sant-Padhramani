const { SecretManagerServiceClient } = require('@google-cloud/secret-manager');

class SecretManager {
    constructor() {
        this.client = new SecretManagerServiceClient();
        this.projectId = process.env.GOOGLE_CLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT_ID;
        if (!this.projectId) {
            throw new Error('GOOGLE_CLOUD_PROJECT environment variable is not set. Unable to determine project ID for Secret Manager.');
        }
        console.log(`SecretManager initialized with projectId: ${this.projectId}`);
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
        // First check environment variables (for simple deployment or local dev)
        const envValue = process.env[secretName.toUpperCase()];
        if (envValue) {
            console.log(`Using environment variable for ${secretName}`);
            return envValue;
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
            console.error(`Failed to retrieve secret ${secretName} for project ${this.projectId}:`, error.message);
            
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
            // Check for base64-encoded credentials in environment variable first
            if (process.env.GOOGLE_SERVICE_ACCOUNT_CREDENTIALS) {
                try {
                    const decoded = Buffer.from(process.env.GOOGLE_SERVICE_ACCOUNT_CREDENTIALS, 'base64').toString();
                    const credentials = JSON.parse(decoded);
                    console.log('Using base64-encoded service account credentials from environment');
                    return credentials;
                } catch (decodeError) {
                    // If base64 decode fails, try as direct JSON
                    try {
                        const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_CREDENTIALS);
                        console.log('Using direct JSON service account credentials from environment');
                        return credentials;
                    } catch (jsonError) {
                        console.error('Failed to parse service account credentials from environment:', jsonError.message);
                    }
                }
            }

            // Try Secret Manager
            const credentialsJson = await this.getSecret('google-service-account-credentials');
            return JSON.parse(credentialsJson);
        } catch (error) {
            console.error('Failed to get service account credentials:', error.message);
            
            // For local development, try the GOOGLE_APPLICATION_CREDENTIALS file
            if (process.env.GOOGLE_APPLICATION_CREDENTIALS && process.env.GOOGLE_APPLICATION_CREDENTIALS.endsWith('.json')) {
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