const jwt = require('jsonwebtoken');
const secretManager = require('../config/secretManager');

let jwtSecret;

const getJwtSecret = async () => {
    if (jwtSecret) {
        return jwtSecret;
    }
    jwtSecret = await secretManager.getSecret('jwt-secret');
    if (!jwtSecret) {
        throw new Error('JWT secret is not configured in Secret Manager.');
    }
    return jwtSecret;
};

const requireAuth = async (req, res, next) => {
    const token = req.cookies.token || req.headers.authorization?.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Authentication required. No token provided.' });
    }

    try {
        const secret = await getJwtSecret();
        const decoded = jwt.verify(token, secret);
        
        // The decoded payload can be attached to the request if needed
        req.user = { email: decoded.email, name: decoded.name }; 
        
        next();
    } catch (error) {
        console.error('Authentication error:', error.message);
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({ error: 'Token has expired.' });
        }
        if (error.name === 'JsonWebTokenError') {
            return res.status(401).json({ error: 'Invalid token.' });
        }
        return res.status(500).json({ error: 'Failed to authenticate token.' });
    }
};

module.exports = { requireAuth, getJwtSecret };
