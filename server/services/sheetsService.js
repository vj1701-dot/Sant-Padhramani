const googleAuthConfig = require('../config/googleAuth');
const secretManager = require('../config/secretManager');

class SheetsService {
    constructor() {
        this.sheetsClient = null;
        this.sheetId = null;
    }

    /**
     * Initialize the sheets service
     */
    async initialize() {
        try {
            this.sheetsClient = await googleAuthConfig.getSheetsClient();
            this.sheetId = await secretManager.getSecret('google-sheet-id');
            console.log('Sheets service initialized');
        } catch (error) {
            console.error('Failed to initialize sheets service:', error.message);
            throw error;
        }
    }

    /**
     * Get sheets client (initialize if needed)
     */
    async getSheetsClient() {
        if (!this.sheetsClient) {
            await this.initialize();
        }
        return this.sheetsClient;
    }

    /**
     * Get the main sheet ID
     */
    async getSheetId() {
        if (!this.sheetId) {
            this.sheetId = await secretManager.getSecret('google-sheet-id');
        }
        return this.sheetId;
    }

    /**
     * Get all padharamanis from the sheet
     */
    async getAllPadharamanis() {
        try {
            const client = await this.getSheetsClient();
            const sheetId = await this.getSheetId();

            const response = await client.spreadsheets.values.get({
                spreadsheetId: sheetId,
                range: 'Sheet1!A:N', // All columns A to N
            });

            const rows = response.data.values || [];
            
            if (rows.length === 0) {
                return [];
            }

            // Skip header row and convert to objects
            const padharamanis = rows.slice(1).map((row, index) => ({
                id: index + 2, // Row number (1-indexed, +1 for header)
                date: row[0] || '',
                beginningTime: row[1] || '',
                endingTime: row[2] || '',
                name: row[3] || '',
                address: row[4] || '',
                city: row[5] || '',
                email: row[6] || '',
                phone: row[7] || '',
                transportVolunteer: row[8] || '',
                volunteerNumber: row[9] || '',
                comments: row[10] || '',
                zoneCoordinator: row[11] || '',
                zoneCoordinatorPhone: row[12] || '',
                status: row[13] || 'Scheduled'
            }));

            return padharamanis;
        } catch (error) {
            console.error('Error getting padharamanis from sheet:', error.message);
            throw error;
        }
    }

    /**
     * Get upcoming padharamanis (today and future)
     */
    async getUpcomingPadharamanis() {
        try {
            const allPadharamanis = await this.getAllPadharamanis();
            const today = new Date().toISOString().split('T')[0];

            return allPadharamanis
                .filter(p => p.date >= today)
                .sort((a, b) => new Date(a.date) - new Date(b.date));
        } catch (error) {
            console.error('Error getting upcoming padharamanis:', error.message);
            throw error;
        }
    }

    /**
     * Get archived padharamanis (before today)
     */
    async getArchivedPadharamanis() {
        try {
            const allPadharamanis = await this.getAllPadharamanis();
            const today = new Date().toISOString().split('T')[0];

            return allPadharamanis
                .filter(p => p.date < today)
                .sort((a, b) => new Date(b.date) - new Date(a.date)); // Newest first
        } catch (error) {
            console.error('Error getting archived padharamanis:', error.message);
            throw error;
        }
    }

    /**
     * Add a new padharamani to the sheet
     */
    async addPadharamani(padharamaniData) {
        try {
            const client = await this.getSheetsClient();
            const sheetId = await this.getSheetId();

            // Prepare the row data
            const rowData = [
                padharamaniData.date || '',
                padharamaniData.beginningTime || '',
                padharamaniData.endingTime || '',
                padharamaniData.name || '',
                padharamaniData.address || '',
                padharamaniData.city || '',
                padharamaniData.email || '',
                padharamaniData.phone || '',
                padharamaniData.transportVolunteer || '',
                padharamaniData.volunteerNumber || '',
                padharamaniData.comments || '',
                padharamaniData.zoneCoordinator || '',
                padharamaniData.zoneCoordinatorPhone || '',
                padharamaniData.status || 'Scheduled'
            ];

            const response = await client.spreadsheets.values.append({
                spreadsheetId: sheetId,
                range: 'Sheet1!A:N',
                valueInputOption: 'RAW',
                requestBody: {
                    values: [rowData]
                }
            });

            console.log('Padharamani added to sheet:', response.data);
            return { success: true, data: padharamaniData };
        } catch (error) {
            console.error('Error adding padharamani to sheet:', error.message);
            throw error;
        }
    }

    /**
     * Update an existing padharamani in the sheet
     */
    async updatePadharamani(padharamaniId, padharamaniData) {
        try {
            const client = await this.getSheetsClient();
            const sheetId = await this.getSheetId();

            // Prepare the row data
            const rowData = [
                padharamaniData.date || '',
                padharamaniData.beginningTime || '',
                padharamaniData.endingTime || '',
                padharamaniData.name || '',
                padharamaniData.address || '',
                padharamaniData.city || '',
                padharamaniData.email || '',
                padharamaniData.phone || '',
                padharamaniData.transportVolunteer || '',
                padharamaniData.volunteerNumber || '',
                padharamaniData.comments || '',
                padharamaniData.zoneCoordinator || '',
                padharamaniData.zoneCoordinatorPhone || '',
                padharamaniData.status || 'Scheduled'
            ];

            // Update the specific row (padharamaniId is the row number)
            const range = `Sheet1!A${padharamaniId}:N${padharamaniId}`;
            
            const response = await client.spreadsheets.values.update({
                spreadsheetId: sheetId,
                range: range,
                valueInputOption: 'RAW',
                requestBody: {
                    values: [rowData]
                }
            });

            console.log('Padharamani updated in sheet:', response.data);
            return { success: true, data: padharamaniData };
        } catch (error) {
            console.error('Error updating padharamani in sheet:', error.message);
            throw error;
        }
    }

    /**
     * Get today's padharamanis (for Telegram bot)
     */
    async getTodaysPadharamanis() {
        try {
            const allPadharamanis = await this.getAllPadharamanis();
            const today = new Date().toISOString().split('T')[0];

            return allPadharamanis
                .filter(p => p.date === today && p.status !== 'Canceled')
                .sort((a, b) => (a.beginningTime || '').localeCompare(b.beginningTime || ''));
        } catch (error) {
            console.error('Error getting today\'s padharamanis:', error.message);
            throw error;
        }
    }

    /**
     * Initialize the sheet with headers if it's empty
     */
    async initializeSheet() {
        try {
            const client = await this.getSheetsClient();
            const sheetId = await this.getSheetId();

            // Check if the sheet has headers
            const response = await client.spreadsheets.values.get({
                spreadsheetId: sheetId,
                range: 'Sheet1!A1:N1',
            });

            const headerRow = response.data.values?.[0];
            
            if (!headerRow || headerRow.length === 0) {
                // Add headers
                const headers = [
                    'Date',
                    'Beginning Time',
                    'Ending Time',
                    'Name',
                    'Address',
                    'City',
                    'Email',
                    'Phone',
                    'Transport Volunteer',
                    'Volunteer\'s Number',
                    'Comments',
                    'Zone Coordinator',
                    'Zone Coordinator\'s Phone Number',
                    'Status'
                ];

                await client.spreadsheets.values.update({
                    spreadsheetId: sheetId,
                    range: 'Sheet1!A1:N1',
                    valueInputOption: 'RAW',
                    requestBody: {
                        values: [headers]
                    }
                });

                console.log('Sheet initialized with headers');
            }
        } catch (error) {
            console.error('Error initializing sheet:', error.message);
            throw error;
        }
    }
}

// Create singleton instance
const sheetsService = new SheetsService();

// Export both the instance and helper functions
module.exports = {
    sheetsService,
    getSheetsClient: () => sheetsService.getSheetsClient(),
    getAllPadharamanis: () => sheetsService.getAllPadharamanis(),
    getUpcomingPadharamanis: () => sheetsService.getUpcomingPadharamanis(),
    getArchivedPadharamanis: () => sheetsService.getArchivedPadharamanis(),
    addPadharamani: (data) => sheetsService.addPadharamani(data),
    updatePadharamani: (id, data) => sheetsService.updatePadharamani(id, data),
    getTodaysPadharamanis: () => sheetsService.getTodaysPadharamanis(),
    initializeSheet: () => sheetsService.initializeSheet()
};