#!/bin/bash

# Sant Padharamani - Quick Deployment Script
# Usage: ./quick-deploy.sh
# Make sure to fill in deploy-config.env first!

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
if [ ! -f "deploy-config.env" ]; then
    print_error "Configuration file 'deploy-config.env' not found!"
    print_error "Please copy deploy-config.env.example to deploy-config.env and fill in your values."
    exit 1
fi

# Source the configuration
set -a  # Export all variables
source deploy-config.env
set +a

echo "========================================"
echo "🚀 Sant Padharamani Quick Deploy"
echo "========================================"
echo ""
print_status "Project: $PROJECT_ID"
print_status "Region: $REGION"
echo ""

# Validate required variables
required_vars=("PROJECT_ID" "GOOGLE_CLIENT_ID" "GOOGLE_CLIENT_SECRET" "GOOGLE_SHEET_ID" "APPROVED_USERS_SHEET_ID" "TELEGRAM_USERS_SHEET_ID" "GOOGLE_CALENDAR_ID" "TELEGRAM_BOT_TOKEN")

for var in "${required_vars[@]}"; do
    if [ -z "${!var}" ] || [ "${!var}" = "your-"* ]; then
        print_error "Required variable $var is not set in deploy-config.env"
        exit 1
    fi
done

# Set project
gcloud config set project "$PROJECT_ID"

# Enable APIs
print_status "Enabling required APIs..."
gcloud services enable run.googleapis.com cloudbuild.googleapis.com secretmanager.googleapis.com cloudscheduler.googleapis.com sheets.googleapis.com calendar.googleapis.com containerregistry.googleapis.com

# Create secrets
print_status "Creating secrets in Secret Manager..."

create_or_update_secret() {
    local secret_name="$1"
    local secret_value="$2"
    
    echo "$secret_value" | gcloud secrets create "$secret_name" --data-file=- 2>/dev/null || \
        echo "$secret_value" | gcloud secrets versions add "$secret_name" --data-file=-
}

create_or_update_secret "google-client-id" "$GOOGLE_CLIENT_ID"
create_or_update_secret "google-client-secret" "$GOOGLE_CLIENT_SECRET"
create_or_update_secret "google-sheet-id" "$GOOGLE_SHEET_ID"
create_or_update_secret "approved-users-sheet-id" "$APPROVED_USERS_SHEET_ID"
create_or_update_secret "telegram-users-sheet-id" "$TELEGRAM_USERS_SHEET_ID"
create_or_update_secret "google-calendar-id" "$GOOGLE_CALENDAR_ID"
create_or_update_secret "telegram-bot-token" "$TELEGRAM_BOT_TOKEN"

# Generate JWT secret
print_status "Generating JWT secret..."
openssl rand -base64 64 | gcloud secrets create jwt-secret --data-file=- 2>/dev/null || \
    openssl rand -base64 64 | gcloud secrets versions add jwt-secret --data-file=-

# Handle service account
if [ -n "$SERVICE_ACCOUNT_FILE" ] && [ -f "$SERVICE_ACCOUNT_FILE" ]; then
    print_status "Using existing service account file..."
    gcloud secrets create google-service-account-credentials --data-file="$SERVICE_ACCOUNT_FILE" 2>/dev/null || \
        gcloud secrets versions add google-service-account-credentials --data-file="$SERVICE_ACCOUNT_FILE"
else
    print_status "Creating new service account..."
    SA_NAME="sant-padharamani-sa"
    SA_EMAIL="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
    
    # Create service account
    gcloud iam service-accounts create "$SA_NAME" --display-name="Sant Padharamani Service Account" 2>/dev/null || true
    
    # Grant permissions
    gcloud projects add-iam-policy-binding "$PROJECT_ID" --member="serviceAccount:$SA_EMAIL" --role="roles/sheets.editor"
    gcloud projects add-iam-policy-binding "$PROJECT_ID" --member="serviceAccount:$SA_EMAIL" --role="roles/calendar.editor"
    
    # Create and store key
    KEY_FILE="/tmp/sa-key-$$.json"
    gcloud iam service-accounts keys create "$KEY_FILE" --iam-account="$SA_EMAIL"
    gcloud secrets create google-service-account-credentials --data-file="$KEY_FILE" 2>/dev/null || \
        gcloud secrets versions add google-service-account-credentials --data-file="$KEY_FILE"
    rm -f "$KEY_FILE"
fi

# Setup IAM for Cloud Run
print_status "Setting up IAM permissions..."
PROJECT_NUMBER=$(gcloud projects describe "$PROJECT_ID" --format="value(projectNumber)")
SERVICE_ACCOUNT="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"
gcloud projects add-iam-policy-binding "$PROJECT_ID" --member="serviceAccount:$SERVICE_ACCOUNT" --role="roles/secretmanager.secretAccessor"

# Build and deploy main application
print_status "Building and deploying main application..."
gcloud builds submit --tag "gcr.io/$PROJECT_ID/sant-padharamani"

gcloud run deploy sant-padharamani \
    --image="gcr.io/$PROJECT_ID/sant-padharamani" \
    --platform=managed \
    --region="$REGION" \
    --allow-unauthenticated \
    --port=8080 \
    --memory=1Gi \
    --cpu=1 \
    --max-instances=10 \
    --set-env-vars="GOOGLE_CLOUD_PROJECT_ID=$PROJECT_ID,NODE_ENV=production"

MAIN_URL=$(gcloud run services describe sant-padharamani --region="$REGION" --format="value(status.url)")

# Build and deploy bot
print_status "Building and deploying Telegram bot..."
gcloud builds submit --tag "gcr.io/$PROJECT_ID/sant-padharamani-bot" ./bot

gcloud run deploy sant-padharamani-bot \
    --image="gcr.io/$PROJECT_ID/sant-padharamani-bot" \
    --platform=managed \
    --region="$REGION" \
    --no-allow-unauthenticated \
    --port=8080 \
    --memory=512Mi \
    --cpu=1 \
    --max-instances=5 \
    --set-env-vars="GOOGLE_CLOUD_PROJECT_ID=$PROJECT_ID"

BOT_URL=$(gcloud run services describe sant-padharamani-bot --region="$REGION" --format="value(status.url)")

# Setup Cloud Scheduler
print_status "Setting up Cloud Scheduler..."
gcloud scheduler jobs create http daily-padharamani-reminders \
    --schedule="0 1 * * *" \
    --uri="$BOT_URL/send-reminders" \
    --http-method=POST \
    --time-zone="America/New_York" \
    --description="Daily padharamani reminders at 1 AM" 2>/dev/null || \
gcloud scheduler jobs update http daily-padharamani-reminders \
    --schedule="0 1 * * *" \
    --uri="$BOT_URL/send-reminders" \
    --http-method=POST \
    --time-zone="America/New_York"

# Setup CI/CD if requested
if [ "$SETUP_CONTINUOUS_DEPLOYMENT" = "true" ]; then
    print_status "Setting up continuous deployment..."
    gcloud builds triggers create github \
        --repo-name="$GITHUB_REPO_NAME" \
        --repo-owner="$GITHUB_REPO_OWNER" \
        --branch-pattern="^main$" \
        --build-config="cloudbuild.yaml" 2>/dev/null || true
fi

# Final output
echo ""
echo "========================================"
print_success "🎉 DEPLOYMENT COMPLETED SUCCESSFULLY!"
echo "========================================"
echo ""
print_success "Dashboard URL: $MAIN_URL"
echo ""
echo "📋 NEXT STEPS:"
echo "=============="
echo ""
echo "1. 🔐 Add OAuth Redirect URI:"
echo "   - Go to: https://console.cloud.google.com/apis/credentials"
echo "   - Edit your OAuth Client"
echo "   - Add: $MAIN_URL/auth/callback"
echo ""
echo "2. 📊 Setup Google Sheets (share with service account):"
echo "   - Main sheet: $GOOGLE_SHEET_ID"
echo "   - Approved users: $APPROVED_USERS_SHEET_ID"
echo "   - Telegram users: $TELEGRAM_USERS_SHEET_ID"
echo ""
echo "3. 📅 Share Google Calendar ($GOOGLE_CALENDAR_ID) with service account"
echo ""
echo "4. 🤖 Test your bot in Telegram"
echo ""
echo "5. 🔍 Monitor:"
echo "   - Health: $MAIN_URL/health"
echo "   - Logs: gcloud logging read 'resource.type=cloud_run_revision' --limit=50"
echo ""
print_success "Happy managing padharamanis! 🙏"