# Sant Padharamani Dashboard

A secure web dashboard to manage padharamani (visits) for devotees, featuring Google Sheets integration, Google OAuth authentication, Telegram bot reminders, and Google Calendar sync. Deployed on Google Cloud Platform (GCP) using Cloud Run with secure secrets management.

## 🏗️ Architecture

- **Frontend**: React with CDN-hosted libraries, Tailwind CSS
- **Backend**: Node.js with Express, Google APIs integration
- **Authentication**: Google OAuth 2.0 with approved user list
- **Database**: Google Sheets for data storage
- **Bot**: Python Telegram bot for daily reminders
- **Calendar**: Google Calendar sync for all padharamanis
- **Hosting**: Google Cloud Run with continuous deployment
- **Secrets**: Google Cloud Secret Manager (no secrets in code/Docker)

## 📋 Features

### Dashboard Pages
1. **Upcoming Padharamani** - View upcoming visits grouped by date
2. **Archived Padharamani** - Browse past visits with filtering
3. **Schedule Padharamani** - Quick form for basic scheduling
4. **Add Padharamani** - Full form with all details and calendar sync

### Security Features
- Google OAuth 2.0 authentication
- Approved user list stored in Google Sheets
- JWT-based API authentication
- All secrets stored in Google Cloud Secret Manager
- Rate limiting and security headers

### Integrations
- **Google Sheets**: Data storage and retrieval
- **Google Calendar**: Automatic event creation/updates
- **Telegram Bot**: Daily reminders at 1 AM
- **Cloud Scheduler**: Triggers bot reminders

## 🚀 Quick Start

### Prerequisites

1. **Google Cloud Project** with billing enabled
2. **Google APIs** enabled:
   - Google Sheets API
   - Google Calendar API
   - Google OAuth2 API
   - Cloud Run API
   - Cloud Build API
   - Cloud Scheduler API
   - Secret Manager API

3. **Google Sheets** created:
   - Main padharamani data sheet
   - Approved users sheet (emails in column A)
   - Telegram users sheet (for bot registrations)

4. **Telegram Bot** created via [@BotFather](https://t.me/botfather)

### Local Development

1. **Clone and setup**:
   ```bash
   git clone <your-repo-url>
   cd Sant-Padhramani
   npm install
   ```

2. **Create `.env` file** (copy from `.env.example`):
   ```bash
   cp .env.example .env
   # Edit .env with your local development values
   ```

3. **Setup Google Service Account**:
   - Create service account with Sheets/Calendar permissions
   - Download credentials JSON file
   - Set `GOOGLE_APPLICATION_CREDENTIALS` path in `.env`

4. **Start development server**:
   ```bash
   npm run dev
   # Access at http://localhost:8080
   ```

5. **Run Telegram Bot locally**:
   ```bash
   cd bot
   pip install -r requirements.txt
   python bot.py
   ```

## ☁️ Production Deployment

### Step 1: Setup Google Cloud Project

```bash
# Set your project
gcloud config set project YOUR_PROJECT_ID

# Enable required APIs
gcloud services enable run.googleapis.com
gcloud services enable cloudbuild.googleapis.com
gcloud services enable secretmanager.googleapis.com
gcloud services enable cloudscheduler.googleapis.com
gcloud services enable sheets.googleapis.com
gcloud services enable calendar-json.googleapis.com
```

### Step 2: Create Secrets in Secret Manager

```bash
# Google OAuth credentials
gcloud secrets create google-client-id --data-file=<(echo "YOUR_GOOGLE_CLIENT_ID")
gcloud secrets create google-client-secret --data-file=<(echo "YOUR_GOOGLE_CLIENT_SECRET")

# Google service account credentials (upload the JSON file)
gcloud secrets create google-service-account-credentials --data-file=path/to/service-account.json

# Sheet and Calendar IDs
gcloud secrets create google-sheet-id --data-file=<(echo "YOUR_SHEET_ID")
gcloud secrets create approved-users-sheet-id --data-file=<(echo "YOUR_APPROVED_USERS_SHEET_ID")
gcloud secrets create telegram-users-sheet-id --data-file=<(echo "YOUR_TELEGRAM_USERS_SHEET_ID")
gcloud secrets create google-calendar-id --data-file=<(echo "YOUR_CALENDAR_ID")

# JWT secret (generate a strong random secret)
gcloud secrets create jwt-secret --data-file=<(echo "$(openssl rand -base64 64)")

# Telegram bot token
gcloud secrets create telegram-bot-token --data-file=<(echo "YOUR_TELEGRAM_BOT_TOKEN")
```

### Step 3: Setup IAM Permissions

```bash
# Get the default Cloud Run service account
PROJECT_NUMBER=$(gcloud projects describe YOUR_PROJECT_ID --format="value(projectNumber)")
SERVICE_ACCOUNT="$PROJECT_NUMBER-compute@developer.gserviceaccount.com"

# Grant Secret Manager access
gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
    --member="serviceAccount:$SERVICE_ACCOUNT" \
    --role="roles/secretmanager.secretAccessor"
```

### Step 4: Deploy Main Application

1. **Create Cloud Build trigger**:
   ```bash
   # Connect your GitHub repo to Cloud Build
   gcloud builds triggers create github \
       --repo-name="YOUR_REPO_NAME" \
       --repo-owner="YOUR_GITHUB_USERNAME" \
       --branch-pattern="^main$" \
       --build-config="cloudbuild.yaml"
   ```

2. **Create `cloudbuild.yaml`**:
   ```yaml
   steps:
     # Build and deploy main application
     - name: 'gcr.io/cloud-builders/docker'
       args: ['build', '-t', 'gcr.io/$PROJECT_ID/sant-padharamani:$COMMIT_SHA', '.']
     - name: 'gcr.io/cloud-builders/docker'
       args: ['push', 'gcr.io/$PROJECT_ID/sant-padharamani:$COMMIT_SHA']
     - name: 'gcr.io/cloud-builders/gcloud'
       args: 
         - 'run'
         - 'deploy'
         - 'sant-padharamani'
         - '--image=gcr.io/$PROJECT_ID/sant-padharamani:$COMMIT_SHA'
         - '--platform=managed'
         - '--region=us-central1'
         - '--allow-unauthenticated'
         - '--set-env-vars=GOOGLE_CLOUD_PROJECT_ID=$PROJECT_ID,NODE_ENV=production'
     
     # Build and deploy Telegram bot
     - name: 'gcr.io/cloud-builders/docker'
       args: ['build', '-t', 'gcr.io/$PROJECT_ID/sant-padharamani-bot:$COMMIT_SHA', './bot']
     - name: 'gcr.io/cloud-builders/docker'
       args: ['push', 'gcr.io/$PROJECT_ID/sant-padharamani-bot:$COMMIT_SHA']
     - name: 'gcr.io/cloud-builders/gcloud'
       args: 
         - 'run'
         - 'deploy'
         - 'sant-padharamani-bot'
         - '--image=gcr.io/$PROJECT_ID/sant-padharamani-bot:$COMMIT_SHA'
         - '--platform=managed'
         - '--region=us-central1'
         - '--no-allow-unauthenticated'
         - '--set-env-vars=GOOGLE_CLOUD_PROJECT_ID=$PROJECT_ID'
   ```

3. **Deploy manually** (alternative to auto-deploy):
   ```bash
   # Build and deploy main app
   gcloud builds submit --tag gcr.io/YOUR_PROJECT_ID/sant-padharamani
   gcloud run deploy sant-padharamani \
       --image gcr.io/YOUR_PROJECT_ID/sant-padharamani \
       --platform managed \
       --region us-central1 \
       --allow-unauthenticated \
       --set-env-vars GOOGLE_CLOUD_PROJECT_ID=YOUR_PROJECT_ID,NODE_ENV=production

   # Build and deploy bot
   gcloud builds submit --tag gcr.io/YOUR_PROJECT_ID/sant-padharamani-bot ./bot
   gcloud run deploy sant-padharamani-bot \
       --image gcr.io/YOUR_PROJECT_ID/sant-padharamani-bot \
       --platform managed \
       --region us-central1 \
       --no-allow-unauthenticated \
       --set-env-vars GOOGLE_CLOUD_PROJECT_ID=YOUR_PROJECT_ID
   ```

### Step 5: Setup OAuth Redirect URI

1. **Get your Cloud Run URL**:
   ```bash
   gcloud run services describe sant-padharamani \
       --region=us-central1 \
       --format="value(status.url)"
   ```

2. **Add redirect URI** in Google Cloud Console:
   - Go to APIs & Services > Credentials
   - Edit your OAuth 2.0 Client ID
   - Add authorized redirect URI: `https://YOUR_CLOUD_RUN_URL/auth/callback`

### Step 6: Setup Cloud Scheduler for Bot

```bash
# Get bot service URL
BOT_URL=$(gcloud run services describe sant-padharamani-bot --region=us-central1 --format="value(status.url)")

# Create daily scheduler job
gcloud scheduler jobs create http daily-padharamani-reminders \
    --schedule="0 1 * * *" \
    --uri="$BOT_URL/send-reminders" \
    --http-method=POST \
    --time-zone="America/New_York" \
    --description="Daily padharamani reminders at 1 AM"
```

## 📚 Google Sheets Setup

### Main Padharamani Sheet

Create a Google Sheet with these columns (Row 1):

| A | B | C | D | E | F | G | H | I | J | K | L | M | N |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Date | Beginning Time | Ending Time | Name | Address | City | Email | Phone | Transport Volunteer | Volunteer's Number | Comments | Zone Coordinator | Zone Coordinator's Phone Number | Status |

### Approved Users Sheet

Create a Google Sheet with email addresses in column A:

| A |
|---|
| admin@example.com |
| user1@example.com |
| user2@example.com |

### Telegram Users Sheet

The bot will automatically create this structure:

| A | B | C |
|---|---|---|
| Chat ID | Name | Registration Date |

## 🤖 Telegram Bot Usage

### User Commands
- `/start` - Welcome message and overview
- `/register` - Register for daily reminders
- `/today` - Get today's padharamanis
- `/help` - Show help message

### Bot Features
- Daily reminders sent at 1 AM to registered users
- Clickable phone numbers and Google Maps links
- HTML-formatted messages with emojis
- Automatic registration management via Google Sheets

## 🔒 Security Features

### Authentication Flow
1. User clicks "Login" → redirected to Google OAuth
2. Google returns with authorization code
3. Server exchanges code for user info
4. Server checks if email is in approved users sheet
5. If approved, generates JWT token and sets cookie
6. Client stores token for API calls

### Secret Management
- **Never** store secrets in code or Docker images
- All secrets stored in Google Cloud Secret Manager
- Secrets cached for 5 minutes to reduce API calls
- Fallback to environment variables for local development

### API Security
- JWT authentication on all API endpoints
- Rate limiting (100 requests per 15 minutes)
- CORS configuration for specific domains
- Security headers via Helmet.js

## 📊 Monitoring and Logs

### View Logs
```bash
# Main application logs
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=sant-padharamani" --limit=50

# Bot logs
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=sant-padharamani-bot" --limit=50
```

### Health Checks
- Main app: `https://YOUR_CLOUD_RUN_URL/health`
- Bot: `https://YOUR_BOT_URL/health`

## 🛠️ Development

### Project Structure
```
sant-padharamani/
├── client/                     # React frontend
│   └── index.html             # Single-page app with CDN React
├── server/                     # Node.js backend
│   ├── config/                # Authentication and Secret Manager
│   ├── middleware/            # JWT auth middleware
│   ├── routes/                # API routes
│   ├── services/              # Google Sheets/Calendar services
│   └── index.js               # Express server
├── bot/                       # Python Telegram bot
│   ├── config/                # Secret Manager client
│   ├── services/              # Sheets service
│   ├── bot.py                 # Main bot application
│   └── requirements.txt       # Python dependencies
├── Dockerfile                 # Main app container
├── .env.example              # Environment variables template
├── package.json              # Node.js dependencies
└── README.md                 # This file
```

### Environment Variables

#### Local Development (.env file)
```bash
# Google OAuth
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_REDIRECT_URI=http://localhost:8080/auth/callback

# Google Sheets & Calendar
GOOGLE_SHEET_ID=your-sheet-id
APPROVED_USERS_SHEET_ID=your-approved-users-sheet-id
TELEGRAM_USERS_SHEET_ID=your-telegram-users-sheet-id
GOOGLE_CALENDAR_ID=your-calendar-id

# Service Account (local only)
GOOGLE_APPLICATION_CREDENTIALS=./path/to/service-account.json

# App Config
JWT_SECRET=your-local-jwt-secret
PORT=8080
NODE_ENV=development

# Telegram Bot
TELEGRAM_BOT_TOKEN=your-bot-token
```

#### Production (Cloud Run Environment Variables)
```bash
GOOGLE_CLOUD_PROJECT_ID=your-project-id
NODE_ENV=production
# Secrets are accessed via Secret Manager, not env vars
```

## 🔧 Troubleshooting

### Common Issues

1. **OAuth Error**: Check redirect URI matches exactly
2. **Sheet Access Error**: Verify service account has edit permissions
3. **Secret Not Found**: Ensure secret exists in Secret Manager
4. **Bot Not Responding**: Check if bot token is valid and stored correctly
5. **Calendar Sync Failed**: Verify Calendar API is enabled and service account has access

### Debug Commands
```bash
# Test Secret Manager access
gcloud secrets versions access latest --secret="google-client-id"

# View Cloud Run services
gcloud run services list

# Check IAM permissions
gcloud projects get-iam-policy YOUR_PROJECT_ID

# Test bot endpoint
curl -X POST "https://YOUR_BOT_URL/send-reminders"
```

## 📱 VS Code Integration

### Recommended Extensions
- Docker
- Google Cloud Code
- Python
- JavaScript

### VS Code Tasks (`.vscode/tasks.json`)
```json
{
    "version": "2.0.0",
    "tasks": [
        {
            "label": "Build Docker Image",
            "type": "shell",
            "command": "docker build -t sant-padharamani .",
            "group": "build"
        },
        {
            "label": "Deploy to Cloud Run",
            "type": "shell",
            "command": "gcloud builds submit --tag gcr.io/${GOOGLE_CLOUD_PROJECT}/sant-padharamani",
            "group": "build"
        }
    ]
}
```

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📞 Support

For issues and questions:
- Check the troubleshooting section
- Review logs using the commands above
- Open an issue in the repository

---

**Made with ❤️ for the Sant Padharamani community**