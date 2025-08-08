const jwt = require('jsonwebtoken');

let jwtSecret;

const getJwtSecret = async () => {
    if (jwtSecret) {
        return jwtSecret;
    }
    
    // Use environment variable (auto-generated in server/index.js if not provided)
    jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
        throw new Error('JWT secret is not configured in environment variables.');
    }
    
    console.log('✅ JWT secret loaded from environment variables');
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
        
        // Validate server-side session if sessionId is present
        if (decoded.sessionId && global.sessionService) {
            const session = await global.sessionService.getSession(decoded.sessionId);
            if (!session) {
                console.log(`🚨 Invalid or expired session: ${decoded.sessionId} for user: ${decoded.email}`);
                return res.status(401).json({ error: 'Session expired. Please login again.' });
            }
            
            // Validate session belongs to the same user
            if (session.userId !== decoded.id || session.email !== decoded.email) {
                console.log(`🚨 Session mismatch for user: ${decoded.email}`);
                return res.status(401).json({ error: 'Invalid session. Please login again.' });
            }
            
            req.session = session;
        }
        
        // The decoded payload can be attached to the request if needed
        req.user = { 
            id: decoded.id,
            email: decoded.email, 
            name: decoded.name,
            isAdmin: decoded.isAdmin
        }; 
        
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
