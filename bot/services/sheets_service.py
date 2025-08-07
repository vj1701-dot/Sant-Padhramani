import logging
from google.oauth2.service_account import Credentials
from googleapiclient.discovery import build
from typing import List, Dict, Optional
from config.secret_manager import secret_manager
from datetime import datetime

logger = logging.getLogger(__name__)

class SheetsService:
    """
    Google Sheets service for reading padharamani data
    """
    
    def __init__(self):
        self.service = None
        self.sheet_id = None
        self.registered_users_sheet_id = None
    
    async def initialize(self):
        """Initialize the Google Sheets service"""
        try:
            # Get service account credentials
            credentials_dict = secret_manager.get_service_account_credentials()
            credentials = Credentials.from_service_account_info(
                credentials_dict,
                scopes=['https://www.googleapis.com/auth/spreadsheets.readonly']
            )
            
            # Build the service
            self.service = build('sheets', 'v4', credentials=credentials)
            
            # Get sheet IDs
            self.sheet_id = secret_manager.get_secret('google-sheet-id')
            self.registered_users_sheet_id = secret_manager.get_secret('telegram-users-sheet-id')
            
            logger.info("Sheets service initialized successfully")
        except Exception as error:
            logger.error(f"Failed to initialize sheets service: {error}")
            raise error
    
    def get_todays_padharamanis(self) -> List[Dict]:
        """
        Get today's padharamanis from Google Sheet
        
        Returns:
            List of padharamani dictionaries
        """
        try:
            if not self.service:
                raise Exception("Sheets service not initialized")
            
            # Get today's date in YYYY-MM-DD format
            today = datetime.now().strftime('%Y-%m-%d')
            
            # Read all data from the sheet
            result = self.service.spreadsheets().values().get(
                spreadsheetId=self.sheet_id,
                range='Sheet1!A:N'
            ).execute()
            
            values = result.get('values', [])
            
            if not values:
                logger.info("No data found in sheet")
                return []
            
            # Skip header row and convert to objects
            padharamanis = []
            for i, row in enumerate(values[1:], start=2):  # Start from row 2
                # Ensure row has enough columns
                while len(row) < 14:
                    row.append('')
                
                padharamani = {
                    'row_number': i,
                    'date': row[0],
                    'beginning_time': row[1],
                    'ending_time': row[2],
                    'name': row[3],
                    'address': row[4],
                    'city': row[5],
                    'email': row[6],
                    'phone': row[7],
                    'transport_volunteer': row[8],
                    'volunteer_number': row[9],
                    'comments': row[10],
                    'zone_coordinator': row[11],
                    'zone_coordinator_phone': row[12],
                    'status': row[13] or 'Scheduled'
                }
                
                # Filter for today's padharamanis that are not canceled
                if (padharamani['date'] == today and 
                    padharamani['status'].lower() != 'canceled' and
                    padharamani['name']):  # Ensure name is not empty
                    padharamanis.append(padharamani)
            
            # Sort by beginning time
            padharamanis.sort(key=lambda x: x['beginning_time'] or '00:00')
            
            logger.info(f"Found {len(padharamanis)} padharamanis for today")
            return padharamanis
            
        except Exception as error:
            logger.error(f"Error getting today's padharamanis: {error}")
            return []
    
    def get_registered_users(self) -> List[Dict]:
        """
        Get registered Telegram users from Google Sheet
        
        Returns:
            List of user dictionaries with chat_id and name
        """
        try:
            if not self.service:
                raise Exception("Sheets service not initialized")
            
            # Read registered users data
            result = self.service.spreadsheets().values().get(
                spreadsheetId=self.registered_users_sheet_id,
                range='Sheet1!A:C'  # Columns: Chat ID, Name, Registration Date
            ).execute()
            
            values = result.get('values', [])
            
            if not values or len(values) < 2:  # No data beyond headers
                logger.info("No registered users found")
                return []
            
            # Skip header row and convert to objects
            users = []
            for row in values[1:]:
                if len(row) >= 2 and row[0]:  # Ensure chat_id exists
                    users.append({
                        'chat_id': int(row[0]),
                        'name': row[1] if len(row) > 1 else 'Unknown',
                        'registration_date': row[2] if len(row) > 2 else ''
                    })
            
            logger.info(f"Found {len(users)} registered users")
            return users
            
        except Exception as error:
            logger.error(f"Error getting registered users: {error}")
            return []
    
    def add_registered_user(self, chat_id: int, name: str) -> bool:
        """
        Add a new registered user to the sheet
        
        Args:
            chat_id: Telegram chat ID
            name: User's name
            
        Returns:
            True if successful, False otherwise
        """
        try:
            if not self.service:
                raise Exception("Sheets service not initialized")
            
            # Check if user is already registered
            existing_users = self.get_registered_users()
            for user in existing_users:
                if user['chat_id'] == chat_id:
                    logger.info(f"User {chat_id} is already registered")
                    return False
            
            # Add new user
            current_date = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
            values = [[chat_id, name, current_date]]
            
            result = self.service.spreadsheets().values().append(
                spreadsheetId=self.registered_users_sheet_id,
                range='Sheet1!A:C',
                valueInputOption='RAW',
                body={'values': values}
            ).execute()
            
            logger.info(f"User {name} ({chat_id}) registered successfully")
            return True
            
        except Exception as error:
            logger.error(f"Error adding registered user: {error}")
            return False
    
    def initialize_registered_users_sheet(self):
        """Initialize the registered users sheet with headers if empty"""
        try:
            if not self.service:
                raise Exception("Sheets service not initialized")
            
            # Check if the sheet has headers
            result = self.service.spreadsheets().values().get(
                spreadsheetId=self.registered_users_sheet_id,
                range='Sheet1!A1:C1'
            ).execute()
            
            values = result.get('values', [])
            
            if not values or not values[0]:
                # Add headers
                headers = [['Chat ID', 'Name', 'Registration Date']]
                
                self.service.spreadsheets().values().update(
                    spreadsheetId=self.registered_users_sheet_id,
                    range='Sheet1!A1:C1',
                    valueInputOption='RAW',
                    body={'values': headers}
                ).execute()
                
                logger.info("Registered users sheet initialized with headers")
                
        except Exception as error:
            logger.error(f"Error initializing registered users sheet: {error}")

# Create singleton instance
sheets_service = SheetsService()