const fs = require('fs').promises;
const path = require('path');

const SECURITY_LOG_PATH = path.join(__dirname, '../data/security.log');
const ALERT_THRESHOLD = {
    FAILED_LOGINS_PER_IP: 10, // per hour
    MULTIPLE_USERS_SAME_IP: 5, // concurrent sessions
    SUSPICIOUS_USER_AGENTS: ['bot', 'crawler', 'scanner', 'hack']
};

class SecurityMonitoringService {
    constructor() {
        this.initialized = false;
        this.alerts = [];
        this.ipTracker = new Map(); // Track IPs and their activity
        this.suspiciousActivity = new Map();
    }

    async initialize() {
        try {
            // Ensure data directory exists
            const dataDir = path.dirname(SECURITY_LOG_PATH);
            await fs.mkdir(dataDir, { recursive: true });
            
            this.initialized = true;
            console.log('✅ SecurityMonitoringService initialized successfully');
            
            // Log initialization
            await this.logSecurityEvent('SYSTEM_START', {
                message: 'Security monitoring system initialized',
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            console.error('❌ Failed to initialize SecurityMonitoringService:', error);
            throw error;
        }
    }

    async logSecurityEvent(eventType, details) {
        const logEntry = {
            timestamp: new Date().toISOString(),
            type: eventType,
            details: details,
            severity: this.getSeverity(eventType)
        };

        try {
            const logLine = JSON.stringify(logEntry) + '\n';
            await fs.appendFile(SECURITY_LOG_PATH, logLine);
            
            // Check if this event requires immediate attention
            if (logEntry.severity === 'HIGH' || logEntry.severity === 'CRITICAL') {
                await this.generateAlert(logEntry);
            }
        } catch (error) {
            console.error('❌ Failed to log security event:', error);
        }
    }

    getSeverity(eventType) {
        const severityMap = {
            'FAILED_LOGIN': 'MEDIUM',
            'ACCOUNT_LOCKED': 'HIGH',
            'MULTIPLE_FAILED_LOGINS': 'HIGH',
            'SUSPICIOUS_USER_AGENT': 'MEDIUM',
            'CORS_VIOLATION': 'HIGH',
            'SESSION_HIJACK_ATTEMPT': 'CRITICAL',
            'INVALID_SESSION': 'HIGH',
            'PASSWORD_CHANGE': 'LOW',
            'SUCCESSFUL_LOGIN': 'LOW',
            'LOGOUT': 'LOW',
            'SYSTEM_START': 'INFO'
        };
        
        return severityMap[eventType] || 'MEDIUM';
    }

    async trackFailedLogin(email, ipAddress, userAgent) {
        const key = `${ipAddress}_${Date.now() - (Date.now() % (60 * 60 * 1000))}`; // Hour-based key
        
        if (!this.ipTracker.has(key)) {
            this.ipTracker.set(key, { count: 0, emails: new Set(), userAgents: new Set() });
        }
        
        const tracker = this.ipTracker.get(key);
        tracker.count += 1;
        tracker.emails.add(email);
        tracker.userAgents.add(userAgent);
        
        await this.logSecurityEvent('FAILED_LOGIN', {
            email: email,
            ipAddress: ipAddress,
            userAgent: userAgent,
            attemptCount: tracker.count
        });
        
        // Check for suspicious patterns
        if (tracker.count >= ALERT_THRESHOLD.FAILED_LOGINS_PER_IP) {
            await this.logSecurityEvent('MULTIPLE_FAILED_LOGINS', {
                ipAddress: ipAddress,
                totalAttempts: tracker.count,
                targetedEmails: Array.from(tracker.emails),
                userAgents: Array.from(tracker.userAgents)
            });
        }
        
        // Check for suspicious user agents
        const suspiciousUA = ALERT_THRESHOLD.SUSPICIOUS_USER_AGENTS.find(
            pattern => userAgent.toLowerCase().includes(pattern)
        );
        
        if (suspiciousUA) {
            await this.logSecurityEvent('SUSPICIOUS_USER_AGENT', {
                ipAddress: ipAddress,
                userAgent: userAgent,
                suspiciousPattern: suspiciousUA,
                email: email
            });
        }
    }

    async trackSuccessfulLogin(email, ipAddress, userAgent, sessionId) {
        await this.logSecurityEvent('SUCCESSFUL_LOGIN', {
            email: email,
            ipAddress: ipAddress,
            userAgent: userAgent,
            sessionId: sessionId
        });
        
        // Clear failed login tracking for this IP
        const hourKey = `${ipAddress}_${Date.now() - (Date.now() % (60 * 60 * 1000))}`;
        if (this.ipTracker.has(hourKey)) {
            this.ipTracker.delete(hourKey);
        }
    }

    async trackAccountLocked(email, ipAddress, attempts) {
        await this.logSecurityEvent('ACCOUNT_LOCKED', {
            email: email,
            ipAddress: ipAddress,
            failedAttempts: attempts,
            lockoutDuration: '15 minutes'
        });
    }

    async trackSessionEvent(eventType, sessionId, email, details = {}) {
        await this.logSecurityEvent(eventType, {
            sessionId: sessionId,
            email: email,
            ...details
        });
    }

    async trackCorsViolation(origin, ipAddress, userAgent) {
        await this.logSecurityEvent('CORS_VIOLATION', {
            origin: origin,
            ipAddress: ipAddress,
            userAgent: userAgent
        });
    }

    async generateAlert(logEntry) {
        const alert = {
            id: Date.now().toString(36) + Math.random().toString(36).substr(2),
            timestamp: logEntry.timestamp,
            type: logEntry.type,
            severity: logEntry.severity,
            details: logEntry.details,
            acknowledged: false
        };
        
        this.alerts.push(alert);
        
        // Keep only the last 100 alerts
        if (this.alerts.length > 100) {
            this.alerts = this.alerts.slice(-100);
        }
        
        console.log(`🚨 SECURITY ALERT [${alert.severity}]: ${alert.type} - ${JSON.stringify(alert.details)}`);
        
        // In a production environment, you could send notifications here
        // e.g., email, Slack, SMS, etc.
    }

    async getSecurityStats() {
        try {
            const logContent = await fs.readFile(SECURITY_LOG_PATH, 'utf8');
            const logLines = logContent.trim().split('\n').filter(line => line);
            
            const last24Hours = Date.now() - (24 * 60 * 60 * 1000);
            const recentEvents = logLines
                .map(line => JSON.parse(line))
                .filter(event => new Date(event.timestamp).getTime() > last24Hours);
            
            const stats = {
                totalEvents: logLines.length,
                last24Hours: recentEvents.length,
                eventsByType: {},
                eventsBySeverity: {},
                topIPs: {},
                recentAlerts: this.alerts.slice(-10),
                activeAlerts: this.alerts.filter(a => !a.acknowledged)
            };
            
            // Analyze recent events
            recentEvents.forEach(event => {
                stats.eventsByType[event.type] = (stats.eventsByType[event.type] || 0) + 1;
                stats.eventsBySeverity[event.severity] = (stats.eventsBySeverity[event.severity] || 0) + 1;
                
                if (event.details.ipAddress) {
                    stats.topIPs[event.details.ipAddress] = (stats.topIPs[event.details.ipAddress] || 0) + 1;
                }
            });
            
            return stats;
        } catch (error) {
            console.error('❌ Failed to generate security stats:', error);
            return {
                error: 'Failed to load security statistics',
                recentAlerts: this.alerts.slice(-10),
                activeAlerts: this.alerts.filter(a => !a.acknowledged)
            };
        }
    }

    async acknowledgeAlert(alertId) {
        const alert = this.alerts.find(a => a.id === alertId);
        if (alert) {
            alert.acknowledged = true;
            alert.acknowledgedAt = new Date().toISOString();
            
            await this.logSecurityEvent('ALERT_ACKNOWLEDGED', {
                alertId: alertId,
                alertType: alert.type
            });
            
            return true;
        }
        return false;
    }

    async getSecurityLog(limit = 100) {
        try {
            const logContent = await fs.readFile(SECURITY_LOG_PATH, 'utf8');
            const logLines = logContent.trim().split('\n').filter(line => line);
            
            return logLines
                .slice(-limit)
                .map(line => JSON.parse(line))
                .reverse(); // Most recent first
        } catch (error) {
            console.error('❌ Failed to read security log:', error);
            return [];
        }
    }

    // Method to be called by middleware to track requests
    async trackRequest(req) {
        const suspiciousUA = ALERT_THRESHOLD.SUSPICIOUS_USER_AGENTS.find(
            pattern => req.get('User-Agent')?.toLowerCase().includes(pattern)
        );
        
        if (suspiciousUA) {
            await this.logSecurityEvent('SUSPICIOUS_USER_AGENT', {
                ipAddress: req.ip,
                userAgent: req.get('User-Agent'),
                path: req.path,
                method: req.method,
                suspiciousPattern: suspiciousUA
            });
        }
    }

    // Method to track password changes
    async trackPasswordChange(email, ipAddress, forced = false) {
        await this.logSecurityEvent('PASSWORD_CHANGE', {
            email: email,
            ipAddress: ipAddress,
            forced: forced
        });
    }
}

module.exports = SecurityMonitoringService;