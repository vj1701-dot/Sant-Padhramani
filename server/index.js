const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');
const path = require('path');
require('dotenv').config();
const crypto = require('crypto');

// Auto-generate JWT secret if not provided
if (!process.env.JWT_SECRET) {
    process.env.JWT_SECRET = crypto.randomBytes(64).toString('hex');
    console.log('Auto-generated JWT_SECRET for this session');
}

const authRoutes = require('./routes/auth');
const apiRoutes = require('./routes/api');

// Import services for initialization
const JsonStorageService = require('./services/jsonStorageService');
const BackupService = require('./services/backupService');
const SchedulerService = require('./services/schedulerService');
const UserManagementService = require('./services/userManagementService');
const SessionManagementService = require('./services/sessionManagementService');
const SecurityMonitoringService = require('./services/securityMonitoringService');
const EncryptionService = require('./services/encryptionService');

const app = express();

const PORT = process.env.PORT || 8080;

// Security middleware
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.tailwindcss.com"],
            scriptSrcAttr: ["'unsafe-inline'"],
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc: ["'self'", "https://cdn.tailwindcss.com", "https://unpkg.com", "https://t.me", "https://maps.google.com", "https://telegram.org"],
            scriptSrc: ["'self'", "'unsafe-inline'", "https://unpkg.com", "https://cdn.tailwindcss.com", "https://telegram.org"],
            fontSrc: ["'self'", "https:"],
            objectSrc: ["'none'"],
            mediaSrc: ["'self'"],
            frameSrc: ["'none'"]
        }
    }
}));

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windowMs
    message: 'Too many requests from this IP, please try again later.',
    keyGenerator: (req, res) => {
        if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
            try {
                const token = req.headers.authorization.split(' ')[1];
                const decoded = jwt.verify(token, process.env.JWT_SECRET);
                return decoded.userId; // Use user ID from JWT as key
            } catch (error) {
                // Fallback to IP if JWT is invalid
                return req.ip;
            }
        }
        return req.ip; // Fallback to IP if no JWT
    },
    skipFailedRequests: true // Skip validation of trust proxy
});
app.use('/api', limiter);

// CORS configuration
const corsOptions = {
    origin: function (origin, callback) {
        // Allow same origin requests (no origin header)
        if (!origin) return callback(null, true);
        
        // Allow requests from Cloud Run domains and localhost for development
        const allowedOrigins = [
            /^https:\/\/sant-padhramani-.*\.run\.app$/,
            /^https:\/\/sant-padhramani-.*\.a\.run\.app$/,
            'http://localhost:8080',
            'http://localhost:3000',
            'http://127.0.0.1:8080'
        ];
        
        const isAllowed = allowedOrigins.some(pattern => {
            if (typeof pattern === 'string') {
                return origin === pattern;
            }
            return pattern.test(origin);
        });
        
        if (isAllowed) {
            callback(null, true);
        } else {
            console.log(`🚨 CORS blocked request from: ${origin}`);
            // Track CORS violation for security monitoring
            if (global.securityService) {
                global.securityService.trackCorsViolation(origin, 'unknown', 'unknown');
            }
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
    optionsSuccessStatus: 200
};
app.use(cors(corsOptions));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// Force HTTPS redirect middleware (production only)
app.use((req, res, next) => {
    if (process.env.NODE_ENV === 'production' && req.headers['x-forwarded-proto'] !== 'https') {
        console.log(`🔒 Redirecting HTTP to HTTPS: ${req.url}`);
        return res.redirect(301, `https://${req.get('Host')}${req.url}`);
    }
    next();
});

// Security logging middleware
app.use(async (req, res, next) => {
    const timestamp = new Date().toISOString();
    const userAgent = req.get('User-Agent') || 'Unknown';
    const ip = req.ip || req.connection.remoteAddress || 'Unknown';
    
    console.log(`${timestamp} - ${req.method} ${req.path} - IP: ${ip} - UA: ${userAgent.substring(0, 100)}`);
    
    // Track suspicious requests
    if (global.securityService) {
        await global.securityService.trackRequest(req);
    }
    
    next();
});

// Serve static files from client directory
app.use((req, res, next) => {
    const staticPath = path.join(__dirname, '../client');
    const requestedPath = req.path;
    const fullPath = path.join(staticPath, requestedPath);
    
    // Check if the requested path is for a static file
    if (requestedPath.includes('.') || requestedPath.endsWith('/')) { // Simple check for file extension or directory
        console.log(`Static file request: ${requestedPath} -> ${fullPath}`);
    }
    next();
});
app.use(express.static(path.join(__dirname, '../client')));
console.log('Serving static files from:', path.join(__dirname, '../client'));

// Health check endpoint (before auth)
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'development'
    });
});

// Import backup routes
const backupRoutes = require('./routes/backup');

// Routes
app.use('/auth', authRoutes);
app.use('/api', apiRoutes);
app.use('/backup', backupRoutes);

// Handle client-side routing (serve index.html for all non-API routes)
app.get('*', (req, res) => {
    console.log(`Catch-all route hit for: ${req.path}`);
    // Don't serve index.html for API routes
    if (req.path.startsWith('/api')) {
        console.log(`Returning 404 for API route: ${req.path}`);
        return res.status(404).json({ error: 'Not found' });
    }
    
    console.log(`Serving index.html for: ${req.path}`);
    res.sendFile(path.join(__dirname, '../client/index.html'));
});

// Global error handling middleware
app.use((error, req, res, next) => {
    console.error('Global Error Handler:', error);
    
    res.status(error.status || 500).json({
        error: 'Internal Server Error',
        message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong',
        timestamp: new Date().toISOString()
    });
});

// Initialize services and start server
async function startServer() {
    try {
        console.log('🚀 Starting Sant Padharamani server initialization...');
        console.log('🔧 Environment variables check:', {
            NODE_ENV: process.env.NODE_ENV,
            PORT: process.env.PORT,
            JWT_SECRET: process.env.JWT_SECRET ? 'Present' : 'Missing',
            BACKUP_BUCKET_NAME: process.env.BACKUP_BUCKET_NAME || 'sant-padharamani-backups'
        });
        
        console.log('🔧 Initializing services...');
        
        // Initialize Encryption service first (other services may depend on it)
        console.log('🔐 Initializing EncryptionService...');
        try {
            const encryptionService = new EncryptionService();
            await encryptionService.initialize();
            global.encryptionService = encryptionService;
            console.log('✅ EncryptionService initialized successfully.');
        } catch (error) {
            console.error('❌ Failed to initialize EncryptionService:', error.message);
            throw error;
        }
        
        // Initialize JSON Storage service
        console.log('📂 Initializing JsonStorageService...');
        try {
            const jsonStorage = new JsonStorageService();
            await jsonStorage.initialize();
            global.jsonStorage = jsonStorage;
            console.log('✅ JsonStorageService initialized successfully.');
        } catch (error) {
            console.error('❌ Failed to initialize JsonStorageService:', error.message);
            throw error;
        }
        
        // Initialize Backup service
        console.log('☁️ Initializing BackupService...');
        try {
            const backupService = new BackupService(global.jsonStorage);
            await backupService.initialize();
            global.backupService = backupService;
            console.log('✅ BackupService initialized successfully.');
        } catch (error) {
            console.error('❌ Failed to initialize BackupService:', error.message);
            // Don't throw error - backup service can work in local mode
            console.log('⚠️ BackupService will work in local-only mode');
        }
        
        // Initialize Scheduler service
        console.log('⏰ Initializing SchedulerService...');
        try {
            const schedulerService = new SchedulerService(global.backupService);
            await schedulerService.initialize();
            global.schedulerService = schedulerService;
            console.log('✅ SchedulerService initialized successfully.');
        } catch (error) {
            console.error('❌ Failed to initialize SchedulerService:', error.message);
            // Don't throw error - continue without scheduled backups
            console.log('⚠️ Scheduled backups will not be available');
        }
        
        // Initialize User Management service
        console.log('👥 Initializing UserManagementService...');
        try {
            const userService = new UserManagementService();
            await userService.initialize();
            global.userService = userService;
            console.log('✅ UserManagementService initialized successfully.');
        } catch (error) {
            console.error('❌ Failed to initialize UserManagementService:', error.message);
            throw error;
        }

        // Initialize Session Management service
        console.log('🔐 Initializing SessionManagementService...');
        try {
            const sessionService = new SessionManagementService();
            await sessionService.initialize();
            global.sessionService = sessionService;
            console.log('✅ SessionManagementService initialized successfully.');
        } catch (error) {
            console.error('❌ Failed to initialize SessionManagementService:', error.message);
            throw error;
        }

        // Initialize Security Monitoring service
        console.log('🛡️ Initializing SecurityMonitoringService...');
        try {
            const securityService = new SecurityMonitoringService();
            await securityService.initialize();
            global.securityService = securityService;
            console.log('✅ SecurityMonitoringService initialized successfully.');
        } catch (error) {
            console.error('❌ Failed to initialize SecurityMonitoringService:', error.message);
            throw error;
        }
        
        console.log('🌐 Starting HTTP server...');
        app.listen(PORT, '0.0.0.0', () => {
            console.log('🎉 Sant Padharamani Server started successfully!');
            console.log(`📍 Port: ${PORT}`);
            console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
            console.log(`🔗 Dashboard URL: http://localhost:${PORT}`);
            console.log(`🔐 Login page: http://localhost:${PORT}/auth/login-page`);
            console.log('✅ Server is ready to accept connections');
        });
    } catch (error) {
        console.error('❌ Failed to start server:', error);
        console.error('🔍 Error details:', {
            name: error.name,
            message: error.message,
            stack: error.stack
        });
        process.exit(1);
    }
}

// Handle graceful shutdown
process.on('SIGTERM', () => {
    console.log('🛑 SIGTERM received, shutting down gracefully');
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('🛑 SIGINT received, shutting down gracefully');
    process.exit(0);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
    console.error('⚠️ Unhandled Promise Rejection detected:');
    console.error('📍 Promise:', promise);
    console.error('💥 Reason:', reason);
    // Don't exit in production, just log
    if (process.env.NODE_ENV !== 'production') {
        console.error('🚨 Exiting due to unhandled promise rejection (development mode)');
        process.exit(1);
    }
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    console.error('💥 Uncaught Exception detected:', error);
    console.error('🔍 Error details:', {
        name: error.name,
        message: error.message,
        stack: error.stack
    });
    process.exit(1);
});

// Start the server
startServer();