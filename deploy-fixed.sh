#!/bin/bash

# Sant Padharamani - Fixed Deployment Script
# This version handles permission errors and provides better guidance

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

# Check if user has required permissions
check_permissions() {
    print_status "Checking project permissions..."
    
    local project_id="$1"
    local user_email=$(gcloud auth list --filter=status:ACTIVE --format="value(account)")
    
    print_status "Authenticated as: $user_email"
    print_status "Project: $project_id"
    
    # Check if user has required roles
    local has_owner=false
    local has_editor=false
    
    # Get user's roles in the project
    if gcloud projects get-iam-policy "$project_id" --flatten="bindings[].members" --format="table(bindings.role)" --filter="bindings.members:$user_email" | grep -q "roles/owner"; then
        has_owner=true
    fi
    
    if gcloud projects get-iam-policy "$project_id" --flatten="bindings[].members" --format="table(bindings.role)" --filter="bindings.members:$user_email" | grep -q "roles/editor"; then
        has_editor=true
    fi
    
    if [ "$has_owner" = false ] && [ "$has_editor" = false ]; then
        print_error "Insufficient permissions detected!"
        print_error "You need either 'Owner' or 'Editor' role on project: $project_id"
        echo ""
        echo "Ask your GCP administrator to grant you one of these roles:"
        echo "• roles/owner (recommended for deployment)"
        echo "• roles/editor"
        echo ""
        echo "Or run this command if you have admin access:"
        echo "gcloud projects add-iam-policy-binding $project_id --member=\"user:$user_email\" --role=\"roles/editor\""
        exit 1
    fi
    
    print_success "Permission check passed!"
}

# Enable APIs with error handling
enable_apis_safely() {
    local project_id="$1"
    print_status "Enabling required APIs..."
    
    local apis=(
        "run.googleapis.com"
        "cloudbuild.googleapis.com" 
        "secretmanager.googleapis.com"
        "cloudscheduler.googleapis.com"
        "sheets.googleapis.com"
        "calendar.googleapis.com"
        "containerregistry.googleapis.com"
        "iam.googleapis.com"
    )
    
    local failed_apis=()
    
    for api in "${apis[@]}"; do
        print_status "Enabling $api..."
        if ! gcloud services enable "$api" --project="$project_id" 2>/dev/null; then
            print_warning "Failed to enable $api - you may need to enable it manually"
            failed_apis+=("$api")
        else
            print_success "✓ $api enabled"
        fi
    done
    
    if [ ${#failed_apis[@]} -gt 0 ]; then
        print_warning "Some APIs failed to enable automatically. Please enable them manually:"
        for api in "${failed_apis[@]}"; do
            echo "  gcloud services enable $api --project=$project_id"
        done
        echo ""
        read -p "Press Enter after enabling the APIs manually, or Ctrl+C to exit..."
    fi
}

# Load configuration
if [ ! -f "deploy-config.env" ]; then
    print_error "Configuration file 'deploy-config.env' not found!"
    print_error "Please copy deploy-config.env to a local config file and fill in your values."
    echo ""
    echo "Example:"
    echo "  cp deploy-config.env my-config.env"
    echo "  # Edit my-config.env with your values"
    echo "  CONFIG_FILE=my-config.env ./deploy-fixed.sh"
    exit 1
fi

# Allow override of config file
CONFIG_FILE=${CONFIG_FILE:-"deploy-config.env"}

if [ ! -f "$CONFIG_FILE" ]; then
    print_error "Configuration file '$CONFIG_FILE' not found!"
    exit 1
fi

print_status "Using configuration file: $CONFIG_FILE"

# Source the configuration
set -a  # Export all variables
source "$CONFIG_FILE"
set +a

echo "========================================"
echo "🚀 Sant Padharamani Fixed Deploy"
echo "========================================"
echo ""
print_status "Project: $PROJECT_ID"
print_status "Region: $REGION"
echo ""

# Validate required variables
required_vars=("PROJECT_ID" "GOOGLE_CLIENT_ID" "GOOGLE_CLIENT_SECRET" "GOOGLE_SHEET_ID" "APPROVED_USERS_SHEET_ID" "TELEGRAM_USERS_SHEET_ID" "GOOGLE_CALENDAR_ID" "TELEGRAM_BOT_TOKEN")

for var in "${required_vars[@]}"; do
    if [ -z "${!var}" ] || [ "${!var}" = "your-"* ]; then
        print_error "Required variable $var is not set in $CONFIG_FILE"
        print_error "Please edit $CONFIG_FILE and set all required values"
        exit 1
    fi
done

# Check permissions first
check_permissions "$PROJECT_ID"

# Set project
gcloud config set project "$PROJECT_ID"

# Enable APIs safely
enable_apis_safely "$PROJECT_ID"

# Wait a moment for APIs to be ready
print_status "Waiting for APIs to be ready..."
sleep 10

# Create secrets with better error handling
print_status "Creating secrets in Secret Manager..."

create_or_update_secret() {
    local secret_name="$1"
    local secret_value="$2"
    
    if echo "$secret_value" | gcloud secrets create "$secret_name" --data-file=- --project="$PROJECT_ID" 2>/dev/null; then
        print_success "✓ Created secret: $secret_name"
    else
        if echo "$secret_value" | gcloud secrets versions add "$secret_name" --data-file=- --project="$PROJECT_ID" 2>/dev/null; then
            print_success "✓ Updated secret: $secret_name"
        else
            print_error "Failed to create/update secret: $secret_name"
            return 1
        fi
    fi
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
if openssl rand -base64 64 | gcloud secrets create jwt-secret --data-file=- --project="$PROJECT_ID" 2>/dev/null; then
    print_success "✓ Created JWT secret"
else
    if openssl rand -base64 64 | gcloud secrets versions add jwt-secret --data-file=- --project="$PROJECT_ID" 2>/dev/null; then
        print_success "✓ Updated JWT secret"
    else
        print_error "Failed to create/update JWT secret"
    fi
fi

# Handle service account
if [ -n "$SERVICE_ACCOUNT_FILE" ] && [ -f "$SERVICE_ACCOUNT_FILE" ]; then
    print_status "Using existing service account file..."
    create_or_update_secret "google-service-account-credentials" "$(cat "$SERVICE_ACCOUNT_FILE")"
else
    print_status "Creating new service account..."
    SA_NAME="sant-padharamani-sa"
    SA_EMAIL="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
    
    # Create service account
    if gcloud iam service-accounts create "$SA_NAME" \
        --display-name="Sant Padharamani Service Account" \
        --project="$PROJECT_ID" 2>/dev/null; then
        print_success "✓ Created service account: $SA_EMAIL"
    else
        print_status "Service account already exists: $SA_EMAIL"
    fi
    
    # Grant permissions
    print_status "Granting permissions to service account..."
    gcloud projects add-iam-policy-binding "$PROJECT_ID" \
        --member="serviceAccount:$SA_EMAIL" \
        --role="roles/sheets.editor" >/dev/null 2>&1 || true
    
    gcloud projects add-iam-policy-binding "$PROJECT_ID" \
        --member="serviceAccount:$SA_EMAIL" \
        --role="roles/calendar.editor" >/dev/null 2>&1 || true
    
    # Create and store key
    KEY_FILE="/tmp/sa-key-$$.json"
    if gcloud iam service-accounts keys create "$KEY_FILE" \
        --iam-account="$SA_EMAIL" \
        --project="$PROJECT_ID"; then
        
        create_or_update_secret "google-service-account-credentials" "$(cat "$KEY_FILE")"
        rm -f "$KEY_FILE"
        print_success "✓ Service account credentials stored"
    else
        print_error "Failed to create service account key"
    fi
fi

# Setup IAM for Cloud Run
print_status "Setting up IAM permissions..."
PROJECT_NUMBER=$(gcloud projects describe "$PROJECT_ID" --format="value(projectNumber)")
SERVICE_ACCOUNT="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"

if gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:$SERVICE_ACCOUNT" \
    --role="roles/secretmanager.secretAccessor" >/dev/null 2>&1; then
    print_success "✓ IAM permissions configured"
else
    print_warning "Failed to set IAM permissions - may need manual configuration"
fi

# Build and deploy main application
print_status "Building and deploying main application..."
if gcloud builds submit --tag "gcr.io/$PROJECT_ID/sant-padharamani" --project="$PROJECT_ID"; then
    print_success "✓ Main application built"
else
    print_error "Failed to build main application"
    exit 1
fi

if gcloud run deploy sant-padharamani \
    --image="gcr.io/$PROJECT_ID/sant-padharamani" \
    --platform=managed \
    --region="$REGION" \
    --allow-unauthenticated \
    --port=8080 \
    --memory=1Gi \
    --cpu=1 \
    --max-instances=10 \
    --set-env-vars="GOOGLE_CLOUD_PROJECT_ID=$PROJECT_ID,NODE_ENV=production" \
    --project="$PROJECT_ID" >/dev/null; then
    
    MAIN_URL=$(gcloud run services describe sant-padharamani --region="$REGION" --format="value(status.url)" --project="$PROJECT_ID")
    print_success "✓ Main application deployed: $MAIN_URL"
else
    print_error "Failed to deploy main application"
    exit 1
fi

# Build and deploy bot
print_status "Building and deploying Telegram bot..."
if gcloud builds submit --tag "gcr.io/$PROJECT_ID/sant-padharamani-bot" ./bot --project="$PROJECT_ID"; then
    print_success "✓ Telegram bot built"
else
    print_error "Failed to build Telegram bot"
    exit 1
fi

if gcloud run deploy sant-padharamani-bot \
    --image="gcr.io/$PROJECT_ID/sant-padharamani-bot" \
    --platform=managed \
    --region="$REGION" \
    --no-allow-unauthenticated \
    --port=8080 \
    --memory=512Mi \
    --cpu=1 \
    --max-instances=5 \
    --set-env-vars="GOOGLE_CLOUD_PROJECT_ID=$PROJECT_ID" \
    --project="$PROJECT_ID" >/dev/null; then
    
    BOT_URL=$(gcloud run services describe sant-padharamani-bot --region="$REGION" --format="value(status.url)" --project="$PROJECT_ID")
    print_success "✓ Telegram bot deployed: $BOT_URL"
else
    print_error "Failed to deploy Telegram bot"
    exit 1
fi

# Setup Cloud Scheduler
print_status "Setting up Cloud Scheduler..."
if gcloud scheduler jobs create http daily-padharamani-reminders \
    --schedule="0 1 * * *" \
    --uri="$BOT_URL/send-reminders" \
    --http-method=POST \
    --time-zone="America/New_York" \
    --description="Daily padharamani reminders at 1 AM" \
    --project="$PROJECT_ID" 2>/dev/null; then
    print_success "✓ Cloud Scheduler job created"
elif gcloud scheduler jobs update http daily-padharamani-reminders \
    --schedule="0 1 * * *" \
    --uri="$BOT_URL/send-reminders" \
    --http-method=POST \
    --time-zone="America/New_York" \
    --project="$PROJECT_ID" 2>/dev/null; then
    print_success "✓ Cloud Scheduler job updated"
else
    print_warning "Failed to setup Cloud Scheduler - you may need to create it manually"
fi

# Setup CI/CD if requested
if [ "$SETUP_CONTINUOUS_DEPLOYMENT" = "true" ]; then
    print_status "Setting up continuous deployment..."
    if gcloud builds triggers create github \
        --repo-name="$GITHUB_REPO_NAME" \
        --repo-owner="$GITHUB_REPO_OWNER" \
        --branch-pattern="^main$" \
        --build-config="cloudbuild.yaml" \
        --project="$PROJECT_ID" 2>/dev/null; then
        print_success "✓ Continuous deployment configured"
    else
        print_warning "Failed to setup continuous deployment - may need manual configuration"
    fi
fi

# Final output
echo ""
echo "========================================"
print_success "🎉 DEPLOYMENT COMPLETED SUCCESSFULLY!"
echo "========================================"
echo ""
print_success "Dashboard URL: $MAIN_URL"
print_success "Bot URL: $BOT_URL"
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
echo "   Service Account Email: sant-padharamani-sa@$PROJECT_ID.iam.gserviceaccount.com"
echo "   Sheets to share:"
echo "   - Main sheet: $GOOGLE_SHEET_ID"
echo "   - Approved users: $APPROVED_USERS_SHEET_ID" 
echo "   - Telegram users: $TELEGRAM_USERS_SHEET_ID"
echo ""
echo "3. 📅 Share Google Calendar with service account:"
echo "   Calendar ID: $GOOGLE_CALENDAR_ID"
echo "   Email: sant-padharamani-sa@$PROJECT_ID.iam.gserviceaccount.com"
echo "   Permission: Make changes to events"
echo ""
echo "4. 🤖 Test your Telegram bot"
echo ""
echo "5. 🔍 Monitor your services:"
echo "   - Health check: $MAIN_URL/health"
echo "   - View logs: gcloud logging read 'resource.type=cloud_run_revision' --limit=50 --project=$PROJECT_ID"
echo ""
echo "🔗 Useful Links:"
echo "- GCP Console: https://console.cloud.google.com/home/dashboard?project=$PROJECT_ID"
echo "- Cloud Run: https://console.cloud.google.com/run?project=$PROJECT_ID"
echo "- Secret Manager: https://console.cloud.google.com/security/secret-manager?project=$PROJECT_ID"
echo "- Cloud Scheduler: https://console.cloud.google.com/cloudscheduler?project=$PROJECT_ID"
echo ""
print_success "Happy managing padharamanis! 🙏"