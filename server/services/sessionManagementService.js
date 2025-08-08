const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

const SESSIONS_FILE_PATH = path.join(__dirname, '../data/sessions.json');
const SESSION_TIMEOUT = 60 * 60 * 1000; // 1 hour

class SessionManagementService {
    constructor() {
        this.initialized = false;
        this.sessions = new Map();
        this.cleanupInterval = null;
    }

    async initialize() {
        try {
            // Ensure data directory exists
            const dataDir = path.dirname(SESSIONS_FILE_PATH);
            await fs.mkdir(dataDir, { recursive: true });
            
            // Load existing sessions
            await this.loadSessions();
            
            // Start cleanup timer
            this.startCleanupTimer();
            
            this.initialized = true;
            console.log(`✅ SessionManagementService initialized with ${this.sessions.size} active sessions`);
        } catch (error) {
            console.error('❌ Failed to initialize SessionManagementService:', error);
            throw error;
        }
    }

    async loadSessions() {
        try {
            const data = await fs.readFile(SESSIONS_FILE_PATH, 'utf8');
            const sessionsData = JSON.parse(data);
            
            // Convert array back to Map and filter expired sessions
            const now = Date.now();
            sessionsData.forEach(session => {
                if (session.expiresAt > now) {
                    this.sessions.set(session.sessionId, session);
                }
            });
        } catch (error) {
            if (error.code === 'ENOENT') {
                // File doesn't exist, start with empty sessions
                this.sessions = new Map();
                await this.saveSessions();
            } else {
                throw error;
            }
        }
    }

    async saveSessions() {
        try {
            // Convert Map to array for JSON serialization
            const sessionsArray = Array.from(this.sessions.values());
            await fs.writeFile(SESSIONS_FILE_PATH, JSON.stringify(sessionsArray, null, 2));
        } catch (error) {
            console.error('❌ Failed to save sessions:', error);
        }
    }

    generateSessionId() {
        return crypto.randomBytes(32).toString('hex');
    }

    async createSession(userId, email, userAgent, ipAddress) {
        const sessionId = this.generateSessionId();
        const now = Date.now();
        const session = {
            sessionId,
            userId,
            email,
            userAgent: userAgent || 'Unknown',
            ipAddress: ipAddress || 'Unknown',
            createdAt: now,
            lastAccessedAt: now,
            expiresAt: now + SESSION_TIMEOUT
        };

        this.sessions.set(sessionId, session);
        await this.saveSessions();
        
        console.log(`✅ Session created for user: ${email} - ID: ${sessionId}`);
        return sessionId;
    }

    async getSession(sessionId) {
        const session = this.sessions.get(sessionId);
        if (!session) {
            return null;
        }

        const now = Date.now();
        if (session.expiresAt < now) {
            // Session expired
            await this.destroySession(sessionId);
            return null;
        }

        // Update last accessed time and extend expiration
        session.lastAccessedAt = now;
        session.expiresAt = now + SESSION_TIMEOUT;
        await this.saveSessions();

        return session;
    }

    async destroySession(sessionId) {
        const session = this.sessions.get(sessionId);
        if (session) {
            console.log(`🗑️ Session destroyed for user: ${session.email} - ID: ${sessionId}`);
            this.sessions.delete(sessionId);
            await this.saveSessions();
        }
    }

    async destroyAllUserSessions(userId) {
        const userSessions = Array.from(this.sessions.values()).filter(s => s.userId === userId);
        
        for (const session of userSessions) {
            this.sessions.delete(session.sessionId);
        }

        if (userSessions.length > 0) {
            console.log(`🗑️ Destroyed ${userSessions.length} sessions for user ID: ${userId}`);
            await this.saveSessions();
        }

        return userSessions.length;
    }

    async getUserSessions(userId) {
        return Array.from(this.sessions.values()).filter(s => s.userId === userId);
    }

    async getAllActiveSessions() {
        return Array.from(this.sessions.values());
    }

    startCleanupTimer() {
        // Clean up expired sessions every 15 minutes
        this.cleanupInterval = setInterval(async () => {
            await this.cleanupExpiredSessions();
        }, 15 * 60 * 1000);
    }

    async cleanupExpiredSessions() {
        const now = Date.now();
        let cleanedCount = 0;

        for (const [sessionId, session] of this.sessions) {
            if (session.expiresAt < now) {
                this.sessions.delete(sessionId);
                cleanedCount++;
            }
        }

        if (cleanedCount > 0) {
            console.log(`🧹 Cleaned up ${cleanedCount} expired sessions`);
            await this.saveSessions();
        }
    }

    getActiveSessionCount() {
        return this.sessions.size;
    }

    async getSessionStats() {
        const now = Date.now();
        const sessions = Array.from(this.sessions.values());
        
        const stats = {
            totalActiveSessions: sessions.length,
            userCounts: {},
            recentActivity: sessions.filter(s => (now - s.lastAccessedAt) < (15 * 60 * 1000)).length,
            oldestSession: null,
            newestSession: null
        };

        // Count sessions per user
        sessions.forEach(session => {
            stats.userCounts[session.email] = (stats.userCounts[session.email] || 0) + 1;
        });

        // Find oldest and newest sessions
        if (sessions.length > 0) {
            sessions.sort((a, b) => a.createdAt - b.createdAt);
            stats.oldestSession = {
                email: sessions[0].email,
                createdAt: new Date(sessions[0].createdAt).toISOString()
            };
            stats.newestSession = {
                email: sessions[sessions.length - 1].email,
                createdAt: new Date(sessions[sessions.length - 1].createdAt).toISOString()
            };
        }

        return stats;
    }
}

module.exports = SessionManagementService;