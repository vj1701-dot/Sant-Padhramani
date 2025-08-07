const jwt = require('jsonwebtoken');
const userService = require('../services/userService');

const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-this-in-production';

/**
 * Middleware to verify JWT tokens
 */
async function verifyToken(req, res, next) {
    try {
        const token = req.headers.authorization?.replace('Bearer ', '') || 
                     req.cookies?.token;

        if (!token) {
            return res.status(401).json({ error: 'No token provided' });
        }

        const decoded = jwt.verify(token, JWT_SECRET);
        
        // Verify user still exists and is approved
        const user = await userService.getUserById(decoded.id);
        if (!user || !user.isApproved) {
            return res.status(401).json({ error: 'Invalid token or user not approved' });
        }
        
        req.user = decoded;
        next();
    } catch (error) {
        console.error('Token verification failed:', error.message);
        return res.status(401).json({ error: 'Invalid token' });
    }
}

/**
 * Combined middleware for authentication (user approval is now checked in verifyToken)
 */
async function requireAuth(req, res, next) {
    await verifyToken(req, res, next);
}

/**
 * Generate JWT token
 */
function generateToken(user) {
    return jwt.sign(
        {
            id: user.id,
            email: user.email,
            name: user.name
        },
        JWT_SECRET,
        {
            expiresIn: '24h'
        }
    );
}

module.exports = {
    verifyToken,
    requireAuth,
    generateToken
};