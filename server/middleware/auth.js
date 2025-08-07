const jwt = require('jsonwebtoken');
const secretManager = require('../config/secretManager');
const { getSheetsClient } = require('../services/sheetsService');

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

        const jwtSecret = await secretManager.getSecret('jwt-secret');
        const decoded = jwt.verify(token, jwtSecret);
        
        req.user = decoded;
        next();
    } catch (error) {
        console.error('Token verification failed:', error.message);
        return res.status(401).json({ error: 'Invalid token' });
    }
}

/**
 * Middleware to check if user is approved
 */
async function checkApprovedUser(req, res, next) {
    try {
        if (!req.user?.email) {
            return res.status(401).json({ error: 'No user email found' });
        }

        const isApproved = await checkUserApproval(req.user.email);
        
        if (!isApproved) {
            return res.status(403).json({ 
                error: 'Access denied. Your email is not in the approved users list.' 
            });
        }

        next();
    } catch (error) {
        console.error('User approval check failed:', error.message);
        return res.status(500).json({ error: 'Failed to verify user approval' });
    }
}

/**
 * Check if user email is in the approved users list
 */
async function checkUserApproval(email) {
    try {
        const sheetsClient = await getSheetsClient();
        const approvedUsersSheetId = await secretManager.getSecret('approved-users-sheet-id');

        // Get approved users from the Google Sheet
        const response = await sheetsClient.spreadsheets.values.get({
            spreadsheetId: approvedUsersSheetId,
            range: 'Sheet1!A:A', // Assuming emails are in column A
        });

        const approvedEmails = response.data.values?.flat() || [];
        return approvedEmails.includes(email.toLowerCase());

    } catch (error) {
        console.error('Error checking user approval:', error.message);
        // For development, allow any user if we can't check the sheet
        if (process.env.NODE_ENV === 'development') {
            console.warn('Development mode: allowing user without approval check');
            return true;
        }
        return false;
    }
}

/**
 * Combined middleware for authentication and approval
 */
async function requireAuth(req, res, next) {
    await verifyToken(req, res, async (error) => {
        if (error) return;
        await checkApprovedUser(req, res, next);
    });
}

/**
 * Generate JWT token
 */
async function generateToken(user) {
    try {
        const jwtSecret = await secretManager.getSecret('jwt-secret');
        return jwt.sign(
            {
                id: user.id,
                email: user.email,
                name: user.name,
                picture: user.picture
            },
            jwtSecret,
            {
                expiresIn: '24h'
            }
        );
    } catch (error) {
        console.error('Failed to generate token:', error.message);
        throw error;
    }
}

module.exports = {
    verifyToken,
    checkApprovedUser,
    requireAuth,
    generateToken,
    checkUserApproval
};