const { google } = require('googleapis');
const secretManager = require('./secretManager');

class GoogleAuthConfig {
    constructor() {
        this.oauth2Client = null;
        this.serviceAuth = null;
        this.initialized = false;
    }

    /**
     * Initialize Google OAuth2 client
     */
    async initializeOAuth() {
        try {
            const secrets = await secretManager.getSecrets([
                'google-client-id',
                'google-client-secret'
            ]);

            const clientId = secrets['google-client-id'];
            const clientSecret = secrets['google-client-secret'];
            const redirectUri = process.env.GOOGLE_REDIRECT_URI || 
                (process.env.NODE_ENV === 'production' 
                    ? `https://${process.env.K_SERVICE}-${process.env.GOOGLE_CLOUD_PROJECT_ID}.a.run.app/auth/callback`
                    : 'http://localhost:8080/auth/callback');

            if (!clientId || !clientSecret) {
                throw new Error('Google OAuth credentials not found');
            }

            this.oauth2Client = new google.auth.OAuth2(
                clientId,
                clientSecret,
                redirectUri
            );

            console.log('Google OAuth2 client initialized');
            return this.oauth2Client;
        } catch (error) {
            console.error('Failed to initialize Google OAuth2 client:', error.message);
            throw error;
        }
    }

    /**
     * Initialize Google service account auth for Sheets and Calendar API
     */
    async initializeServiceAuth() {
        try {
            const credentials = await secretManager.getServiceAccountCredentials();

            this.serviceAuth = new google.auth.JWT(
                credentials.client_email,
                null,
                credentials.private_key,
                [
                    'https://www.googleapis.com/auth/spreadsheets',
                    'https://www.googleapis.com/auth/calendar'
                ]
            );

            await this.serviceAuth.authorize();
            console.log('Google service account auth initialized');
            return this.serviceAuth;
        } catch (error) {
            console.error('Failed to initialize Google service account auth:', error.message);
            throw error;
        }
    }

    /**
     * Initialize all Google auth clients
     */
    async initialize() {
        if (this.initialized) {
            return;
        }

        try {
            await Promise.all([
                this.initializeOAuth(),
                this.initializeServiceAuth()
            ]);

            this.initialized = true;
            console.log('Google authentication initialized successfully');
        } catch (error) {
            console.error('Failed to initialize Google authentication:', error.message);
            throw error;
        }
    }

    /**
     * Get OAuth2 client (initialize if needed)
     */
    async getOAuthClient() {
        if (!this.oauth2Client) {
            await this.initializeOAuth();
        }
        return this.oauth2Client;
    }

    /**
     * Get service account auth (initialize if needed)
     */
    async getServiceAuth() {
        if (!this.serviceAuth) {
            await this.initializeServiceAuth();
        }
        return this.serviceAuth;
    }

    /**
     * Get Google Sheets client
     */
    async getSheetsClient() {
        const auth = await this.getServiceAuth();
        return google.sheets({ version: 'v4', auth });
    }

    /**
     * Get Google Calendar client
     */
    async getCalendarClient() {
        const auth = await this.getServiceAuth();
        return google.calendar({ version: 'v3', auth });
    }

    /**
     * Generate OAuth2 authorization URL
     */
    async getAuthUrl() {
        const oauth2Client = await this.getOAuthClient();
        
        return oauth2Client.generateAuthUrl({
            access_type: 'offline',
            scope: [
                'https://www.googleapis.com/auth/userinfo.profile',
                'https://www.googleapis.com/auth/userinfo.email'
            ],
            prompt: 'consent'
        });
    }

    /**
     * Exchange authorization code for tokens
     */
    async getTokens(code) {
        const oauth2Client = await this.getOAuthClient();
        const { tokens } = await oauth2Client.getToken(code);
        return tokens;
    }

    /**
     * Get user info from Google
     */
    async getUserInfo(accessToken) {
        const oauth2Client = await this.getOAuthClient();
        oauth2Client.setCredentials({ access_token: accessToken });

        const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
        const { data } = await oauth2.userinfo.get();
        
        return {
            id: data.id,
            email: data.email,
            name: data.name,
            picture: data.picture
        };
    }
}

// Create singleton instance
const googleAuthConfig = new GoogleAuthConfig();

module.exports = googleAuthConfig;