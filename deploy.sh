#!/bin/bash

# Sant Padharamani - GCP Deployment Script
# This script deploys the entire Sant Padharamani project to Google Cloud Platform
# Can be run from GCP Cloud Shell or local terminal with gcloud CLI installed

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Configuration variables (you can modify these)
PROJECT_ID=""
REGION="us-central1"
MAIN_SERVICE_NAME="sant-padharamani"
BOT_SERVICE_NAME="sant-padharamani-bot"
SERVICE_ACCOUNT_FILE=""

# Function to prompt for user input
prompt_input() {
    local prompt_text="$1"
    local var_name="$2"
    local default_value="$3"
    
    if [ -n "$default_value" ]; then
        read -p "$prompt_text [$default_value]: " input
        if [ -z "$input" ]; then
            eval "$var_name=\"$default_value\""
        else
            eval "$var_name=\"$input\""
        fi
    else
        while [ -z "${!var_name}" ]; do
            read -p "$prompt_text: " input
            eval "$var_name=\"$input\""
        done
    fi
}

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Function to check if gcloud is authenticated
check_gcloud_auth() {
    if ! gcloud auth list --filter=status:ACTIVE --format="value(account)" | grep -q "."; then
        print_error "You are not authenticated with gcloud. Please run 'gcloud auth login' first."
        exit 1
    fi
}

# Function to enable required APIs
enable_apis() {
    print_status "Enabling required Google Cloud APIs..."
    
    local apis=(
        "run.googleapis.com"
        "cloudbuild.googleapis.com"
        "secretmanager.googleapis.com"
        "cloudscheduler.googleapis.com"
        "sheets.googleapis.com"
        "calendar-json.googleapis.com"
        "oauth2.googleapis.com"
        "containerregistry.googleapis.com"
    )
    
    for api in "${apis[@]}"; do
        print_status "Enabling $api..."
        gcloud services enable "$api" --project="$PROJECT_ID"
    done
    
    print_success "All APIs enabled successfully!"
}

# Function to create secrets in Secret Manager
create_secrets() {
    print_status "Setting up secrets in Google Cloud Secret Manager..."
    
    # Collect all required secrets
    local google_client_id=""
    local google_client_secret=""
    local google_sheet_id=""
    local approved_users_sheet_id=""
    local telegram_users_sheet_id=""
    local google_calendar_id=""
    local telegram_bot_token=""
    
    echo ""
    echo "Please provide the following credentials and IDs:"
    echo "=============================================="
    
    prompt_input "Google OAuth Client ID" google_client_id
    prompt_input "Google OAuth Client Secret" google_client_secret
    prompt_input "Main Google Sheet ID (for padharamani data)" google_sheet_id
    prompt_input "Approved Users Sheet ID (for email whitelist)" approved_users_sheet_id
    prompt_input "Telegram Users Sheet ID (for bot registrations)" telegram_users_sheet_id
    prompt_input "Google Calendar ID" google_calendar_id
    prompt_input "Telegram Bot Token" telegram_bot_token
    
    # Create secrets
    print_status "Creating secrets in Secret Manager..."
    
    echo "$google_client_id" | gcloud secrets create google-client-id --data-file=- --project="$PROJECT_ID" 2>/dev/null || \
        (echo "$google_client_id" | gcloud secrets versions add google-client-id --data-file=- --project="$PROJECT_ID")
    
    echo "$google_client_secret" | gcloud secrets create google-client-secret --data-file=- --project="$PROJECT_ID" 2>/dev/null || \
        (echo "$google_client_secret" | gcloud secrets versions add google-client-secret --data-file=- --project="$PROJECT_ID")
    
    echo "$google_sheet_id" | gcloud secrets create google-sheet-id --data-file=- --project="$PROJECT_ID" 2>/dev/null || \
        (echo "$google_sheet_id" | gcloud secrets versions add google-sheet-id --data-file=- --project="$PROJECT_ID")
    
    echo "$approved_users_sheet_id" | gcloud secrets create approved-users-sheet-id --data-file=- --project="$PROJECT_ID" 2>/dev/null || \
        (echo "$approved_users_sheet_id" | gcloud secrets versions add approved-users-sheet-id --data-file=- --project="$PROJECT_ID")
    
    echo "$telegram_users_sheet_id" | gcloud secrets create telegram-users-sheet-id --data-file=- --project="$PROJECT_ID" 2>/dev/null || \
        (echo "$telegram_users_sheet_id" | gcloud secrets versions add telegram-users-sheet-id --data-file=- --project="$PROJECT_ID")
    
    echo "$google_calendar_id" | gcloud secrets create google-calendar-id --data-file=- --project="$PROJECT_ID" 2>/dev/null || \
        (echo "$google_calendar_id" | gcloud secrets versions add google-calendar-id --data-file=- --project="$PROJECT_ID")
    
    echo "$telegram_bot_token" | gcloud secrets create telegram-bot-token --data-file=- --project="$PROJECT_ID" 2>/dev/null || \
        (echo "$telegram_bot_token" | gcloud secrets versions add telegram-bot-token --data-file=- --project="$PROJECT_ID")
    
    # Generate and store JWT secret
    print_status "Generating JWT secret..."
    openssl rand -base64 64 | gcloud secrets create jwt-secret --data-file=- --project="$PROJECT_ID" 2>/dev/null || \
        (openssl rand -base64 64 | gcloud secrets versions add jwt-secret --data-file=- --project="$PROJECT_ID")
    
    print_success "All secrets created successfully!"
}

# Function to handle service account credentials
setup_service_account() {
    print_status "Setting up Google Service Account credentials..."
    
    local create_new=""
    prompt_input "Do you want to create a new service account? (y/n)" create_new "y"
    
    if [ "$create_new" = "y" ] || [ "$create_new" = "Y" ]; then
        # Create service account
        local sa_name="sant-padharamani-sa"
        local sa_email="${sa_name}@${PROJECT_ID}.iam.gserviceaccount.com"
        
        print_status "Creating service account: $sa_email"
        gcloud iam service-accounts create "$sa_name" \
            --display-name="Sant Padharamani Service Account" \
            --description="Service account for Sant Padharamani dashboard" \
            --project="$PROJECT_ID" 2>/dev/null || true
        
        # Grant necessary permissions
        print_status "Granting permissions to service account..."
        gcloud projects add-iam-policy-binding "$PROJECT_ID" \
            --member="serviceAccount:$sa_email" \
            --role="roles/sheets.editor"
        
        gcloud projects add-iam-policy-binding "$PROJECT_ID" \
            --member="serviceAccount:$sa_email" \
            --role="roles/calendar.editor"
        
        # Generate key file
        local key_file="/tmp/service-account-key.json"
        gcloud iam service-accounts keys create "$key_file" \
            --iam-account="$sa_email" \
            --project="$PROJECT_ID"
        
        # Store in Secret Manager
        gcloud secrets create google-service-account-credentials --data-file="$key_file" --project="$PROJECT_ID" 2>/dev/null || \
            gcloud secrets versions add google-service-account-credentials --data-file="$key_file" --project="$PROJECT_ID"
        
        # Clean up key file
        rm -f "$key_file"
        
        print_success "Service account created and configured!"
    else
        # Use existing service account file
        while [ ! -f "$SERVICE_ACCOUNT_FILE" ]; do
            prompt_input "Please provide path to existing service account JSON file" SERVICE_ACCOUNT_FILE
            if [ ! -f "$SERVICE_ACCOUNT_FILE" ]; then
                print_error "File not found: $SERVICE_ACCOUNT_FILE"
            fi
        done
        
        gcloud secrets create google-service-account-credentials --data-file="$SERVICE_ACCOUNT_FILE" --project="$PROJECT_ID" 2>/dev/null || \
            gcloud secrets versions add google-service-account-credentials --data-file="$SERVICE_ACCOUNT_FILE" --project="$PROJECT_ID"
        
        print_success "Service account credentials uploaded to Secret Manager!"
    fi
}

# Function to set up IAM permissions
setup_iam() {
    print_status "Setting up IAM permissions for Cloud Run..."
    
    # Get default Cloud Run service account
    local project_number=$(gcloud projects describe "$PROJECT_ID" --format="value(projectNumber)")
    local service_account="${project_number}-compute@developer.gserviceaccount.com"
    
    print_status "Granting Secret Manager access to Cloud Run service account..."
    gcloud projects add-iam-policy-binding "$PROJECT_ID" \
        --member="serviceAccount:$service_account" \
        --role="roles/secretmanager.secretAccessor"
    
    print_success "IAM permissions configured!"
}

# Function to build and deploy main application
deploy_main_app() {
    print_status "Building and deploying main application..."
    
    # Build and submit to Cloud Build
    print_status "Building Docker image for main application..."
    gcloud builds submit --tag "gcr.io/$PROJECT_ID/$MAIN_SERVICE_NAME" --project="$PROJECT_ID"
    
    # Deploy to Cloud Run
    print_status "Deploying main application to Cloud Run..."
    gcloud run deploy "$MAIN_SERVICE_NAME" \
        --image="gcr.io/$PROJECT_ID/$MAIN_SERVICE_NAME" \
        --platform=managed \
        --region="$REGION" \
        --allow-unauthenticated \
        --port=8080 \
        --memory=1Gi \
        --cpu=1 \
        --max-instances=10 \
        --set-env-vars="GOOGLE_CLOUD_PROJECT_ID=$PROJECT_ID,NODE_ENV=production" \
        --project="$PROJECT_ID"
    
    # Get service URL
    local main_url=$(gcloud run services describe "$MAIN_SERVICE_NAME" --region="$REGION" --format="value(status.url)" --project="$PROJECT_ID")
    
    print_success "Main application deployed successfully!"
    print_success "Application URL: $main_url"
    
    # Store URL for OAuth setup
    echo "$main_url" > /tmp/main_app_url.txt
}

# Function to build and deploy Telegram bot
deploy_bot() {
    print_status "Building and deploying Telegram bot..."
    
    # Build and submit to Cloud Build
    print_status "Building Docker image for Telegram bot..."
    gcloud builds submit --tag "gcr.io/$PROJECT_ID/$BOT_SERVICE_NAME" ./bot --project="$PROJECT_ID"
    
    # Deploy to Cloud Run
    print_status "Deploying Telegram bot to Cloud Run..."
    gcloud run deploy "$BOT_SERVICE_NAME" \
        --image="gcr.io/$PROJECT_ID/$BOT_SERVICE_NAME" \
        --platform=managed \
        --region="$REGION" \
        --no-allow-unauthenticated \
        --port=8080 \
        --memory=512Mi \
        --cpu=1 \
        --max-instances=5 \
        --set-env-vars="GOOGLE_CLOUD_PROJECT_ID=$PROJECT_ID" \
        --project="$PROJECT_ID"
    
    # Get bot service URL
    local bot_url=$(gcloud run services describe "$BOT_SERVICE_NAME" --region="$REGION" --format="value(status.url)" --project="$PROJECT_ID")
    
    print_success "Telegram bot deployed successfully!"
    print_success "Bot URL: $bot_url"
    
    # Store URL for scheduler setup
    echo "$bot_url" > /tmp/bot_url.txt
}

# Function to setup Cloud Scheduler
setup_scheduler() {
    print_status "Setting up Cloud Scheduler for daily reminders..."
    
    local bot_url=$(cat /tmp/bot_url.txt 2>/dev/null || echo "")
    
    if [ -z "$bot_url" ]; then
        print_error "Bot URL not found. Skipping scheduler setup."
        return 1
    fi
    
    # Create Cloud Scheduler job
    gcloud scheduler jobs create http daily-padharamani-reminders \
        --schedule="0 1 * * *" \
        --uri="$bot_url/send-reminders" \
        --http-method=POST \
        --time-zone="America/New_York" \
        --description="Daily padharamani reminders at 1 AM" \
        --project="$PROJECT_ID" 2>/dev/null || \
    gcloud scheduler jobs update http daily-padharamani-reminders \
        --schedule="0 1 * * *" \
        --uri="$bot_url/send-reminders" \
        --http-method=POST \
        --time-zone="America/New_York" \
        --description="Daily padharamani reminders at 1 AM" \
        --project="$PROJECT_ID"
    
    print_success "Cloud Scheduler configured for daily reminders at 1 AM!"
}

# Function to setup Cloud Build trigger (optional)
setup_build_trigger() {
    local setup_ci=""
    prompt_input "Do you want to set up continuous deployment with Cloud Build? (y/n)" setup_ci "n"
    
    if [ "$setup_ci" = "y" ] || [ "$setup_ci" = "Y" ]; then
        print_status "Setting up Cloud Build trigger..."
        
        local repo_name=""
        local repo_owner=""
        
        prompt_input "GitHub repository name" repo_name "Sant-Padhramani"
        prompt_input "GitHub repository owner" repo_owner
        
        # Create Cloud Build trigger
        gcloud builds triggers create github \
            --repo-name="$repo_name" \
            --repo-owner="$repo_owner" \
            --branch-pattern="^main$" \
            --build-config="cloudbuild.yaml" \
            --project="$PROJECT_ID"
        
        print_success "Cloud Build trigger created for continuous deployment!"
    fi
}

# Function to display final instructions
display_final_instructions() {
    local main_url=$(cat /tmp/main_app_url.txt 2>/dev/null || echo "")
    
    echo ""
    echo "========================================"
    echo "🎉 DEPLOYMENT COMPLETED SUCCESSFULLY! 🎉"
    echo "========================================"
    echo ""
    
    if [ -n "$main_url" ]; then
        print_success "Dashboard URL: $main_url"
    fi
    
    echo ""
    echo "📋 IMPORTANT NEXT STEPS:"
    echo "========================"
    echo ""
    echo "1. 🔐 Setup Google OAuth Redirect URI:"
    echo "   - Go to Google Cloud Console > APIs & Services > Credentials"
    echo "   - Edit your OAuth 2.0 Client ID"
    echo "   - Add authorized redirect URI: $main_url/auth/callback"
    echo ""
    echo "2. 📊 Setup Google Sheets:"
    echo "   - Create main padharamani data sheet with required columns"
    echo "   - Create approved users sheet with email addresses in column A"
    echo "   - Create telegram users sheet (bot will auto-populate)"
    echo "   - Share all sheets with the service account email"
    echo ""
    echo "3. 📅 Setup Google Calendar:"
    echo "   - Create or use existing Google Calendar"
    echo "   - Share calendar with the service account email (Editor permission)"
    echo "   - Note the Calendar ID from settings"
    echo ""
    echo "4. 🤖 Test Telegram Bot:"
    echo "   - Search for your bot in Telegram"
    echo "   - Send /start command to test"
    echo "   - Use /register to register for reminders"
    echo ""
    echo "5. 🔍 Monitor Services:"
    echo "   - Main app health: $main_url/health"
    echo "   - View logs: gcloud logging read 'resource.type=cloud_run_revision' --limit=50"
    echo ""
    echo "📚 For detailed setup instructions, see the README.md file."
    echo ""
    
    # Clean up temporary files
    rm -f /tmp/main_app_url.txt /tmp/bot_url.txt
    
    print_success "Deployment script completed successfully!"
}

# Main deployment function
main() {
    echo "========================================"
    echo "🚀 Sant Padharamani GCP Deployment Script"
    echo "========================================"
    echo ""
    
    # Check prerequisites
    print_status "Checking prerequisites..."
    
    if ! command_exists gcloud; then
        print_error "Google Cloud SDK is not installed. Please install it first."
        exit 1
    fi
    
    if ! command_exists docker; then
        print_warning "Docker is not installed. Cloud Build will handle container building."
    fi
    
    if ! command_exists openssl; then
        print_error "OpenSSL is not installed. Required for generating JWT secrets."
        exit 1
    fi
    
    # Check authentication
    check_gcloud_auth
    
    # Get project configuration
    echo ""
    echo "📋 PROJECT CONFIGURATION"
    echo "========================="
    
    # Get current project or prompt for new one
    local current_project=$(gcloud config get-value project 2>/dev/null || echo "")
    prompt_input "Google Cloud Project ID" PROJECT_ID "$current_project"
    
    prompt_input "Deployment region" REGION "$REGION"
    
    # Set project
    gcloud config set project "$PROJECT_ID"
    
    print_status "Using project: $PROJECT_ID"
    print_status "Using region: $REGION"
    
    echo ""
    echo "🚀 STARTING DEPLOYMENT..."
    echo "=========================="
    
    # Execute deployment steps
    enable_apis
    create_secrets
    setup_service_account
    setup_iam
    deploy_main_app
    deploy_bot
    setup_scheduler
    setup_build_trigger
    
    # Display final instructions
    display_final_instructions
}

# Handle script interruption
trap 'print_error "Deployment interrupted. You may need to clean up partial deployments."; exit 1' INT TERM

# Run main function
main "$@"