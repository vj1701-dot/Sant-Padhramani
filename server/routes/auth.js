const express = require('express');
const jwt = require('jsonwebtoken');
const { getJwtSecret } = require('../middleware/auth');
const UserManagementService = require('../services/userManagementService');
const SessionManagementService = require('../services/sessionManagementService');

const router = express.Router();
const userService = new UserManagementService();
const sessionService = new SessionManagementService();

/**
 * POST /auth/login
 * Authenticates a user and returns a JWT.
 */
router.post('/login', async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required.' });
    }

    try {
        const user = await userService.authenticateUser(email, password);

        const secret = await getJwtSecret();
        
        // Create a payload for the token
        const payload = {
            id: user.id,
            email: user.email,
            name: user.name,
            isAdmin: user.isAdmin
        };

        // Create server-side session
        const userAgent = req.get('User-Agent');
        const ipAddress = req.ip || req.connection.remoteAddress;
        const sessionId = await sessionService.createSession(user.id, user.email, userAgent, ipAddress);

        // Track successful login for security monitoring
        if (global.securityService) {
            await global.securityService.trackSuccessfulLogin(user.email, ipAddress, userAgent, sessionId);
        }

        // Sign the token with session ID
        const tokenPayload = { ...payload, sessionId };
        const token = jwt.sign(tokenPayload, secret, { expiresIn: '1h' }); // Token expires in 1 hour

        // Send the token only in httpOnly cookie for security
        res.cookie('token', token, { 
            httpOnly: true, 
            secure: process.env.NODE_ENV === 'production', // Use secure cookies in production
            sameSite: 'strict',
            maxAge: 60 * 60 * 1000 // 1 hour
        });

        res.json({ 
            message: 'Login successful',
            user: payload,
            mustChangePassword: user.mustChangePassword || false
        });

    } catch (error) {
        console.error('Error during login:', error.message);
        
        // Track failed login for security monitoring
        if (global.securityService) {
            const userAgent = req.get('User-Agent');
            const ipAddress = req.ip || req.connection.remoteAddress;
            await global.securityService.trackFailedLogin(email, ipAddress, userAgent);
        }
        
        res.status(401).json({ error: 'Invalid credentials or account not approved.' });
    }
});

/**
 * POST /auth/logout
 * Clears the authentication cookie and destroys server-side session.
 */
router.post('/logout', async (req, res) => {
    const token = req.cookies.token || req.headers.authorization?.split(' ')[1];
    
    if (token) {
        try {
            const secret = await getJwtSecret();
            const decoded = jwt.verify(token, secret);
            
            if (decoded.sessionId) {
                await sessionService.destroySession(decoded.sessionId);
            }
        } catch (error) {
            console.error('Error during logout:', error.message);
            // Continue with logout even if session destruction fails
        }
    }
    
    res.clearCookie('token');
    res.json({ message: 'Logout successful' });
});

/**
 * POST /auth/change-password
 * Changes user password
 */
router.post('/change-password', async (req, res) => {
    const { currentPassword, newPassword } = req.body;
    const token = req.cookies.token || req.headers.authorization?.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Authentication required' });
    }

    if (!newPassword) {
        return res.status(400).json({ error: 'New password is required' });
    }

    try {
        const secret = await getJwtSecret();
        const decoded = jwt.verify(token, secret);
        
        const updatedUser = await userService.changePassword(decoded.email, currentPassword, newPassword);
        
        // Track password change for security monitoring
        if (global.securityService) {
            const ipAddress = req.ip || req.connection.remoteAddress;
            await global.securityService.trackPasswordChange(decoded.email, ipAddress, updatedUser.mustChangePassword);
        }
        
        res.json({ 
            message: 'Password changed successfully',
            user: updatedUser
        });

    } catch (error) {
        console.error('Error changing password:', error.message);
        if (error.message.includes('Password must')) {
            res.status(400).json({ error: error.message });
        } else {
            res.status(401).json({ error: 'Failed to change password' });
        }
    }
});

module.exports = router;
