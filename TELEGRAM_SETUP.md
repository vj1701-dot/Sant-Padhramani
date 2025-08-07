# Sant Padharamani - Telegram Mini App Setup

## 🎯 Overview
This guide will help you deploy Sant Padharamani as a Telegram Mini App with Google Sheets integration.

## 📋 Prerequisites
- Telegram account
- Google account with Google Sheets access
- Hosting platform (Google Cloud Run, Railway, Heroku, etc.)
- Node.js 18+ for local development

## 🤖 Step 1: Create Telegram Bot

1. **Create Bot with BotFather:**
   ```
   Open Telegram → Search for @BotFather → Start conversation
   Send: /newbot
   Choose bot name: Sant Padharamani Bot
   Choose username: sant_padharamani_bot (must end in 'bot')
   ```

2. **Save Bot Token:**
   - Copy the bot token (format: `123456789:ABC-DEF1234ghIkl-zyx57W2v1u123ew11`)
   - This is your `TELEGRAM_BOT_TOKEN`

3. **Configure Mini App:**
   ```
   Send to @BotFather: /mybots
   Select your bot → Bot Settings → Menu Button
   Send: Configure Menu Button
   Text: "Open Dashboard"
   URL: https://your-domain.com (your deployed app URL)
   ```

## 📊 Step 2: Setup Google Sheets

1. **Create New Spreadsheet:**
   - Go to [Google Sheets](https://sheets.google.com)
   - Create new spreadsheet: "Sant Padharamani Dashboard"
   - Copy the Spreadsheet ID from URL: `https://docs.google.com/spreadsheets/d/{SPREADSHEET_ID}/edit`

2. **Create Service Account:**
   ```bash
   # Go to Google Cloud Console
   1. Create new project or select existing
   2. Enable Google Sheets API
   3. Create Service Account
   4. Download JSON key file
   5. Share spreadsheet with service account email
   ```

3. **Sheet Structure (Auto-created by app):**
   - **Padharamani_Requests** sheet: For incomplete requests
   - **Assigned_Padharamani** sheet: For scheduled padharamani with dates

## 🚀 Step 3: Deploy Application

### Option A: Google Cloud Run (Recommended)
```bash
# Install Google Cloud CLI
npm install

# Build and deploy
gcloud run deploy sant-padharamani \\
  --source . \\
  --platform managed \\
  --region us-central1 \\
  --allow-unauthenticated \\
  --set-env-vars NODE_ENV=production,JWT_SECRET=your-secret-here,GOOGLE_SPREADSHEET_ID=your-sheet-id,TELEGRAM_BOT_TOKEN=your-bot-token
```

### Option B: Railway
```bash
# Install Railway CLI
npm install -g @railway/cli

# Login and deploy
railway login
railway new
railway up
```

### Option C: Heroku
```bash
# Install Heroku CLI
heroku create sant-padharamani
heroku config:set NODE_ENV=production
heroku config:set JWT_SECRET=your-secret-here
heroku config:set GOOGLE_SPREADSHEET_ID=your-sheet-id
heroku config:set TELEGRAM_BOT_TOKEN=your-bot-token
git push heroku main
```

## ⚙️ Step 4: Environment Variables

Set these environment variables on your hosting platform:

```env
NODE_ENV=production
PORT=8080
JWT_SECRET=your-super-secret-jwt-key-here
GOOGLE_SPREADSHEET_ID=1abc123def456-your-spreadsheet-id
TELEGRAM_BOT_TOKEN=123456789:ABC-DEF1234ghIkl-zyx57W2v1u123ew11
GOOGLE_CLOUD_PROJECT_ID=your-project-id
```

## 🔐 Step 5: Upload Service Account Key

1. **For Google Cloud Run:**
   ```bash
   # Upload as secret
   gcloud secrets create google-service-account --data-file=path/to/service-account-key.json
   ```

2. **For Other Platforms:**
   - Create `server/credentials/` folder
   - Upload `service-account-key.json`
   - Or set as environment variable (base64 encoded)

## 🔗 Step 6: Configure Telegram Mini App

1. **Update Bot Menu Button URL:**
   ```
   @BotFather → /mybots → Your Bot → Bot Settings → Menu Button
   URL: https://your-deployed-domain.com
   ```

2. **Test the Mini App:**
   - Open your bot in Telegram
   - Click "Open Dashboard" button
   - Should open your deployed app

## ✅ Step 7: Verify Setup

### Test Checklist:
- [ ] Telegram Mini App opens in Telegram
- [ ] User authentication works automatically
- [ ] Can submit padharamani requests via public form
- [ ] Requests appear in "Padharamani_Requests" sheet
- [ ] Can edit requests and move to "Assigned_Padharamani" sheet
- [ ] Bottom navigation works on mobile
- [ ] All CRUD operations work with Google Sheets

### Public Request Form:
- Share: `https://your-domain.com/auth/schedule-public`
- Test form submission and verify data in sheets

## 🎨 Features Available

### For Telegram Users:
- ✅ Automatic authentication via Telegram
- ✅ Mobile-optimized interface
- ✅ Bottom navigation bar
- ✅ PWA capabilities (installable)

### For Admins:
- ✅ Manage padharamani requests
- ✅ Schedule dates and assign volunteers
- ✅ View upcoming and archived padharamani
- ✅ Google Sheets integration
- ✅ Public request form sharing

### Data Management:
- ✅ Two Google Sheets tabs
- ✅ Automatic data flow between sheets
- ✅ Phone number validation
- ✅ Google Maps integration for addresses
- ✅ Telegram community integration

## 🛠️ Troubleshooting

### Common Issues:

1. **Telegram Mini App not opening:**
   - Check bot menu button URL
   - Verify HTTPS deployment
   - Check CSP headers allow telegram.org

2. **Google Sheets not connecting:**
   - Verify service account JSON file
   - Check spreadsheet sharing permissions
   - Enable Google Sheets API

3. **Authentication errors:**
   - Check JWT_SECRET is set
   - Verify Telegram WebApp SDK loading

4. **Local Development:**
   ```bash
   npm install
   cp env-example.txt .env
   # Edit .env with your values
   npm start
   # Access at http://localhost:8080
   ```

## 📞 Support

For deployment assistance:
1. Check deployment logs
2. Verify environment variables
3. Test individual components
4. Check Google Sheets permissions

## 🔄 Updates

To update the deployed app:
1. Make changes to code
2. Commit and push to repository
3. Redeploy using your platform's method
4. Test Telegram Mini App functionality

---

**Ready to go live!** 🎉 Your Telegram Mini App is now ready for users to submit and manage padharamani requests seamlessly.