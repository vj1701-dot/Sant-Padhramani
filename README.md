# Sant Padhramani

A modern Node.js/Express application for managing Sant Padhramani services, deployed on Google Cloud Run.

## Features

- **JSON-based data storage** - Fast, reliable local data storage with automatic backups
- **JWT authentication** - Secure user authentication and authorization
- **Automatic backups** - Cloud-based backup system using Google Cloud Storage
- **Mobile-optimized UI** - Progressive Web App (PWA) with mobile-first design
- **Telegram integration** - Support for Telegram Mini Apps and bot functionality
- **Real-time management** - Schedule, track, and manage padharamani services

## Quick Start

### Default Admin Credentials
- **Email**: `admin@santpadharamani.com`
- **Password**: `admin123456`
- ⚠️ **Important**: Change the password after first login!

### Accessing the Application
1. Visit: `https://sant-padhramani-352144879829.us-central1.run.app/auth/login-page`
2. Login with admin credentials
3. Start managing padharamani services

## Deployment

Deployment is automated via GitHub Actions to Google Cloud Run:
1. Push to `main` branch
2. Automatic build and deployment
3. Zero-downtime updates

## Environment Variables

### Required
- `NODE_ENV`: Set to `production` for production deployment
- `JWT_SECRET`: Auto-generated secure secret for JWT signing

### Optional
- `BACKUP_BUCKET_NAME`: Google Cloud Storage bucket name (defaults to `sant-padharamani-backups`)
- `PORT`: Server port (defaults to `8080`)

### Automatic Configuration
- Google Cloud credentials are automatically configured in Cloud Run
- No manual .env file setup required
- Backup system works out-of-the-box

## Data Storage

The application uses a hybrid storage approach:
- **Primary**: Local JSON files for fast access
- **Backup**: Automatic cloud backups to Google Cloud Storage
- **Resilient**: Handles ephemeral storage in Cloud Run environments

## Architecture

```
Client (React SPA) → Express Server → JSON Storage → Cloud Backup
                  ↓
               JWT Auth ← User Management
```
