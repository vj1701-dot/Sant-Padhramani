#!/bin/bash

# Sant Padharamani - Simple Cloud Run Deployment Script
# This script deploys the modern JSON-based Sant Padhramani application

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

# Configuration
PROJECT_ID="${PROJECT_ID:-}"
REGION="${REGION:-us-central1}"
SERVICE_NAME="${SERVICE_NAME:-sant-padharamani}"

prompt_input() {
    local prompt_text="$1"
    local var_name="$2"
    local current_value="${!var_name}"
    
    if [ -n "$current_value" ]; then
        read -p "$prompt_text [$current_value]: " input
        if [ -z "$input" ]; then
            eval "$var_name=\"$current_value\""
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

check_gcloud_auth() {
    if ! gcloud auth list --filter=status:ACTIVE --format="value(account)" | grep -q "."; then
        print_error "You are not authenticated with gcloud. Please run 'gcloud auth login' first."
        exit 1
    fi
}

echo "========================================"
echo "🚀 Sant Padharamani Simple Deploy"
echo "========================================"
echo ""
echo "This script deploys the modern JSON-based Sant Padhramani application."
echo "No Google Sheets setup required - uses local JSON storage with cloud backup."
echo ""

# Check prerequisites
check_gcloud_auth

# Get project configuration
print_status "Getting project configuration..."
current_project=$(gcloud config get-value project 2>/dev/null || echo "")
prompt_input "Google Cloud Project ID" PROJECT_ID "$current_project"
prompt_input "Deployment region" REGION "$REGION"
prompt_input "Service name" SERVICE_NAME "$SERVICE_NAME"

# Set project
gcloud config set project "$PROJECT_ID"

print_status "Using project: $PROJECT_ID"
print_status "Using region: $REGION"
print_status "Service name: $SERVICE_NAME"

# Enable required APIs
print_status "Enabling required APIs..."
gcloud services enable run.googleapis.com cloudbuild.googleapis.com secretmanager.googleapis.com storage.googleapis.com

# Generate JWT secret
print_status "Generating JWT secret..."
JWT_SECRET=$(openssl rand -base64 64)
echo "$JWT_SECRET" | gcloud secrets create jwt-secret --data-file=- 2>/dev/null || \
    echo "$JWT_SECRET" | gcloud secrets versions add jwt-secret --data-file=-

# Create storage bucket for backups
print_status "Setting up backup storage..."
BACKUP_BUCKET="${PROJECT_ID}-sant-padharamani-backups"
gsutil mb gs://$BACKUP_BUCKET 2>/dev/null || \
    print_warning "Backup bucket already exists or couldn't be created"

# Setup IAM for Cloud Run
print_status "Setting up IAM permissions..."
PROJECT_NUMBER=$(gcloud projects describe "$PROJECT_ID" --format="value(projectNumber)")
SERVICE_ACCOUNT="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"

gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:$SERVICE_ACCOUNT" \
    --role="roles/secretmanager.secretAccessor" >/dev/null 2>&1 || true

gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:$SERVICE_ACCOUNT" \
    --role="roles/storage.objectAdmin" >/dev/null 2>&1 || true

# Build and deploy application
print_status "Building application..."
if gcloud builds submit --tag "gcr.io/$PROJECT_ID/$SERVICE_NAME" --project="$PROJECT_ID"; then
    print_success "✓ Application built successfully"
else
    print_error "Failed to build application"
    exit 1
fi

print_status "Deploying to Cloud Run..."
if gcloud run deploy "$SERVICE_NAME" \
    --image="gcr.io/$PROJECT_ID/$SERVICE_NAME" \
    --platform=managed \
    --region="$REGION" \
    --allow-unauthenticated \
    --port=8080 \
    --memory=1Gi \
    --cpu=1 \
    --max-instances=10 \
    --timeout=300 \
    --concurrency=1000 \
    --set-env-vars="NODE_ENV=production,BACKUP_BUCKET_NAME=$BACKUP_BUCKET" \
    --project="$PROJECT_ID"; then
    
    APP_URL=$(gcloud run services describe "$SERVICE_NAME" --region="$REGION" --format="value(status.url)" --project="$PROJECT_ID")
    print_success "✓ Application deployed successfully!"
else
    print_error "Failed to deploy application"
    exit 1
fi

# Final output
echo ""
echo "========================================"
print_success "🎉 DEPLOYMENT COMPLETED SUCCESSFULLY!"
echo "========================================"
echo ""
print_success "Dashboard URL: $APP_URL"
echo ""
echo "📋 NEXT STEPS:"
echo "=============="
echo ""
echo "1. 🔐 Access your application:"
echo "   Login URL: $APP_URL/auth/login-page"
echo "   Email: admin@santpadharamani.com"
echo "   Password: admin123456"
echo "   ⚠️ Change password after first login!"
echo ""
echo "2. 🔍 Test the application:"
echo "   Health check: $APP_URL/health"
echo "   Start managing padharamani services!"
echo ""
echo "3. 💾 Automatic backups:"
echo "   Backups are stored in: gs://$BACKUP_BUCKET"
echo "   Access via Settings > Backup & Restore"
echo ""
echo "4. 📊 Monitor your service:"
echo "   Console: https://console.cloud.google.com/run/detail/$REGION/$SERVICE_NAME?project=$PROJECT_ID"
echo "   Logs: gcloud logging read 'resource.type=cloud_run_revision' --limit=50 --project=$PROJECT_ID"
echo ""
echo "🔗 Useful Links:"
echo "- GCP Console: https://console.cloud.google.com/home/dashboard?project=$PROJECT_ID"
echo "- Cloud Run: https://console.cloud.google.com/run?project=$PROJECT_ID"
echo "- Storage: https://console.cloud.google.com/storage/browser/$BACKUP_BUCKET?project=$PROJECT_ID"
echo ""
print_success "Happy managing padharamanis! 🙏"