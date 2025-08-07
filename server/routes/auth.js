const express = require('express');
const rateLimit = require('express-rate-limit');
// Use global user service initialized in server/index.js
const getUserService = () => {
    if (!global.userService) {
        throw new Error('User service not initialized');
    }
    return global.userService;
};
const { generateToken, requireAuth } = require('../middleware/auth');
const crypto = require('crypto');

const router = express.Router();

// Rate limiting for login attempts
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // limit each IP to 5 requests per windowMs
    message: { error: 'Too many login attempts, please try again later' },
    standardHeaders: true,
    legacyHeaders: false,
});

// Rate limiting for registration
const registerLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 3, // limit each IP to 3 registrations per hour
    message: { error: 'Too many registration attempts, please try again later' },
    standardHeaders: true,
    legacyHeaders: false,
});

/**
 * POST /auth/register
 * Register a new user
 */
router.post('/register', registerLimiter, async (req, res) => {
    try {
        const { email, password, name } = req.body;

        if (!email || !password || !name) {
            return res.status(400).json({ error: 'Email, password, and name are required' });
        }

        if (password.length < 8) {
            return res.status(400).json({ error: 'Password must be at least 8 characters long' });
        }

        const user = await getUserService().createUser(email, password, name);
        
        res.status(201).json({
            success: true,
            message: 'User registered successfully. Account pending approval.',
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
                isApproved: user.isApproved
            }
        });

    } catch (error) {
        console.error('Registration error:', error.message);
        if (error.message === 'User already exists') {
            return res.status(409).json({ error: 'User already exists' });
        }
        res.status(500).json({ error: 'Registration failed' });
    }
});

/**
 * POST /auth/login
 * Login with email and password
 */
router.post('/login', loginLimiter, async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required' });
        }

        const user = await getUserService().authenticateUser(email, password);
        const token = generateToken(user);

        // Set token in HTTP-only cookie
        res.cookie('token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 24 * 60 * 60 * 1000 // 24 hours
        });

        res.json({
            success: true,
            token,
            user: {
                id: user.id,
                email: user.email,
                name: user.name
            }
        });

    } catch (error) {
        console.error('Login error:', error.message);
        if (error.message === 'Invalid credentials') {
            return res.status(401).json({ error: 'Invalid email or password' });
        }
        if (error.message === 'Account not approved') {
            return res.status(403).json({ error: 'Account pending approval' });
        }
        res.status(500).json({ error: 'Login failed' });
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
        name: req.user.name
    });
});

/**
 * POST /auth/telegram
 * Authenticate with Telegram Mini App
 */
router.post('/telegram', async (req, res) => {
    try {
        const { telegramUser } = req.body;
        
        if (!telegramUser || !telegramUser.id) {
            return res.status(400).json({ error: 'Invalid Telegram user data' });
        }
        
        // Create or get Telegram user
        const userData = await getUserService().createTelegramUser(telegramUser);
        
        // Generate token for Telegram user
        const token = generateToken(userData);
        
        // Set token in HTTP-only cookie
        res.cookie('token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 24 * 60 * 60 * 1000 // 24 hours
        });
        
        res.json({
            success: true,
            token,
            user: userData
        });
        
    } catch (error) {
        console.error('Telegram auth error:', error.message);
        res.status(500).json({ error: 'Telegram authentication failed' });
    }
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
 * GET /auth/users (admin endpoint)
 * Get all users for approval management
 */
router.get('/users', requireAuth, async (req, res) => {
    try {
        const users = await getUserService().getAllUsers();
        res.json({ users });
    } catch (error) {
        console.error('Error fetching users:', error.message);
        res.status(500).json({ error: 'Failed to fetch users' });
    }
});

/**
 * POST /auth/approve/:email (admin endpoint)
 * Approve a user
 */
router.post('/approve/:email', requireAuth, async (req, res) => {
    try {
        const email = decodeURIComponent(req.params.email);
        const user = await getUserService().approveUser(email);
        
        res.json({
            success: true,
            message: 'User approved successfully',
            user
        });
    } catch (error) {
        console.error('Error approving user:', error.message);
        if (error.message === 'User not found') {
            return res.status(404).json({ error: 'User not found' });
        }
        res.status(500).json({ error: 'Failed to approve user' });
    }
});

/**
 * GET /auth/schedule-public
 * Public schedule page (no authentication required)
 */
router.get('/schedule-public', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Padharamani Request - Sant Padharamani</title>
            <script>
                // Suppress Tailwind CDN warning in development
                const originalWarn = console.warn;
                console.warn = function(...args) {
                    if (args[0] && args[0].includes('cdn.tailwindcss.com')) return;
                    originalWarn.apply(console, args);
                };
            </script>
            <script src="https://cdn.tailwindcss.com"></script>
        </head>
        <body class="bg-gray-50 min-h-screen">
            <div class="max-w-2xl mx-auto py-8 px-4">
                <div class="text-center mb-8">
                    <h1 class="text-3xl font-bold text-gray-900 mb-2">Sant Padharamani</h1>
                    <p class="text-gray-600">Request a Padharamani Visit</p>
                </div>
                
                <div id="message" class="mb-4 hidden"></div>
                
                <div class="bg-white rounded-lg shadow-lg p-6">
                    <form id="schedule-form">
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label class="block text-sm font-medium text-gray-700 mb-2">Name</label>
                                <input type="text" id="name" required 
                                       class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                                       style="min-height: 44px; font-size: 16px;">
                            </div>
                            <div>
                                <label class="block text-sm font-medium text-gray-700 mb-2">Phone (10 digits)</label>
                                <input type="tel" id="phone" required pattern="[0-9]{10}" maxlength="10"
                                       class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                                       style="min-height: 44px; font-size: 16px;"
                                       placeholder="1234567890">
                                <div id="phone-error" class="text-red-500 text-xs mt-1 hidden">Phone number must be exactly 10 digits</div>
                            </div>
                            <div>
                                <label class="block text-sm font-medium text-gray-700 mb-2">Address</label>
                                <input type="text" id="address" required 
                                       class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                                       style="min-height: 44px; font-size: 16px;">
                            </div>
                            <div>
                                <label class="block text-sm font-medium text-gray-700 mb-2">City</label>
                                <input type="text" id="city" required 
                                       class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                                       style="min-height: 44px; font-size: 16px;">
                            </div>
                            <div class="md:col-span-2">
                                <label class="block text-sm font-medium text-gray-700 mb-2">Email (optional)</label>
                                <input type="email" id="email" 
                                       class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                                       style="min-height: 44px; font-size: 16px;">
                            </div>
                        </div>
                        
                        <div class="mt-6">
                            <label class="block text-sm font-medium text-gray-700 mb-2">Comments</label>
                            <textarea id="comments" rows="3"
                                      class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                                      style="font-size: 16px;"></textarea>
                        </div>
                        
                        <div class="mt-6">
                            <button type="submit" 
                                    class="w-full bg-orange-600 text-white py-3 px-4 rounded-md hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 font-medium"
                                    style="min-height: 44px;">
                                Submit Padharamani Request
                            </button>
                        </div>
                    </form>
                    
                    <div class="mt-6 text-center">
                        <p class="text-sm text-gray-600">Your request will be reviewed and confirmed by our team.</p>
                    </div>
                </div>
            </div>

            <script>
                function showMessage(message, isError = false) {
                    const messageDiv = document.getElementById('message');
                    messageDiv.textContent = message;
                    messageDiv.className = \`mb-4 p-3 rounded-md \${isError ? 'bg-red-100 text-red-700 border border-red-300' : 'bg-green-100 text-green-700 border border-green-300'}\`;
                    messageDiv.classList.remove('hidden');
                }

                // Phone validation
                function validatePhone(phone) {
                    const cleanPhone = phone.replace(/\\D/g, ''); // Remove non-digits
                    return cleanPhone.length === 10;
                }

                document.getElementById('phone').addEventListener('input', function(e) {
                    const phone = e.target.value;
                    const errorDiv = document.getElementById('phone-error');
                    
                    if (phone && !validatePhone(phone)) {
                        e.target.classList.add('border-red-500', 'bg-red-50');
                        e.target.classList.remove('border-gray-300');
                        errorDiv.classList.remove('hidden');
                    } else {
                        e.target.classList.remove('border-red-500', 'bg-red-50');
                        e.target.classList.add('border-gray-300');
                        errorDiv.classList.add('hidden');
                    }
                });

                document.getElementById('schedule-form').addEventListener('submit', async function(event) {
                    event.preventDefault();
                    
                    const phoneValue = document.getElementById('phone').value;
                    if (!validatePhone(phoneValue)) {
                        showMessage('Please enter a valid 10-digit phone number', true);
                        return;
                    }
                    
                    const formData = {
                        name: document.getElementById('name').value,
                        phone: phoneValue,
                        address: document.getElementById('address').value,
                        city: document.getElementById('city').value,
                        email: document.getElementById('email').value,
                        comments: document.getElementById('comments').value
                    };

                    try {
                        const response = await fetch('/api/padharamanis/schedule', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(formData)
                        });

                        const data = await response.json();

                        if (response.ok) {
                            showMessage('Thank you! Your padharamani request has been submitted successfully. Our team will contact you soon to confirm the details.');
                            document.getElementById('schedule-form').reset();
                        } else {
                            showMessage(data.error || 'Failed to submit request. Please try again.', true);
                        }
                    } catch (error) {
                        showMessage('Network error. Please check your connection and try again.', true);
                    }
                });
            </script>
        </body>
        </html>
    `);
});

/**
 * POST /auth/users (admin endpoint)
 * Create a new user
 */
router.post('/users', requireAuth, async (req, res) => {
    try {
        const { email, password, name, isAdmin } = req.body;
        
        if (!email || !password || !name) {
            return res.status(400).json({ error: 'Email, password, and name are required' });
        }
        
        // Only admins can create users
        if (!req.user.isAdmin) {
            return res.status(403).json({ error: 'Admin access required' });
        }
        
        const user = await getUserService().createUser(email, password, name, isAdmin || false);
        
        res.status(201).json({
            success: true,
            message: 'User created successfully',
            user
        });
        
    } catch (error) {
        console.error('Error creating user:', error.message);
        if (error.message === 'User already exists') {
            return res.status(409).json({ error: 'User already exists' });
        }
        res.status(500).json({ error: 'Failed to create user' });
    }
});

/**
 * DELETE /auth/users/:email (admin endpoint)
 * Delete a user
 */
router.delete('/users/:email', requireAuth, async (req, res) => {
    try {
        const email = decodeURIComponent(req.params.email);
        
        // Only admins can delete users
        if (!req.user.isAdmin) {
            return res.status(403).json({ error: 'Admin access required' });
        }
        
        const result = await getUserService().deleteUser(email);
        
        res.json({
            success: true,
            message: 'User deleted successfully'
        });
        
    } catch (error) {
        console.error('Error deleting user:', error.message);
        if (error.message === 'User not found') {
            return res.status(404).json({ error: 'User not found' });
        }
        if (error.message === 'Cannot delete the last admin user') {
            return res.status(400).json({ error: 'Cannot delete the last admin user' });
        }
        res.status(500).json({ error: 'Failed to delete user' });
    }
});

/**
 * PUT /auth/users/:email (admin endpoint)
 * Update a user
 */
router.put('/users/:email', requireAuth, async (req, res) => {
    try {
        const email = decodeURIComponent(req.params.email);
        const updates = req.body;
        
        // Users can update their own profile, admins can update any user
        if (req.user.email !== email && !req.user.isAdmin) {
            return res.status(403).json({ error: 'Access denied' });
        }
        
        // Only admins can change admin status
        if (updates.isAdmin !== undefined && !req.user.isAdmin) {
            delete updates.isAdmin;
        }
        
        const user = await getUserService().updateUser(email, updates);
        
        res.json({
            success: true,
            message: 'User updated successfully',
            user
        });
        
    } catch (error) {
        console.error('Error updating user:', error.message);
        if (error.message === 'User not found') {
            return res.status(404).json({ error: 'User not found' });
        }
        res.status(500).json({ error: 'Failed to update user' });
    }
});

/**
 * GET /auth/login-page
 * Serve login page
 */
router.get('/login-page', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Login - Sant Padharamani</title>
            <script src="https://cdn.tailwindcss.com"></script>
        </head>
        <body class="bg-gray-50 flex items-center justify-center min-h-screen">
            <div class="max-w-md w-full bg-white shadow-lg rounded-lg p-8">
                <div class="text-center mb-8">
                    <h1 class="text-2xl font-bold text-gray-900">Sant Padharamani</h1>
                    <p class="text-gray-600">Sign in to your account</p>
                </div>
                
                <div id="message" class="mb-4 hidden"></div>
                
                <div id="login-form">
                    <form id="login-form-element">
                        <div class="mb-4">
                            <label class="block text-sm font-medium text-gray-700 mb-2">Email</label>
                            <input type="email" id="email" required 
                                   class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent">
                        </div>
                        <div class="mb-6">
                            <label class="block text-sm font-medium text-gray-700 mb-2">Password</label>
                            <input type="password" id="password" required 
                                   class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent">
                        </div>
                        <button type="submit" 
                                class="w-full bg-orange-600 text-white py-2 px-4 rounded-md hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2">
                            Sign In
                        </button>
                    </form>
                    <div class="mt-4 text-center">
                        <button id="show-register-btn" class="text-orange-600 hover:text-orange-700 text-sm">
                            Need an account? Register here
                        </button>
                    </div>
                </div>

                <div id="register-form" class="hidden">
                    <form id="register-form-element">
                        <div class="mb-4">
                            <label class="block text-sm font-medium text-gray-700 mb-2">Name</label>
                            <input type="text" id="reg-name" required 
                                   class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent">
                        </div>
                        <div class="mb-4">
                            <label class="block text-sm font-medium text-gray-700 mb-2">Email</label>
                            <input type="email" id="reg-email" required 
                                   class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent">
                        </div>
                        <div class="mb-6">
                            <label class="block text-sm font-medium text-gray-700 mb-2">Password (min 8 characters)</label>
                            <input type="password" id="reg-password" required minlength="8"
                                   class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent">
                        </div>
                        <button type="submit" 
                                class="w-full bg-orange-600 text-white py-2 px-4 rounded-md hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2">
                            Register
                        </button>
                    </form>
                    <div class="mt-4 text-center">
                        <button id="show-login-btn" class="text-orange-600 hover:text-orange-700 text-sm">
                            Already have an account? Sign in
                        </button>
                    </div>
                </div>
            </div>

            <script>
                function showMessage(message, isError = false) {
                    const messageDiv = document.getElementById('message');
                    messageDiv.textContent = message;
                    messageDiv.className = \`mb-4 p-3 rounded-md \${isError ? 'bg-red-100 text-red-700 border border-red-300' : 'bg-green-100 text-green-700 border border-green-300'}\`;
                    messageDiv.classList.remove('hidden');
                }

                function showLoginForm() {
                    document.getElementById('login-form').classList.remove('hidden');
                    document.getElementById('register-form').classList.add('hidden');
                }

                function showRegisterForm() {
                    document.getElementById('login-form').classList.add('hidden');
                    document.getElementById('register-form').classList.remove('hidden');
                }

                async function handleLogin(event) {
                    event.preventDefault();
                    const email = document.getElementById('email').value;
                    const password = document.getElementById('password').value;

                    try {
                        const response = await fetch('/auth/login', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ email, password })
                        });

                        const data = await response.json();

                        if (response.ok) {
                            showMessage('Login successful! Redirecting...');
                            localStorage.setItem('token', data.token);
                            setTimeout(() => window.location.href = '/', 1000);
                        } else {
                            showMessage(data.error || 'Login failed', true);
                        }
                    } catch (error) {
                        showMessage('Network error. Please try again.', true);
                    }
                }

                async function handleRegister(event) {
                    event.preventDefault();
                    const name = document.getElementById('reg-name').value;
                    const email = document.getElementById('reg-email').value;
                    const password = document.getElementById('reg-password').value;

                    try {
                        const response = await fetch('/auth/register', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ name, email, password })
                        });

                        const data = await response.json();

                        if (response.ok) {
                            showMessage(data.message);
                            setTimeout(() => showLoginForm(), 2000);
                        } else {
                            showMessage(data.error || 'Registration failed', true);
                        }
                    } catch (error) {
                        showMessage('Network error. Please try again.', true);
                    }
                }

                // Add event listeners when the DOM is loaded
                document.addEventListener('DOMContentLoaded', function() {
                    // Login form submission
                    document.getElementById('login-form-element').addEventListener('submit', handleLogin);
                    
                    // Register form submission
                    document.getElementById('register-form-element').addEventListener('submit', handleRegister);
                    
                    // Show register form button
                    document.getElementById('show-register-btn').addEventListener('click', showRegisterForm);
                    
                    // Show login form button
                    document.getElementById('show-login-btn').addEventListener('click', showLoginForm);
                });
            </script>
        </body>
        </html>
    `);
});

module.exports = router;