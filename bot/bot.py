#!/usr/bin/env python3
"""
Sant Padharamani Telegram Bot

This bot sends daily reminders about padharamanis to registered users.
It runs daily at 1 AM via Cloud Scheduler and can also be triggered via HTTP endpoint.
"""

import os
import logging
import asyncio
from datetime import datetime
from typing import List, Dict
from telegram import Bot, Update
from telegram.ext import Application, CommandHandler, ContextTypes
from flask import Flask, request, jsonify
import threading

# Import our services
from config.secret_manager import secret_manager
from services.sheets_service import sheets_service

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

class PadharamaniBot:
    """Main Telegram bot class"""
    
    def __init__(self):
        self.bot = None
        self.application = None
        self.bot_token = None
        
    async def initialize(self):
        """Initialize the bot with token from Secret Manager"""
        try:
            # Get bot token from Secret Manager
            self.bot_token = secret_manager.get_secret('telegram-bot-token')
            
            if not self.bot_token:
                raise Exception("Telegram bot token not found")
            
            # Initialize Sheets service
            await sheets_service.initialize()
            sheets_service.initialize_registered_users_sheet()
            
            # Create bot instance
            self.bot = Bot(token=self.bot_token)
            
            # Create application
            self.application = Application.builder().token(self.bot_token).build()
            
            # Add command handlers
            self.application.add_handler(CommandHandler("start", self.start_command))
            self.application.add_handler(CommandHandler("register", self.register_command))
            self.application.add_handler(CommandHandler("help", self.help_command))
            self.application.add_handler(CommandHandler("today", self.today_command))
            
            logger.info("Bot initialized successfully")
            
        except Exception as error:
            logger.error(f"Failed to initialize bot: {error}")
            raise error
    
    async def start_command(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Handle /start command"""
        welcome_message = """
🙏 Welcome to Sant Padharamani Bot!

This bot sends daily reminders about scheduled padharamanis.

Available commands:
/register - Register to receive daily reminders
/today - Get today's padharamanis
/help - Show this help message

To register for daily reminders, use the /register command.
        """
        
        await update.message.reply_text(welcome_message)
    
    async def register_command(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Handle /register command"""
        try:
            chat_id = update.effective_chat.id
            user = update.effective_user
            name = f"{user.first_name} {user.last_name or ''}".strip()
            
            # Add user to registered users sheet
            success = sheets_service.add_registered_user(chat_id, name)
            
            if success:
                message = f"""
✅ Registration successful!

Hello {name}, you have been registered to receive daily padharamani reminders at 1:00 AM.

You can use /today to get today's padharamanis anytime.
                """
            else:
                message = """
ℹ️ You are already registered for daily reminders.

Use /today to get today's padharamanis.
                """
            
            await update.message.reply_text(message)
            
        except Exception as error:
            logger.error(f"Error in register command: {error}")
            await update.message.reply_text(
                "❌ Registration failed. Please try again later."
            )
    
    async def help_command(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Handle /help command"""
        help_message = """
🤖 Sant Padharamani Bot Help

Available commands:
/start - Welcome message and overview
/register - Register to receive daily reminders at 1:00 AM
/today - Get today's scheduled padharamanis
/help - Show this help message

📅 Daily Reminders:
Registered users automatically receive reminders at 1:00 AM with details about the day's scheduled padharamanis.

📞 Contact Information:
Each reminder includes phone numbers and addresses that you can tap to call or get directions.

🔄 Updates:
The bot gets the latest information from the Sant Padharamani dashboard.
        """
        
        await update.message.reply_text(help_message)
    
    async def today_command(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Handle /today command"""
        try:
            padharamanis = sheets_service.get_todays_padharamanis()
            
            if not padharamanis:
                await update.message.reply_text(
                    "📅 No padharamanis scheduled for today."
                )
                return
            
            # Format and send today's padharamanis
            messages = self.format_padharamani_messages(padharamanis)
            
            for message in messages:
                await update.message.reply_text(message, parse_mode='HTML')
                
        except Exception as error:
            logger.error(f"Error in today command: {error}")
            await update.message.reply_text(
                "❌ Failed to get today's padharamanis. Please try again later."
            )
    
    def format_padharamani_messages(self, padharamanis: List[Dict]) -> List[str]:
        """Format padharamani data into Telegram messages"""
        messages = []
        
        header = f"📅 <b>Padharamani Reminders - {datetime.now().strftime('%A, %B %d, %Y')}</b>\n\n"
        
        current_message = header
        message_length = len(header)
        
        for i, p in enumerate(padharamanis):
            # Format individual padharamani
            padharamani_text = self.format_single_padharamani(p, i + 1)
            
            # Check if adding this padharamani would exceed Telegram's message limit
            if message_length + len(padharamani_text) > 4000:  # Leave some buffer
                messages.append(current_message)
                current_message = padharamani_text
                message_length = len(padharamani_text)
            else:
                current_message += padharamani_text
                message_length += len(padharamani_text)
        
        if current_message:
            messages.append(current_message)
        
        return messages
    
    def format_single_padharamani(self, padharamani: Dict, index: int) -> str:
        """Format a single padharamani for Telegram"""
        name = padharamani.get('name', 'N/A')
        phone = padharamani.get('phone', '')
        address = padharamani.get('address', '')
        city = padharamani.get('city', '')
        beginning_time = padharamani.get('beginning_time', '')
        ending_time = padharamani.get('ending_time', '')
        volunteer = padharamani.get('transport_volunteer', '')
        volunteer_phone = padharamani.get('volunteer_number', '')
        comments = padharamani.get('comments', '')
        
        # Format time
        time_str = ""
        if beginning_time and ending_time:
            time_str = f"{beginning_time} - {ending_time}"
        elif beginning_time:
            time_str = f"From {beginning_time}"
        
        # Create the message
        message = f"<b>{index}. {name}</b>\n"
        
        if time_str:
            message += f"⏰ Time: {time_str}\n"
        
        if phone:
            message += f"📞 Phone: <a href=\"tel:{phone}\">{phone}</a>\n"
        
        if address and city:
            # Create Google Maps link
            location = f"{address}, {city}"
            maps_link = f"https://www.google.com/maps/search/{location.replace(' ', '+')}"
            message += f"📍 Address: <a href=\"{maps_link}\">{location}</a>\n"
        elif address:
            message += f"📍 Address: {address}\n"
        
        if volunteer:
            message += f"🚗 Volunteer: {volunteer}"
            if volunteer_phone:
                message += f" (<a href=\"tel:{volunteer_phone}\">{volunteer_phone}</a>)"
            message += "\n"
        
        if comments:
            message += f"💬 Comments: {comments}\n"
        
        message += "\n"
        
        return message
    
    async def send_daily_reminders(self):
        """Send daily reminders to all registered users"""
        try:
            logger.info("Starting daily reminder process")
            
            # Get today's padharamanis
            padharamanis = sheets_service.get_todays_padharamanis()
            
            if not padharamanis:
                logger.info("No padharamanis for today, skipping reminders")
                return
            
            # Get registered users
            users = sheets_service.get_registered_users()
            
            if not users:
                logger.info("No registered users found")
                return
            
            # Format messages
            messages = self.format_padharamani_messages(padharamanis)
            
            # Send to each registered user
            success_count = 0
            error_count = 0
            
            for user in users:
                try:
                    chat_id = user['chat_id']
                    name = user['name']
                    
                    # Send each message
                    for message in messages:
                        await self.bot.send_message(
                            chat_id=chat_id,
                            text=message,
                            parse_mode='HTML'
                        )
                        # Small delay between messages
                        await asyncio.sleep(0.5)
                    
                    success_count += 1
                    logger.info(f"Sent reminder to {name} ({chat_id})")
                    
                    # Delay between users to avoid rate limits
                    await asyncio.sleep(1)
                    
                except Exception as user_error:
                    error_count += 1
                    logger.error(f"Failed to send reminder to user {user['chat_id']}: {user_error}")
            
            logger.info(f"Daily reminders completed: {success_count} successful, {error_count} failed")
            
        except Exception as error:
            logger.error(f"Error in daily reminders: {error}")
    
    async def start_polling(self):
        """Start the bot in polling mode (for development)"""
        try:
            await self.application.initialize()
            await self.application.start()
            await self.application.updater.start_polling()
            logger.info("Bot started in polling mode")
            
            # Keep the bot running
            await self.application.updater.idle()
            
        except Exception as error:
            logger.error(f"Error starting bot polling: {error}")
        finally:
            await self.application.stop()

# Global bot instance
padharamani_bot = PadharamaniBot()

# Flask app for Cloud Run HTTP endpoint
app = Flask(__name__)

@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        'status': 'healthy',
        'timestamp': datetime.now().isoformat(),
        'service': 'sant-padharamani-bot'
    })

@app.route('/send-reminders', methods=['POST'])
def send_reminders():
    """HTTP endpoint to trigger daily reminders"""
    try:
        # Verify the request is from Cloud Scheduler (optional)
        # You can add authentication here if needed
        
        logger.info("Received reminder trigger request")
        
        # Run the reminder process in a separate thread
        def run_reminders():
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            loop.run_until_complete(padharamani_bot.send_daily_reminders())
            loop.close()
        
        thread = threading.Thread(target=run_reminders)
        thread.start()
        thread.join(timeout=300)  # 5 minute timeout
        
        return jsonify({
            'status': 'success',
            'message': 'Daily reminders sent',
            'timestamp': datetime.now().isoformat()
        })
        
    except Exception as error:
        logger.error(f"Error in send_reminders endpoint: {error}")
        return jsonify({
            'status': 'error',
            'message': str(error),
            'timestamp': datetime.now().isoformat()
        }), 500

@app.route('/webhook', methods=['POST'])
def webhook():
    """Webhook endpoint for Telegram updates"""
    try:
        update = Update.de_json(request.get_json(), padharamani_bot.bot)
        
        # Process the update in a separate thread
        def process_update():
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            loop.run_until_complete(padharamani_bot.application.process_update(update))
            loop.close()
        
        thread = threading.Thread(target=process_update)
        thread.start()
        
        return jsonify({'status': 'ok'})
        
    except Exception as error:
        logger.error(f"Error processing webhook: {error}")
        return jsonify({'status': 'error', 'message': str(error)}), 500

async def initialize_bot():
    """Initialize the bot"""
    try:
        await padharamani_bot.initialize()
        logger.info("Bot initialization completed")
    except Exception as error:
        logger.error(f"Failed to initialize bot: {error}")
        raise error

def main():
    """Main function"""
    # Initialize bot
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    loop.run_until_complete(initialize_bot())
    
    # Check if running in Cloud Run (production) or locally
    if os.getenv('K_SERVICE'):
        # Running in Cloud Run - start Flask server
        port = int(os.getenv('PORT', 8080))
        logger.info(f"Starting Flask server on port {port}")
        app.run(host='0.0.0.0', port=port, debug=False)
    else:
        # Running locally - start polling mode
        logger.info("Starting bot in polling mode for development")
        loop.run_until_complete(padharamani_bot.start_polling())

if __name__ == '__main__':
    main()