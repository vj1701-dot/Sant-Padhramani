const express = require('express');
const googleAuthConfig = require('../config/googleAuth');
const { generateToken, requireAuth, checkUserApproval } = require('../middleware/auth');

const router = express.Router();

/**
 * GET /auth/login
 * Redirect to Google OAuth login
 */
router.get('/login', async (req, res) => {
    try {
        const authUrl = await googleAuthConfig.getAuthUrl();
        res.redirect(authUrl);
    } catch (error) {
        console.error('Error generating auth URL:', error.message);
        res.status(500).json({ error: 'Failed to initialize authentication' });
    }
});

/**
 * GET /auth/callback
 * Handle OAuth callback from Google
 */
router.get('/callback', async (req, res) => {
    try {
        const { code, error } = req.query;

        if (error) {
            console.error('OAuth error:', error);
            return res.redirect('/auth/error?error=oauth_error');
        }

        if (!code) {
            return res.redirect('/auth/error?error=no_code');
        }

        // Exchange code for tokens
        const tokens = await googleAuthConfig.getTokens(code);
        
        // Get user information
        const userInfo = await googleAuthConfig.getUserInfo(tokens.access_token);
        
        // Check if user is approved
        const isApproved = await checkUserApproval(userInfo.email);
        
        if (!isApproved) {
            console.log(`Unauthorized access attempt by: ${userInfo.email}`);
            return res.redirect('/auth/error?error=not_approved');
        }

        // Generate JWT token
        const jwtToken = await generateToken(userInfo);

        // Set token in HTTP-only cookie and also send to client for API calls
        res.cookie('token', jwtToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 24 * 60 * 60 * 1000 // 24 hours
        });

        // Redirect to main app with token in URL for client-side storage
        res.redirect(`/?token=${jwtToken}`);

    } catch (error) {
        console.error('OAuth callback error:', error.message);
        res.redirect('/auth/error?error=callback_error');
    }
});

/**
 * GET /auth/me
 * Get current user information
 */
router.get('/me', requireAuth, (req, res) => {
    res.json({
        id: req.user.id,
        email: req.user.email,
        name: req.user.name,
        picture: req.user.picture
    });
});

/**
 * POST /auth/logout
 * Logout user
 */
router.post('/logout', (req, res) => {
    res.clearCookie('token');
    res.json({ success: true });
});

/**
 * GET /auth/error
 * Display authentication error page
 */
router.get('/error', (req, res) => {
    const { error } = req.query;
    
    let errorMessage = 'An authentication error occurred.';
    let errorDetails = '';

    switch (error) {
        case 'oauth_error':
            errorMessage = 'OAuth Authentication Error';
            errorDetails = 'There was an error during the Google authentication process.';
            break;
        case 'no_code':
            errorMessage = 'Authentication Failed';
            errorDetails = 'No authorization code received from Google.';
            break;
        case 'not_approved':
            errorMessage = 'Access Denied';
            errorDetails = 'Your email address is not in the approved users list. Please contact an administrator.';
            break;
        case 'callback_error':
            errorMessage = 'Callback Error';
            errorDetails = 'There was an error processing the authentication callback.';
            break;
    }

    res.send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Authentication Error - Sant Padharamani</title>
            <script src="https://cdn.tailwindcss.com"></script>
        </head>
        <body class="bg-gray-50 flex items-center justify-center min-h-screen">
            <div class="max-w-md w-full bg-white shadow-lg rounded-lg p-8">
                <div class="text-center">
                    <div class="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100">
                        <svg class="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                        </svg>
                    </div>
                    <h1 class="mt-4 text-xl font-semibold text-gray-900">${errorMessage}</h1>
                    <p class="mt-2 text-sm text-gray-600">${errorDetails}</p>
                    <div class="mt-6">
                        <a href="/auth/login" class="inline-flex items-center px-4 py-2 bg-orange-600 border border-transparent rounded-md font-semibold text-white hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500">
                            Try Again
                        </a>
                    </div>
                </div>
            </div>
        </body>
        </html>
    `);
});

module.exports = router;