const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
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
const GoogleSheetsService = require('./services/googleSheetsService');
const UserManagementService = require('./services/userManagementService');

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
    message: 'Too many requests from this IP, please try again later.'
});
app.use('/api', limiter);

// CORS configuration
const corsOptions = {
    origin: '*',
    credentials: true,
    optionsSuccessStatus: 200
};
app.use(cors(corsOptions));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// Logging middleware
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
    next();
});

// Serve static files from client directory
app.use(express.static(path.join(__dirname, '../client')));

// Health check endpoint (before auth)
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'development'
    });
});

// Routes

app.use('/auth', authRoutes);
app.use('/api', apiRoutes);

// Handle client-side routing (serve index.html for all non-API routes)
app.get('*', (req, res) => {
    // Don't serve index.html for API or auth routes
    if (req.path.startsWith('/api') || req.path.startsWith('/auth')) {
        return res.status(404).json({ error: 'Not found' });
    }
    
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
        console.log('Initializing services...');
        
        // Initialize Google Sheets service
        const sheetsService = new GoogleSheetsService();
        await sheetsService.initialize();
        global.sheetsService = sheetsService;
        
        // Initialize User Management service
        const userService = new UserManagementService();
        await userService.initialize();
        global.userService = userService;
        
        console.log('Starting server...');
        app.listen(PORT, '0.0.0.0', () => {
            console.log(`Sant Padharamani Server running on port ${PORT}`);
            console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
            console.log(`Access the dashboard at: http://localhost:${PORT}`);
            console.log(`Login page: http://localhost:${PORT}/auth/login-page`);
        });
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}

// Handle graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down gracefully');
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('SIGINT received, shutting down gracefully');
    process.exit(0);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    // Don't exit in production, just log
    if (process.env.NODE_ENV !== 'production') {
        process.exit(1);
    }
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    process.exit(1);
});

// Start the server
startServer();