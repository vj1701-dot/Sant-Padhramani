const express = require('express');
const jwt = require('jsonwebtoken');
const { getJwtSecret } = require('../middleware/auth');
const UserManagementService = require('../services/userManagementService');

const router = express.Router();
const userService = new UserManagementService();

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

        // Sign the token
        const token = jwt.sign(payload, secret, { expiresIn: '1h' }); // Token expires in 1 hour

        // Send the token in a cookie or in the response body
        res.cookie('token', token, { 
            httpOnly: true, 
            secure: process.env.NODE_ENV === 'production', // Use secure cookies in production
            sameSite: 'strict' 
        });

        res.json({ 
            message: 'Login successful', 
            token: token,
            user: payload
        });

    } catch (error) {
        console.error('Error during login:', error.message);
        res.status(401).json({ error: 'Invalid credentials or account not approved.' });
    }
});

/**
 * POST /auth/logout
 * Clears the authentication cookie.
 */
router.post('/logout', (req, res) => {
    res.clearCookie('token');
    res.json({ message: 'Logout successful' });
});

module.exports = router;
