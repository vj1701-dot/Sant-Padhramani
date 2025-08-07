# 🚀 Sant Padharamani - GCP Deployment Guide

This guide provides two deployment scripts to deploy the entire Sant Padharamani project to Google Cloud Platform.

## 📋 Prerequisites

1. **Google Cloud SDK** installed and authenticated
   ```bash
   # Install gcloud CLI
   curl https://sdk.cloud.google.com | bash
   
   # Authenticate
   gcloud auth login
   gcloud auth application-default login
   ```

2. **Required Google Cloud APIs** (will be enabled automatically by scripts)
3. **Google Sheets** created with proper structure
4. **Telegram Bot** created via [@BotFather](https://t.me/botfather)
5. **Google Calendar** for events sync

## 🎯 Deployment Options

### Option 1: Quick Deploy (Recommended)

**Best for**: First-time deployment with minimal interaction

1. **Configure your deployment**:
   ```bash
   cp deploy-config.env deploy-config.env.local
   # Edit deploy-config.env.local with your actual values
   ```

2. **Fill in the configuration file**:
   ```bash
   # Example deploy-config.env.local
   PROJECT_ID="my-sant-padharamani-project"
   GOOGLE_CLIENT_ID="123456789-abc.apps.googleusercontent.com"
   GOOGLE_CLIENT_SECRET="GOCSPX-abc123def456"
   GOOGLE_SHEET_ID="1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms"
   # ... fill in all required values
   ```

3. **Run the deployment**:
   ```bash
   ./quick-deploy.sh
   ```

### Option 2: Interactive Deploy

**Best for**: Custom configuration or step-by-step deployment

1. **Run the interactive script**:
   ```bash
   ./deploy.sh
   ```

2. **Follow the prompts** to enter your configuration values

## 📝 Configuration Values Needed

### Google Cloud Project
- **Project ID**: Your GCP project identifier
- **Region**: Deployment region (default: `us-central1`)

### Google OAuth 2.0
- **Client ID**: From Google Cloud Console > APIs & Services > Credentials
- **Client Secret**: From the same OAuth client

### Google Sheets IDs
Get these from your Google Sheets URLs:
```
https://docs.google.com/spreadsheets/d/SHEET_ID/edit
                                      ^^^^^^^^^^^
```

- **Main Sheet**: Stores padharamani data
- **Approved Users Sheet**: Email whitelist (column A)
- **Telegram Users Sheet**: Bot registrations (auto-created)

### Google Calendar
- **Calendar ID**: From Calendar Settings > Calendar ID

### Telegram Bot
- **Bot Token**: From [@BotFather](https://t.me/botfather) after creating bot

## 🛠️ What the Scripts Do

### Automated Steps:
1. ✅ Enable required Google Cloud APIs
2. ✅ Create/update secrets in Secret Manager
3. ✅ Create service account with proper permissions
4. ✅ Build and deploy main application to Cloud Run
5. ✅ Build and deploy Telegram bot to Cloud Run
6. ✅ Setup Cloud Scheduler for daily reminders
7. ✅ Configure IAM permissions
8. ✅ Optional: Setup continuous deployment

### Manual Steps After Deployment:
1. 🔐 Add OAuth redirect URI to Google Cloud Console
2. 📊 Share Google Sheets with service account
3. 📅 Share Google Calendar with service account
4. 🤖 Test Telegram bot functionality

## 📊 Google Sheets Setup

### Main Padharamani Sheet Structure:
| Column | Header | Description |
|--------|--------|-------------|
| A | Date | YYYY-MM-DD format |
| B | Beginning Time | HH:MM format |
| C | Ending Time | HH:MM format |
| D | Name | Person's name |
| E | Address | Street address |
| F | City | City name |
| G | Email | Email address |
| H | Phone | Phone number |
| I | Transport Volunteer | Volunteer name |
| J | Volunteer's Number | Volunteer phone |
| K | Comments | Additional notes |
| L | Zone Coordinator | Coordinator name |
| M | Zone Coordinator's Phone Number | Coordinator phone |
| N | Status | "Scheduled" or "Canceled" |

### Approved Users Sheet:
- **Column A**: Email addresses (one per row)
- Only users with emails in this sheet can access the dashboard

### Telegram Users Sheet:
- Auto-created by bot
- **Column A**: Chat ID
- **Column B**: Name  
- **Column C**: Registration Date

## 🔐 Security Configuration

### Service Account Permissions:
The deployment creates a service account with:
- `roles/sheets.editor` - Read/write Google Sheets
- `roles/calendar.editor` - Manage calendar events

### Secret Manager Storage:
All sensitive data is stored securely:
- Google OAuth credentials
- Service account key
- Telegram bot token
- JWT signing secret
- Sheet and Calendar IDs

### Cloud Run Security:
- Main app: Public (for OAuth callbacks)
- Bot: Private (triggered by Cloud Scheduler only)

## 📱 Post-Deployment Configuration

### 1. OAuth Setup:
```bash
# After deployment, add this to your OAuth client:
https://YOUR_CLOUD_RUN_URL/auth/callback
```

### 2. Share Google Sheets:
```
Service Account Email: sant-padharamani-sa@YOUR_PROJECT.iam.gserviceaccount.com
Permission: Editor
```

### 3. Share Google Calendar:
```
Service Account Email: sant-padharamani-sa@YOUR_PROJECT.iam.gserviceaccount.com
Permission: Make changes to events
```

## 🔍 Monitoring & Debugging

### Health Checks:
```bash
# Main application
curl https://YOUR_APP_URL/health

# Telegram bot  
curl https://YOUR_BOT_URL/health
```

### View Logs:
```bash
# All services
gcloud logging read "resource.type=cloud_run_revision" --limit=50

# Specific service
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=sant-padharamani" --limit=50
```

### Test Telegram Bot:
1. Search for your bot in Telegram
2. Send `/start` command
3. Use `/register` to register for reminders
4. Test with `/today` to see today's padharamanis

## 🔄 Continuous Deployment (Optional)

If enabled, pushes to the `main` branch will automatically trigger deployments:

1. **Connect GitHub repo** to Cloud Build
2. **Push changes** to main branch
3. **Automatic deployment** via `cloudbuild.yaml`

## 🆘 Troubleshooting

### Common Issues:

1. **"Permission denied" errors**:
   ```bash
   # Re-authenticate
   gcloud auth login
   gcloud auth application-default login
   ```

2. **"API not enabled" errors**:
   ```bash
   # Manually enable APIs
   gcloud services enable run.googleapis.com
   ```

3. **OAuth callback errors**:
   - Verify redirect URI exactly matches deployed URL
   - Check OAuth client configuration

4. **Sheet access errors**:
   - Ensure service account has Editor access to all sheets
   - Check sheet IDs are correct

5. **Bot not responding**:
   - Verify bot token is correct
   - Check bot service logs

### Get Help:
```bash
# View service status
gcloud run services list

# Check secrets
gcloud secrets list

# View IAM policies
gcloud projects get-iam-policy YOUR_PROJECT_ID
```

## 🎉 Success Indicators

✅ **Main app responds**: `https://YOUR_URL/health` returns 200  
✅ **OAuth login works**: Can login with approved email  
✅ **Sheets integration**: Can view/add padharamanis  
✅ **Calendar sync**: Events appear in Google Calendar  
✅ **Bot responds**: Telegram bot responds to commands  
✅ **Daily reminders**: Scheduled job runs at 1 AM  

---

**Happy deploying! 🚀** The scripts handle 90% of the work - you just need to fill in your credentials and run them!