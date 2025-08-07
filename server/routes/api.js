const express = require('express');
const { requireAuth } = require('../middleware/auth');
const {
    getAllPadharamanis,
    getUpcomingPadharamanis,
    getArchivedPadharamanis,
    addPadharamani,
    updatePadharamani
} = require('../services/sheetsService');
const {
    syncPadharamaniToCalendar,
    cancelPadharamaniEvent
} = require('../services/calendarService');

const router = express.Router();

// Apply authentication middleware to all API routes
router.use(requireAuth);

/**
 * GET /api/padharamanis/upcoming
 * Get upcoming padharamanis
 */
router.get('/padharamanis/upcoming', async (req, res) => {
    try {
        const padharamanis = await getUpcomingPadharamanis();
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
        const padharamanis = await getArchivedPadharamanis();
        res.json(padharamanis);
    } catch (error) {
        console.error('Error fetching archived padharamanis:', error.message);
        res.status(500).json({ error: 'Failed to fetch archived padharamanis' });
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

        // Add padharamani to Google Sheet
        const result = await addPadharamani(padharamaniData);

        // Sync to Google Calendar
        try {
            await syncPadharamaniToCalendar(padharamaniData);
            console.log('Padharamani synced to calendar successfully');
        } catch (calendarError) {
            console.error('Calendar sync failed:', calendarError.message);
            // Don't fail the request if calendar sync fails
        }

        res.status(201).json(result);
    } catch (error) {
        console.error('Error adding padharamani:', error.message);
        res.status(500).json({ error: 'Failed to add padharamani' });
    }
});

/**
 * POST /api/padharamanis/schedule
 * Schedule a padharamani (simplified form without full details)
 */
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

        // Add default values for scheduling
        const scheduleData = {
            ...padharamaniData,
            date: '', // Will be filled later
            beginningTime: '',
            endingTime: '',
            transportVolunteer: '',
            volunteerNumber: '',
            zoneCoordinator: '',
            zoneCoordinatorPhone: '',
            status: 'Scheduled'
        };

        // Add to Google Sheet
        const result = await addPadharamani(scheduleData);

        res.status(201).json(result);
    } catch (error) {
        console.error('Error scheduling padharamani:', error.message);
        res.status(500).json({ error: 'Failed to schedule padharamani' });
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

        // Update padharamani in Google Sheet
        const result = await updatePadharamani(padharamaniId, padharamaniData);

        // Handle calendar sync
        try {
            if (padharamaniData.status === 'Canceled') {
                // Cancel calendar event
                await cancelPadharamaniEvent(padharamaniData);
                console.log('Padharamani canceled in calendar');
            } else {
                // Update calendar event
                await syncPadharamaniToCalendar(padharamaniData);
                console.log('Padharamani updated in calendar');
            }
        } catch (calendarError) {
            console.error('Calendar sync failed:', calendarError.message);
            // Don't fail the request if calendar sync fails
        }

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