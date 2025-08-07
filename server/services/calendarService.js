const googleAuthConfig = require('../config/googleAuth');
const secretManager = require('../config/secretManager');

class CalendarService {
    constructor() {
        this.calendarClient = null;
        this.calendarId = null;
    }

    /**
     * Initialize the calendar service
     */
    async initialize() {
        try {
            this.calendarClient = await googleAuthConfig.getCalendarClient();
            this.calendarId = await secretManager.getSecret('google-calendar-id');
            console.log('Calendar service initialized');
        } catch (error) {
            console.error('Failed to initialize calendar service:', error.message);
            throw error;
        }
    }

    /**
     * Get calendar client (initialize if needed)
     */
    async getCalendarClient() {
        if (!this.calendarClient) {
            await this.initialize();
        }
        return this.calendarClient;
    }

    /**
     * Get the calendar ID
     */
    async getCalendarId() {
        if (!this.calendarId) {
            this.calendarId = await secretManager.getSecret('google-calendar-id');
        }
        return this.calendarId;
    }

    /**
     * Create or update a calendar event for a padharamani
     */
    async createOrUpdatePadharamaniEvent(padharamaniData, eventId = null) {
        try {
            const client = await this.getCalendarClient();
            const calendarId = await this.getCalendarId();

            // Create event object
            const event = this.createEventFromPadharamani(padharamaniData);

            let response;
            if (eventId) {
                // Update existing event
                response = await client.events.update({
                    calendarId: calendarId,
                    eventId: eventId,
                    requestBody: event
                });
                console.log('Calendar event updated:', response.data.id);
            } else {
                // Create new event
                response = await client.events.insert({
                    calendarId: calendarId,
                    requestBody: event
                });
                console.log('Calendar event created:', response.data.id);
            }

            return response.data.id;
        } catch (error) {
            console.error('Error creating/updating calendar event:', error.message);
            throw error;
        }
    }

    /**
     * Delete a calendar event
     */
    async deletePadharamaniEvent(eventId) {
        try {
            const client = await this.getCalendarClient();
            const calendarId = await this.getCalendarId();

            await client.events.delete({
                calendarId: calendarId,
                eventId: eventId
            });

            console.log('Calendar event deleted:', eventId);
            return true;
        } catch (error) {
            if (error.code === 404) {
                console.log('Event not found, already deleted:', eventId);
                return true;
            }
            console.error('Error deleting calendar event:', error.message);
            throw error;
        }
    }

    /**
     * Create a Google Calendar event object from padharamani data
     */
    createEventFromPadharamani(padharamaniData) {
        const {
            date,
            beginningTime,
            endingTime,
            name,
            address,
            city,
            phone,
            email,
            comments,
            transportVolunteer,
            volunteerNumber,
            zoneCoordinator,
            zoneCoordinatorPhone
        } = padharamaniData;

        // Create start and end datetime
        const startDateTime = this.createDateTime(date, beginningTime);
        const endDateTime = this.createDateTime(date, endingTime);

        // Create description with all relevant details
        const description = this.createEventDescription({
            phone,
            email,
            comments,
            transportVolunteer,
            volunteerNumber,
            zoneCoordinator,
            zoneCoordinatorPhone
        });

        // Create location string
        const location = `${address}, ${city}`;

        const event = {
            summary: `Padharamani: ${name}`,
            description: description,
            location: location,
            start: {
                dateTime: startDateTime,
                timeZone: 'America/New_York' // Adjust timezone as needed
            },
            end: {
                dateTime: endDateTime,
                timeZone: 'America/New_York' // Adjust timezone as needed
            },
            reminders: {
                useDefault: false,
                overrides: [
                    { method: 'popup', minutes: 60 }, // 1 hour before
                    { method: 'popup', minutes: 15 }  // 15 minutes before
                ]
            }
        };

        // Add attendee if email is provided
        if (email) {
            event.attendees = [
                { email: email, displayName: name }
            ];
        }

        return event;
    }

    /**
     * Create a datetime string from date and time
     */
    createDateTime(date, time) {
        if (!date || !time) {
            // Default to date at 9 AM if time is not provided
            const defaultTime = time || '09:00';
            return new Date(`${date}T${defaultTime}:00`).toISOString();
        }

        // Ensure time is in HH:MM format
        const formattedTime = time.length === 5 ? time : time.substring(0, 5);
        return new Date(`${date}T${formattedTime}:00`).toISOString();
    }

    /**
     * Create event description from padharamani details
     */
    createEventDescription(details) {
        const {
            phone,
            email,
            comments,
            transportVolunteer,
            volunteerNumber,
            zoneCoordinator,
            zoneCoordinatorPhone
        } = details;

        let description = 'Padharamani Details:\n\n';

        if (phone) {
            description += `📞 Phone: ${phone}\n`;
        }

        if (email) {
            description += `✉️ Email: ${email}\n`;
        }

        if (transportVolunteer) {
            description += `🚗 Transport Volunteer: ${transportVolunteer}\n`;
            if (volunteerNumber) {
                description += `📱 Volunteer Phone: ${volunteerNumber}\n`;
            }
        }

        if (zoneCoordinator) {
            description += `👤 Zone Coordinator: ${zoneCoordinator}\n`;
            if (zoneCoordinatorPhone) {
                description += `📞 Coordinator Phone: ${zoneCoordinatorPhone}\n`;
            }
        }

        if (comments) {
            description += `\n💬 Comments: ${comments}\n`;
        }

        description += '\n---\nGenerated by Sant Padharamani Dashboard';

        return description;
    }

    /**
     * Find existing event by padharamani details
     */
    async findExistingEvent(padharamaniData) {
        try {
            const client = await this.getCalendarClient();
            const calendarId = await this.getCalendarId();

            // Search for events with matching title
            const searchQuery = `Padharamani: ${padharamaniData.name}`;
            
            const response = await client.events.list({
                calendarId: calendarId,
                q: searchQuery,
                timeMin: new Date(padharamaniData.date).toISOString(),
                timeMax: new Date(new Date(padharamaniData.date).getTime() + 24 * 60 * 60 * 1000).toISOString(),
                singleEvents: true,
                orderBy: 'startTime'
            });

            const events = response.data.items || [];
            return events.length > 0 ? events[0].id : null;
        } catch (error) {
            console.error('Error finding existing event:', error.message);
            return null;
        }
    }

    /**
     * Sync a padharamani with calendar (create if not exists, update if exists)
     */
    async syncPadharamaniToCalendar(padharamaniData) {
        try {
            const existingEventId = await this.findExistingEvent(padharamaniData);
            const eventId = await this.createOrUpdatePadharamaniEvent(padharamaniData, existingEventId);
            return eventId;
        } catch (error) {
            console.error('Error syncing padharamani to calendar:', error.message);
            throw error;
        }
    }

    /**
     * Handle padharamani cancellation
     */
    async cancelPadharamaniEvent(padharamaniData) {
        try {
            const existingEventId = await this.findExistingEvent(padharamaniData);
            if (existingEventId) {
                await this.deletePadharamaniEvent(existingEventId);
            }
            return true;
        } catch (error) {
            console.error('Error canceling padharamani event:', error.message);
            throw error;
        }
    }
}

// Create singleton instance
const calendarService = new CalendarService();

// Export both the instance and helper functions
module.exports = {
    calendarService,
    createOrUpdatePadharamaniEvent: (data, eventId) => calendarService.createOrUpdatePadharamaniEvent(data, eventId),
    deletePadharamaniEvent: (eventId) => calendarService.deletePadharamaniEvent(eventId),
    syncPadharamaniToCalendar: (data) => calendarService.syncPadharamaniToCalendar(data),
    cancelPadharamaniEvent: (data) => calendarService.cancelPadharamaniEvent(data)
};