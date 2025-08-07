# Sant Padharamani - Telegram Mini App

A mobile-first Telegram Mini App for managing Sant Padharamani visits with Google Sheets integration.

## 🚀 Quick Deploy to Google Cloud Run

### 1. Clone and Setup
```bash
git clone <your-repo-url>
cd Sant-Padhramani
```

### 2. Google Cloud Run Deployment
```bash
gcloud run deploy sant-padharamani \
  --source . \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated
```

### 3. Environment Variables (Set in Cloud Run)
- `NODE_ENV`: `production`
- `JWT_SECRET`: Auto-generated if not provided
- `GOOGLE_SPREADSHEET_ID`: Your Google Sheets ID (optional)
- `TELEGRAM_BOT_TOKEN`: Your Telegram bot token

### 4. Google Sheets Setup (Optional)
1. Create Google Sheets service account
2. Download JSON key file
3. Upload to Cloud Run as secret or base64 encode
4. Share spreadsheet with service account email
5. Set `GOOGLE_SPREADSHEET_ID` environment variable

## 🤖 Telegram Bot Setup

1. Create bot with @BotFather
2. Get bot token and set as environment variable
3. Configure Mini App URL: `https://your-cloud-run-url.app`

## 👥 User Management

### Default Admin Account
- **Email**: `admin@santpadharamani.com`
- **Password**: `admin123456`
- ⚠️ Change password after first login!

### Adding New Users
1. Login as admin
2. Go to Settings → User Management
3. Create new users with email/password
4. Users need admin approval (except Telegram users)

### Telegram Users
- Automatically authenticated and approved
- No manual user creation needed

## 📊 Features

- ✅ Telegram Mini App integration
- ✅ Google Sheets sync (2 sheets: Requests + Assigned)
- ✅ Mobile-first design with bottom navigation
- ✅ Phone validation, Google Maps links
- ✅ User management system
- ✅ PWA capabilities

## 🔒 Authentication

- **Telegram Users**: Automatic authentication
- **Web Users**: Email/password with admin approval
- **JWT Tokens**: Auto-generated secure tokens

## 📝 API Endpoints

### Public
- `GET /auth/schedule-public` - Public request form
- `POST /api/padharamanis/schedule` - Submit public requests

### Authenticated
- `GET /api/padharamanis/upcoming` - Upcoming padharamani
- `GET /api/padharamanis/archived` - Archived padharamani
- `GET /api/padharamanis/scheduled` - Pending requests
- `POST /api/padharamanis` - Add complete padharamani
- `PUT /api/padharamanis/:id` - Update padharamani

### Admin Only
- `POST /auth/users` - Create user
- `DELETE /auth/users/:email` - Delete user
- `GET /auth/users` - List all users
- `POST /auth/approve/:email` - Approve user

## 🛠️ Local Development

```bash
npm install
npm start
# Access at http://localhost:8080
```

## 📱 Mobile App Features

- Bottom navigation optimized for mobile
- Touch-friendly 44px minimum tap targets
- PWA installable as native app
- Telegram theme integration
- Offline support with service worker

---

**Ready for production!** 🎉 Deploy to Cloud Run and configure your Telegram bot.