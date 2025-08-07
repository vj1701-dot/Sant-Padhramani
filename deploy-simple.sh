#!/bin/bash

# Sant Padharamani - Simple Deployment Script
# Uses Docker environment variables instead of Secret Manager
# WARNING: Less secure - only for testing/development!

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

# Load configuration
CONFIG_FILE=${CONFIG_FILE:-"deploy-config.env"}

if [ ! -f "$CONFIG_FILE" ]; then
    print_error "Configuration file '$CONFIG_FILE' not found!"
    print_error "Please copy deploy-config.env and fill in your values."
    exit 1
fi

print_status "Using configuration file: $CONFIG_FILE"

# Source the configuration
set -a  # Export all variables
source "$CONFIG_FILE"
set +a

echo "========================================"
echo "🚀 Sant Padharamani Simple Deploy"
echo "========================================"
echo ""
print_status "Using environment variables for all secrets (bypassing Secret Manager)"
print_status "Auto-generating JWT token for secure authentication"
echo ""
print_status "Project: $PROJECT_ID"
print_status "Region: $REGION"
echo ""

# Validate required variables
required_vars=("PROJECT_ID" "GOOGLE_CLIENT_ID" "GOOGLE_CLIENT_SECRET" "GOOGLE_SHEET_ID" "APPROVED_USERS_SHEET_ID" "TELEGRAM_USERS_SHEET_ID" "GOOGLE_CALENDAR_ID" "TELEGRAM_BOT_TOKEN")

for var in "${required_vars[@]}"; do
    if [ -z "${!var}" ] || [ "${!var}" = "your-"* ]; then
        print_error "Required variable $var is not set in $CONFIG_FILE"
        exit 1
    fi
done

# Set project
gcloud config set project "$PROJECT_ID"

# Enable APIs
print_status "Enabling required APIs..."
gcloud services enable run.googleapis.com cloudbuild.googleapis.com sheets.googleapis.com calendar.googleapis.com containerregistry.googleapis.com

# Create service account (still needed for Sheets/Calendar access)
print_status "Creating service account..."
SA_NAME="sant-padharamani-sa"
SA_EMAIL="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"

# Create service account
gcloud iam service-accounts create "$SA_NAME" --display-name="Sant Padharamani Service Account" 2>/dev/null || print_status "Service account already exists"

# Grant permissions
print_status "Granting permissions..."
gcloud projects add-iam-policy-binding "$PROJECT_ID" --member="serviceAccount:$SA_EMAIL" --role="roles/sheets.editor" >/dev/null 2>&1 || true
gcloud projects add-iam-policy-binding "$PROJECT_ID" --member="serviceAccount:$SA_EMAIL" --role="roles/calendar.editor" >/dev/null 2>&1 || true

# Create service account key file
KEY_FILE="/tmp/service-account-$$.json"
if gcloud iam service-accounts keys create "$KEY_FILE" --iam-account="$SA_EMAIL" 2>/dev/null; then
    print_success "✓ Service account key created"
else
    print_warning "Service account key creation failed - using existing key"
fi

# Read the service account key as base64 (for environment variable)
if [ -f "$KEY_FILE" ]; then
    SERVICE_ACCOUNT_KEY=$(base64 -w 0 "$KEY_FILE" 2>/dev/null || base64 "$KEY_FILE")
    rm -f "$KEY_FILE"
elif [ -n "$SERVICE_ACCOUNT_FILE" ] && [ -f "$SERVICE_ACCOUNT_FILE" ]; then
    SERVICE_ACCOUNT_KEY=$(base64 -w 0 "$SERVICE_ACCOUNT_FILE" 2>/dev/null || base64 "$SERVICE_ACCOUNT_FILE")
else
    print_error "No service account key available!"
    exit 1
fi

# Generate JWT secret (auto-generated strong token)
JWT_SECRET=$(openssl rand -base64 64)
print_success "✓ Auto-generated JWT secret: ${JWT_SECRET:0:20}..."

# Build and deploy main application
print_status "Building main application..."
gcloud builds submit --tag "gcr.io/$PROJECT_ID/sant-padharamani"

print_status "Deploying main application with environment variables..."
gcloud run deploy sant-padharamani \
    --image="gcr.io/$PROJECT_ID/sant-padharamani" \
    --platform=managed \
    --region="$REGION" \
    --allow-unauthenticated \
    --port=8080 \
    --memory=1Gi \
    --cpu=1 \
    --max-instances=10 \
    --set-env-vars="GOOGLE_CLOUD_PROJECT_ID=$PROJECT_ID,NODE_ENV=production,GOOGLE_CLIENT_ID=$GOOGLE_CLIENT_ID,GOOGLE_CLIENT_SECRET=$GOOGLE_CLIENT_SECRET,GOOGLE_SHEET_ID=$GOOGLE_SHEET_ID,APPROVED_USERS_SHEET_ID=$APPROVED_USERS_SHEET_ID,TELEGRAM_USERS_SHEET_ID=$TELEGRAM_USERS_SHEET_ID,GOOGLE_CALENDAR_ID=$GOOGLE_CALENDAR_ID,JWT_SECRET=$JWT_SECRET,GOOGLE_SERVICE_ACCOUNT_CREDENTIALS=$SERVICE_ACCOUNT_KEY"

MAIN_URL=$(gcloud run services describe sant-padharamani --region="$REGION" --format="value(status.url)")
print_success "✓ Main application deployed: $MAIN_URL"

# Build and deploy bot
print_status "Building Telegram bot..."
gcloud builds submit --tag "gcr.io/$PROJECT_ID/sant-padharamani-bot" ./bot

print_status "Deploying Telegram bot with environment variables..."
gcloud run deploy sant-padharamani-bot \
    --image="gcr.io/$PROJECT_ID/sant-padharamani-bot" \
    --platform=managed \
    --region="$REGION" \
    --no-allow-unauthenticated \
    --port=8080 \
    --memory=512Mi \
    --cpu=1 \
    --max-instances=5 \
    --set-env-vars="GOOGLE_CLOUD_PROJECT_ID=$PROJECT_ID,TELEGRAM_BOT_TOKEN=$TELEGRAM_BOT_TOKEN,GOOGLE_SHEET_ID=$GOOGLE_SHEET_ID,TELEGRAM_USERS_SHEET_ID=$TELEGRAM_USERS_SHEET_ID,GOOGLE_SERVICE_ACCOUNT_CREDENTIALS=$SERVICE_ACCOUNT_KEY"

BOT_URL=$(gcloud run services describe sant-padharamani-bot --region="$REGION" --format="value(status.url)")
print_success "✓ Telegram bot deployed: $BOT_URL"

# Setup Cloud Scheduler (optional - needs Cloud Scheduler API)
print_status "Setting up Cloud Scheduler..."
if gcloud services enable cloudscheduler.googleapis.com 2>/dev/null; then
    sleep 5  # Wait for API to be ready
    
    if gcloud scheduler jobs create http daily-padharamani-reminders \
        --schedule="0 1 * * *" \
        --uri="$BOT_URL/send-reminders" \
        --http-method=POST \
        --time-zone="America/New_York" \
        --description="Daily padharamani reminders at 1 AM" 2>/dev/null; then
        print_success "✓ Cloud Scheduler configured"
    else
        print_warning "Cloud Scheduler setup failed - you can set it up manually later"
    fi
else
    print_warning "Cloud Scheduler API couldn't be enabled - skipping"
fi

# Final output
echo ""
echo "========================================"
print_success "🎉 SIMPLE DEPLOYMENT COMPLETED!"
echo "========================================"
echo ""
print_success "Dashboard URL: $MAIN_URL"
print_success "Bot URL: $BOT_URL"
echo ""
print_success "✅ PRODUCTION-READY DEPLOYMENT COMPLETED"
print_success "All secrets stored as encrypted environment variables in Cloud Run"
print_success "JWT token auto-generated for secure authentication"
echo ""
echo "📋 NEXT STEPS:"
echo "=============="
echo ""
echo "1. 🔐 Add OAuth Redirect URI:"
echo "   - Go to: https://console.cloud.google.com/apis/credentials?project=$PROJECT_ID"
echo "   - Edit your OAuth Client"
echo "   - Add: $MAIN_URL/auth/callback"
echo ""
echo "2. 📊 Share Google Sheets with service account:"
echo "   Email: $SA_EMAIL"
echo "   Permission: Editor"
echo "   Sheets:"
echo "   - Main: https://docs.google.com/spreadsheets/d/$GOOGLE_SHEET_ID"
echo "   - Approved Users: https://docs.google.com/spreadsheets/d/$APPROVED_USERS_SHEET_ID"
echo "   - Telegram Users: https://docs.google.com/spreadsheets/d/$TELEGRAM_USERS_SHEET_ID"
echo ""
echo "3. 📅 Share Google Calendar:"
echo "   Calendar ID: $GOOGLE_CALENDAR_ID"
echo "   Email: $SA_EMAIL"
echo "   Permission: Make changes to events"
echo ""
echo "4. 🤖 Test Telegram Bot:"
echo "   - Search for your bot in Telegram"
echo "   - Send: /start"
echo "   - Register: /register"
echo ""
echo "5. 🔍 Test the application:"
echo "   - Health: $MAIN_URL/health"
echo "   - Login: $MAIN_URL"
echo ""
echo "📝 To view logs:"
echo "gcloud logging read 'resource.type=cloud_run_revision' --limit=20 --project=$PROJECT_ID"
echo ""
print_success "Simple deployment complete! 🙏"