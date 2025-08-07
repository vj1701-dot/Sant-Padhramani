const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');
const fs = require('fs').promises;
const path = require('path');

class GoogleSheetsService {
    constructor() {
        this.doc = null;
        this.requestsSheet = null;
        this.padharamanisSheet = null;
        this.initialized = false;
    }

    /**
     * Initialize Google Sheets connection
     */
    async initialize() {
        try {
            // Load service account credentials
            const credentialsPath = process.env.GOOGLE_SERVICE_ACCOUNT_PATH || 
                                  path.join(__dirname, '../credentials/service-account-key.json');
            
            let credentials;
            try {
                const credData = await fs.readFile(credentialsPath, 'utf8');
                credentials = JSON.parse(credData);
            } catch (error) {
                console.log('Google credentials not found, falling back to local storage');
                // Fallback to local JSON storage if credentials not available
                return this.initializeLocal();
            }

            const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;
            if (!spreadsheetId) {
                console.log('Google Spreadsheet ID not provided, falling back to local storage');
                return this.initializeLocal();
            }

            // Initialize JWT auth
            const serviceAccountAuth = new JWT({
                email: credentials.client_email,
                key: credentials.private_key,
                scopes: ['https://www.googleapis.com/auth/spreadsheets'],
            });

            // Initialize Google Spreadsheet
            this.doc = new GoogleSpreadsheet(spreadsheetId, serviceAccountAuth);
            await this.doc.loadInfo();

            // Get or create sheets
            this.requestsSheet = await this.getOrCreateSheet('Padharamani_Requests', [
                'ID', 'Name', 'Phone', 'Address', 'City', 'Email', 'Comments', 
                'Created_Date', 'Status'
            ]);

            this.padharamanisSheet = await this.getOrCreateSheet('Assigned_Padharamani', [
                'ID', 'Date', 'Beginning_Time', 'Ending_Time', 'Name', 'Phone', 
                'Address', 'City', 'Email', 'Transport_Volunteer', 'Volunteer_Phone',
                'Zone_Coordinator', 'Coordinator_Phone', 'Comments', 'Status', 'Created_Date'
            ]);

            this.initialized = true;
            console.log(`Google Sheets service initialized: ${this.doc.title}`);
            console.log(`- Requests sheet: ${this.requestsSheet.title}`);
            console.log(`- Padharamanis sheet: ${this.padharamanisSheet.title}`);
            
        } catch (error) {
            console.error('Failed to initialize Google Sheets:', error.message);
            console.log('Falling back to local storage');
            return this.initializeLocal();
        }
    }

    /**
     * Fallback to local JSON storage
     */
    async initializeLocal() {
        const LocalSheetsService = require('./sheetsService');
        this.localService = new LocalSheetsService();
        await this.localService.initialize();
        this.initialized = true;
        console.log('Using local file storage instead of Google Sheets');
    }

    /**
     * Get or create a sheet with headers
     */
    async getOrCreateSheet(title, headers) {
        let sheet = this.doc.sheetsByTitle[title];
        
        if (!sheet) {
            console.log(`Creating new sheet: ${title}`);
            sheet = await this.doc.addSheet({ 
                title,
                headerValues: headers
            });
        } else {
            // Ensure headers are set
            await sheet.loadHeaderRow();
            if (sheet.headerValues.length === 0) {
                await sheet.setHeaderRow(headers);
            }
        }
        
        return sheet;
    }

    /**
     * Schedule a padharamani request (incomplete - goes to Requests sheet)
     */
    async schedulePadharamani(padharamaniData) {
        if (this.localService) {
            return this.localService.schedulePadharamani(padharamaniData);
        }

        try {
            const requestData = {
                ID: Date.now().toString(),
                Name: padharamaniData.name || '',
                Phone: padharamaniData.phone || '',
                Address: padharamaniData.address || '',
                City: padharamaniData.city || '',
                Email: padharamaniData.email || '',
                Comments: padharamaniData.comments || '',
                Created_Date: new Date().toISOString(),
                Status: 'Pending'
            };

            const row = await this.requestsSheet.addRow(requestData);
            
            return {
                success: true,
                data: {
                    id: requestData.ID,
                    ...padharamaniData,
                    status: 'Pending',
                    createdDate: requestData.Created_Date
                }
            };
        } catch (error) {
            console.error('Error scheduling padharamani:', error);
            throw error;
        }
    }

    /**
     * Add complete padharamani (goes to Assigned_Padharamani sheet)
     */
    async addPadharamani(padharamaniData) {
        if (this.localService) {
            return this.localService.addPadharamani(padharamaniData);
        }

        try {
            const assignedData = {
                ID: padharamaniData.id || Date.now().toString(),
                Date: padharamaniData.date || '',
                Beginning_Time: padharamaniData.beginningTime || '',
                Ending_Time: padharamaniData.endingTime || '',
                Name: padharamaniData.name || '',
                Phone: padharamaniData.phone || '',
                Address: padharamaniData.address || '',
                City: padharamaniData.city || '',
                Email: padharamaniData.email || '',
                Transport_Volunteer: padharamaniData.transportVolunteer || '',
                Volunteer_Phone: padharamaniData.volunteerNumber || '',
                Zone_Coordinator: padharamaniData.zoneCoordinator || '',
                Coordinator_Phone: padharamaniData.zoneCoordinatorPhone || '',
                Comments: padharamaniData.comments || '',
                Status: padharamaniData.status || 'Scheduled',
                Created_Date: new Date().toISOString()
            };

            const row = await this.padharamanisSheet.addRow(assignedData);
            
            return {
                success: true,
                data: this.convertRowToObject(assignedData)
            };
        } catch (error) {
            console.error('Error adding padharamani:', error);
            throw error;
        }
    }

    /**
     * Get all padharamani requests (from Requests sheet)
     */
    async getScheduledPadharamanis() {
        if (this.localService) {
            return this.localService.getAllPadharamanis().then(data => 
                data.filter(p => p.status === 'Scheduled' || p.status === 'Pending')
            );
        }

        try {
            const rows = await this.requestsSheet.getRows();
            return rows.map(row => this.convertRequestRowToObject(row));
        } catch (error) {
            console.error('Error getting scheduled padharamanis:', error);
            return [];
        }
    }

    /**
     * Get upcoming padharamanis (from Assigned_Padharamani sheet)
     */
    async getUpcomingPadharamanis() {
        if (this.localService) {
            return this.localService.getUpcomingPadharamanis();
        }

        try {
            const rows = await this.padharamanisSheet.getRows();
            const today = new Date().toISOString().split('T')[0];
            
            return rows
                .filter(row => {
                    const date = row.get('Date');
                    const status = row.get('Status');
                    return date >= today && status !== 'Canceled';
                })
                .map(row => this.convertAssignedRowToObject(row));
        } catch (error) {
            console.error('Error getting upcoming padharamanis:', error);
            return [];
        }
    }

    /**
     * Get archived padharamanis (from Assigned_Padharamani sheet)
     */
    async getArchivedPadharamanis() {
        if (this.localService) {
            return this.localService.getArchivedPadharamanis();
        }

        try {
            const rows = await this.padharamanisSheet.getRows();
            const today = new Date().toISOString().split('T')[0];
            
            return rows
                .filter(row => {
                    const date = row.get('Date');
                    const status = row.get('Status');
                    return date < today || status === 'Canceled';
                })
                .map(row => this.convertAssignedRowToObject(row));
        } catch (error) {
            console.error('Error getting archived padharamanis:', error);
            return [];
        }
    }

    /**
     * Update padharamani
     */
    async updatePadharamani(id, updatedData) {
        if (this.localService) {
            return this.localService.updatePadharamani(id, updatedData);
        }

        try {
            // Check if it's in requests first
            const requestRows = await this.requestsSheet.getRows();
            const requestRow = requestRows.find(row => row.get('ID') === id);
            
            if (requestRow) {
                // If it now has a date, move to assigned sheet
                if (updatedData.date) {
                    await this.addPadharamani({ ...updatedData, id });
                    await requestRow.delete();
                } else {
                    // Update in requests sheet
                    requestRow.assign({
                        Name: updatedData.name || requestRow.get('Name'),
                        Phone: updatedData.phone || requestRow.get('Phone'),
                        Address: updatedData.address || requestRow.get('Address'),
                        City: updatedData.city || requestRow.get('City'),
                        Email: updatedData.email || requestRow.get('Email'),
                        Comments: updatedData.comments || requestRow.get('Comments')
                    });
                    await requestRow.save();
                }
                return { success: true };
            }

            // Check assigned sheet
            const assignedRows = await this.padharamanisSheet.getRows();
            const assignedRow = assignedRows.find(row => row.get('ID') === id);
            
            if (assignedRow) {
                assignedRow.assign({
                    Date: updatedData.date || assignedRow.get('Date'),
                    Beginning_Time: updatedData.beginningTime || assignedRow.get('Beginning_Time'),
                    Ending_Time: updatedData.endingTime || assignedRow.get('Ending_Time'),
                    Name: updatedData.name || assignedRow.get('Name'),
                    Phone: updatedData.phone || assignedRow.get('Phone'),
                    Address: updatedData.address || assignedRow.get('Address'),
                    City: updatedData.city || assignedRow.get('City'),
                    Email: updatedData.email || assignedRow.get('Email'),
                    Transport_Volunteer: updatedData.transportVolunteer || assignedRow.get('Transport_Volunteer'),
                    Volunteer_Phone: updatedData.volunteerNumber || assignedRow.get('Volunteer_Phone'),
                    Zone_Coordinator: updatedData.zoneCoordinator || assignedRow.get('Zone_Coordinator'),
                    Coordinator_Phone: updatedData.zoneCoordinatorPhone || assignedRow.get('Coordinator_Phone'),
                    Comments: updatedData.comments || assignedRow.get('Comments'),
                    Status: updatedData.status || assignedRow.get('Status')
                });
                await assignedRow.save();
                return { success: true };
            }

            throw new Error('Padharamani not found');
        } catch (error) {
            console.error('Error updating padharamani:', error);
            throw error;
        }
    }

    /**
     * Convert request row to object
     */
    convertRequestRowToObject(row) {
        return {
            id: row.get('ID'),
            name: row.get('Name'),
            phone: row.get('Phone'),
            address: row.get('Address'),
            city: row.get('City'),
            email: row.get('Email'),
            comments: row.get('Comments'),
            status: row.get('Status'),
            createdDate: row.get('Created_Date')
        };
    }

    /**
     * Convert assigned row to object
     */
    convertAssignedRowToObject(row) {
        return {
            id: row.get('ID'),
            date: row.get('Date'),
            beginningTime: row.get('Beginning_Time'),
            endingTime: row.get('Ending_Time'),
            name: row.get('Name'),
            phone: row.get('Phone'),
            address: row.get('Address'),
            city: row.get('City'),
            email: row.get('Email'),
            transportVolunteer: row.get('Transport_Volunteer'),
            volunteerNumber: row.get('Volunteer_Phone'),
            zoneCoordinator: row.get('Zone_Coordinator'),
            zoneCoordinatorPhone: row.get('Coordinator_Phone'),
            comments: row.get('Comments'),
            status: row.get('Status'),
            createdDate: row.get('Created_Date')
        };
    }

    /**
     * Convert object to row data
     */
    convertRowToObject(data) {
        return {
            id: data.ID,
            date: data.Date,
            beginningTime: data.Beginning_Time,
            endingTime: data.Ending_Time,
            name: data.Name,
            phone: data.Phone,
            address: data.Address,
            city: data.City,
            email: data.Email,
            transportVolunteer: data.Transport_Volunteer,
            volunteerNumber: data.Volunteer_Phone,
            zoneCoordinator: data.Zone_Coordinator,
            zoneCoordinatorPhone: data.Coordinator_Phone,
            comments: data.Comments,
            status: data.Status,
            createdDate: data.Created_Date
        };
    }
}

module.exports = GoogleSheetsService;