# 🛠️ Sant Padharamani - Deployment Troubleshooting Guide

## 🚨 Common Deployment Issues and Solutions

### Issue 1: Permission Denied Errors

**Error Message:**
```
PERMISSION_DENIED: Permission denied to enable service [oauth2.googleapis.com]
```

**Root Cause:** 
- Incorrect API name (`oauth2.googleapis.com` doesn't exist)
- Insufficient permissions on GCP project

**Solutions:**

#### Option A: Use the Fixed Deployment Script
```bash
# Use the improved script that handles these issues
./deploy-fixed.sh
```

#### Option B: Manual API Enablement
```bash
# Enable correct APIs manually
gcloud services enable run.googleapis.com
gcloud services enable cloudbuild.googleapis.com
gcloud services enable secretmanager.googleapis.com
gcloud services enable cloudscheduler.googleapis.com
gcloud services enable sheets.googleapis.com
gcloud services enable calendar.googleapis.com
gcloud services enable containerregistry.googleapis.com
gcloud services enable iam.googleapis.com
```

#### Option C: Check Your Permissions
```bash
# Check your current permissions
gcloud auth list
gcloud projects get-iam-policy YOUR_PROJECT_ID --flatten="bindings[].members" --filter="bindings.members:$(gcloud auth list --filter=status:ACTIVE --format='value(account)')"

# If you don't have Owner/Editor role, ask your admin to grant it:
gcloud projects add-iam-policy-binding YOUR_PROJECT_ID --member="user:YOUR_EMAIL" --role="roles/editor"
```

### Issue 2: Authentication Problems

**Error Message:**
```
You are not authenticated. Please run 'gcloud auth login' first.
```

**Solution:**
```bash
# Authenticate with gcloud
gcloud auth login

# Set up application default credentials
gcloud auth application-default login

# Set your project
gcloud config set project YOUR_PROJECT_ID
```

### Issue 3: Docker Build Failures

**Error Message:**
```
ERROR: failed to build: error during connect to Docker daemon
```

**Solution:**
```bash
# If running locally, make sure Docker is running
# If in Cloud Shell, Docker should work automatically

# Alternative: Use Cloud Build directly
gcloud builds submit --tag gcr.io/YOUR_PROJECT_ID/sant-padharamani
```

### Issue 4: Secret Manager Access Denied

**Error Message:**
```
ERROR: (gcloud.secrets.create) PERMISSION_DENIED: Permission secretmanager.secrets.create denied
```

**Solution:**
```bash
# Grant Secret Manager permissions
gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
  --member="user:$(gcloud auth list --filter=status:ACTIVE --format='value(account)')" \
  --role="roles/secretmanager.admin"
```

### Issue 5: Cloud Run Service Won't Start

**Check Deployment Status:**
```bash
# Check service status
gcloud run services describe sant-padharamani --region=us-central1

# Check logs for errors
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=sant-padharamani" --limit=20
```

**Common Causes:**
1. **Port Configuration**: Ensure your app listens on port 8080
2. **Secret Access**: Verify Cloud Run has Secret Manager permissions
3. **Environment Variables**: Check required env vars are set

**Solution:**
```bash
# Redeploy with explicit configuration
gcloud run deploy sant-padharamani \
  --image=gcr.io/YOUR_PROJECT_ID/sant-padharamani \
  --port=8080 \
  --memory=1Gi \
  --set-env-vars=GOOGLE_CLOUD_PROJECT_ID=YOUR_PROJECT_ID,NODE_ENV=production
```

### Issue 6: Google Sheets API Errors

**Error Message:**
```
The caller does not have permission to access the Google Sheets
```

**Solution:**
1. **Share your Google Sheets** with the service account:
   ```
   Email: sant-padharamani-sa@YOUR_PROJECT_ID.iam.gserviceaccount.com
   Permission: Editor
   ```

2. **Check Sheet IDs** are correct in your configuration

3. **Verify Sheets API** is enabled:
   ```bash
   gcloud services enable sheets.googleapis.com
   ```

### Issue 7: Calendar Integration Not Working

**Solution:**
1. **Share Google Calendar** with service account:
   ```
   Email: sant-padharamani-sa@YOUR_PROJECT_ID.iam.gserviceaccount.com
   Permission: Make changes to events
   ```

2. **Get correct Calendar ID**:
   - Go to Google Calendar settings
   - Find "Calendar ID" (usually ends with @gmail.com or @group.calendar.google.com)

3. **Enable Calendar API**:
   ```bash
   gcloud services enable calendar.googleapis.com
   ```

### Issue 8: Telegram Bot Not Responding

**Debugging Steps:**
1. **Check bot token** is correct in Secret Manager
2. **Test bot deployment**:
   ```bash
   curl -X POST "https://YOUR_BOT_URL/health"
   ```
3. **Check bot logs**:
   ```bash
   gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=sant-padharamani-bot" --limit=20
   ```

**Common Fixes:**
- Verify Telegram bot token from @BotFather
- Ensure bot URL is accessible (may need authentication)
- Check if Cloud Scheduler job exists and is enabled

### Issue 9: OAuth Callback Errors

**Error Message:**
```
redirect_uri_mismatch
```

**Solution:**
1. **Get your actual Cloud Run URL**:
   ```bash
   gcloud run services describe sant-padharamani --region=us-central1 --format="value(status.url)"
   ```

2. **Add redirect URI** to Google Cloud Console:
   - Go to APIs & Services > Credentials
   - Edit your OAuth 2.0 Client ID
   - Add: `https://YOUR_ACTUAL_CLOUD_RUN_URL/auth/callback`

3. **Ensure exact match** (no trailing slashes, correct protocol)

### Issue 10: Configuration File Problems

**Error Message:**
```
Configuration file 'deploy-config.env' not found!
```

**Solution:**
```bash
# Create your config file
cp deploy-config.env my-config.env

# Edit with your actual values
nano my-config.env

# Use specific config file
CONFIG_FILE=my-config.env ./deploy-fixed.sh
```

## 🚀 Step-by-Step Recovery Process

If deployment fails completely, follow these steps:

### 1. Clean Start
```bash
# Ensure you're authenticated
gcloud auth login
gcloud auth application-default login

# Set project
gcloud config set project YOUR_PROJECT_ID
```

### 2. Check Project Permissions
```bash
# Verify you have necessary roles
gcloud projects get-iam-policy YOUR_PROJECT_ID --flatten="bindings[].members" --filter="bindings.members:$(gcloud auth list --filter=status:ACTIVE --format='value(account)')"
```

### 3. Enable APIs Manually
```bash
# Enable all required APIs one by one
gcloud services enable run.googleapis.com
gcloud services enable cloudbuild.googleapis.com
gcloud services enable secretmanager.googleapis.com
gcloud services enable cloudscheduler.googleapis.com
gcloud services enable sheets.googleapis.com
gcloud services enable calendar.googleapis.com
gcloud services enable containerregistry.googleapis.com
```

### 4. Use Fixed Deployment Script
```bash
# Use the improved script
./deploy-fixed.sh
```

### 5. Manual Deployment (if scripts fail)
```bash
# Create secrets manually
echo "YOUR_CLIENT_ID" | gcloud secrets create google-client-id --data-file=-
echo "YOUR_CLIENT_SECRET" | gcloud secrets create google-client-secret --data-file=-
# ... continue for all secrets

# Build and deploy manually
gcloud builds submit --tag gcr.io/YOUR_PROJECT_ID/sant-padharamani
gcloud run deploy sant-padharamani --image=gcr.io/YOUR_PROJECT_ID/sant-padharamani
```

## 🔍 Debugging Commands

### Check Service Health
```bash
# Main app health
curl https://YOUR_MAIN_URL/health

# Bot health (if accessible)
curl https://YOUR_BOT_URL/health
```

### View Logs
```bash
# All Cloud Run logs
gcloud logging read "resource.type=cloud_run_revision" --limit=50

# Specific service logs
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=sant-padharamani" --limit=20

# Real-time logs
gcloud logging tail "resource.type=cloud_run_revision AND resource.labels.service_name=sant-padharamani"
```

### Check Resources
```bash
# List Cloud Run services
gcloud run services list

# List secrets
gcloud secrets list

# List scheduled jobs
gcloud scheduler jobs list

# Check service account
gcloud iam service-accounts list --filter="email:sant-padharamani-sa@*"
```

## 💡 Pro Tips

1. **Always use the fixed deployment script**: `./deploy-fixed.sh`
2. **Keep your config file private**: Never commit actual credentials
3. **Test incrementally**: Deploy main app first, then bot
4. **Use Cloud Shell**: It has all tools pre-installed and authenticated
5. **Check quotas**: Ensure your project has sufficient quotas for Cloud Run

## 🆘 Getting Help

If you're still having issues:

1. **Check the deployment logs** carefully for specific error messages
2. **Verify all prerequisite steps** are completed
3. **Test each component separately** (OAuth, Sheets, Calendar, Telegram)
4. **Use the GCP Console** to verify resources are created correctly

### Useful GCP Console Links:
- [Cloud Run Services](https://console.cloud.google.com/run)
- [Secret Manager](https://console.cloud.google.com/security/secret-manager)
- [Cloud Scheduler](https://console.cloud.google.com/cloudscheduler)
- [IAM & Admin](https://console.cloud.google.com/iam-admin)
- [API Library](https://console.cloud.google.com/apis/library)

---

**Remember**: The `deploy-fixed.sh` script handles most of these issues automatically! 🚀