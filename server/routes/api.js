const express = require('express');
const { requireAuth } = require('../middleware/auth');

// Use global JSON storage service initialized in server/index.js
const getJsonStorage = () => {
    if (!global.jsonStorage) {
        throw new Error('JSON storage service not initialized');
    }
    return global.jsonStorage;
};

const router = express.Router();

// Phone validation utility
const validatePhone = (phone) => {
    if (!phone) return false;
    const cleanPhone = phone.replace(/\D/g, ''); // Remove non-digits
    return cleanPhone.length === 10;
};

// Public route for scheduling (no auth required)
router.post('/padharamanis/schedule', async (req, res) => {
    try {
        const padharamaniData = req.body;

        // Validate required fields for scheduling
        const requiredFields = ['name', 'phone', 'address', 'city'];
        const missingFields = requiredFields.filter(field => !padharamaniData[field]);

        if (missingFields.length > 0) {
            return res.status(400).json({ 
                error: 'Missing required fields', 
                missingFields 
            });
        }

        // Validate phone number
        if (!validatePhone(padharamaniData.phone)) {
            return res.status(400).json({ 
                error: 'Phone number must be exactly 10 digits' 
            });
        }

        // Add to JSON storage
        const result = await getJsonStorage().schedulePadharamani(padharamaniData);

        res.status(201).json(result);
    } catch (error) {
        console.error('Error scheduling padharamani:', error.message);
        res.status(500).json({ error: 'Failed to schedule padharamani' });
    }
});




// Apply authentication middleware to all other API routes
router.use(requireAuth);

/**
 * GET /api/padharamanis/upcoming
 * Get upcoming padharamanis
 */
router.get('/padharamanis/upcoming', async (req, res) => {
    try {
        const padharamanis = await getJsonStorage().getUpcomingPadharamanis();
        res.json(padharamanis);
    } catch (error) {
        console.error('Error fetching upcoming padharamanis:', error.message);
        res.status(500).json({ error: 'Failed to fetch upcoming padharamanis' });
    }
});

/**
 * GET /api/padharamanis/archived
 * Get archived padharamanis
 */
router.get('/padharamanis/archived', async (req, res) => {
    try {
        const padharamanis = await getJsonStorage().getArchivedPadharamanis();
        res.json(padharamanis);
    } catch (error) {
        console.error('Error fetching archived padharamanis:', error.message);
        res.status(500).json({ error: 'Failed to fetch archived padharamanis' });
    }
});

/**
 * GET /api/padharamanis/scheduled
 * Get scheduled padharamani requests (incomplete entries)
 */
router.get('/padharamanis/scheduled', async (req, res) => {
    try {
        const scheduled = await getJsonStorage().getScheduledPadharamanis();
        res.json(scheduled);
    } catch (error) {
        console.error('Error fetching padharamani requests:', error.message);
        res.status(500).json({ error: 'Failed to fetch padharamani requests' });
    }
});

/**
 * GET /api/padharamanis
 * Get all padharamanis
 */
router.get('/padharamanis', async (req, res) => {
    try {
        const padharamanis = await getAllPadharamanis();
        res.json(padharamanis);
    } catch (error) {
        console.error('Error fetching all padharamanis:', error.message);
        res.status(500).json({ error: 'Failed to fetch padharamanis' });
    }
});

/**
 * POST /api/padharamanis
 * Add a new padharamani (full details with calendar sync)
 */
router.post('/padharamanis', async (req, res) => {
    try {
        const padharamaniData = req.body;

        // Validate required fields
        const requiredFields = ['name', 'phone', 'address', 'city', 'date', 'beginningTime', 'endingTime'];
        const missingFields = requiredFields.filter(field => !padharamaniData[field]);

        if (missingFields.length > 0) {
            return res.status(400).json({ 
                error: 'Missing required fields', 
                missingFields 
            });
        }

        // Validate phone number
        if (!validatePhone(padharamaniData.phone)) {
            return res.status(400).json({ 
                error: 'Phone number must be exactly 10 digits' 
            });
        }

        // Validate volunteer phone numbers if provided
        if (padharamaniData.volunteerNumber && !validatePhone(padharamaniData.volunteerNumber)) {
            return res.status(400).json({ 
                error: 'Transport volunteer phone number must be exactly 10 digits' 
            });
        }

        if (padharamaniData.zoneCoordinatorPhone && !validatePhone(padharamaniData.zoneCoordinatorPhone)) {
            return res.status(400).json({ 
                error: 'Zone coordinator phone number must be exactly 10 digits' 
            });
        }

        // Add padharamani to JSON storage
        const result = await getJsonStorage().addPadharamani(padharamaniData);

        res.status(201).json(result);
    } catch (error) {
        console.error('Error adding padharamani:', error.message);
        res.status(500).json({ error: 'Failed to add padharamani' });
    }
});


/**
 * PUT /api/padharamanis/:id
 * Update an existing padharamani
 */
router.put('/padharamanis/:id', async (req, res) => {
    try {
        const padharamaniId = req.params.id;
        const padharamaniData = req.body;

        // Update padharamani in JSON storage
        const result = await getJsonStorage().updatePadharamani(padharamaniId, padharamaniData);

        res.json(result);
    } catch (error) {
        console.error('Error updating padharamani:', error.message);
        res.status(500).json({ error: 'Failed to update padharamani' });
    }
});

/**
 * GET /api/health
 * Health check endpoint
 */
router.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        user: req.user ? req.user.email : 'anonymous'
    });
});

/**
 * Error handling middleware for API routes
 */
router.use((error, req, res, next) => {
    console.error('API Error:', error);
    res.status(500).json({
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
    });
});

module.exports = router;