# 🚀 Sant Padharamani - Deployment Options

Choose the deployment method that best fits your needs and security requirements.

## 📊 Deployment Methods Comparison

| Method | Security | Ease of Use | Best For | Command |
|--------|----------|-------------|----------|---------|
| **Secret Manager** | 🔒🔒🔒 High | 🟡 Medium | Production | `./deploy-fixed.sh` |
| **Environment Variables** | 🔒 Basic | 🟢 Easy | Testing/Dev | `./deploy-simple.sh` |
| **Interactive** | 🔒🔒🔒 High | 🟡 Medium | First Time | `./deploy.sh` |

---

## Option 1: Simple Deployment (Environment Variables) ⭐ **EASIEST**

**Best for**: Quick testing, development, proof of concept

### ✅ Pros:
- **Fastest setup** - no Secret Manager complexity
- **Easy debugging** - credentials visible in env vars  
- **Simple configuration** - just one config file
- **Quick iterations** - modify and redeploy easily

### ⚠️ Cons:
- **Less secure** - credentials stored in Cloud Run environment
- **Not recommended for production** - potential security risk
- **Credential rotation harder** - need to redeploy to change secrets

### 🚀 How to Use:
```bash
# 1. Configure your credentials
cp deploy-config.env my-config.env
# Edit my-config.env with all your values

# 2. Deploy with environment variables
CONFIG_FILE=my-config.env ./deploy-simple.sh
```

### 🔧 What it does:
- Creates service account for Sheets/Calendar access
- Stores all credentials as Cloud Run environment variables
- Deploys both main app and Telegram bot
- Sets up Cloud Scheduler (if possible)
- **No Secret Manager setup needed!**

---

## Option 2: Secure Deployment (Secret Manager) 🔒 **MOST SECURE**

**Best for**: Production deployments, enterprise use, long-term projects

### ✅ Pros:
- **Highly secure** - credentials never visible in plain text
- **Professional standard** - follows Google Cloud best practices
- **Easy credential rotation** - update secrets without redeploying
- **Audit trail** - Secret Manager tracks access
- **Role-based access** - fine-grained permission control

### ⚠️ Cons:
- **More complex setup** - requires Secret Manager permissions
- **Additional GCP costs** - Secret Manager has minimal pricing
- **Debugging harder** - secrets not visible in environment

### 🚀 How to Use:
```bash
# 1. Configure your credentials  
cp deploy-config.env my-config.env
# Edit my-config.env with all your values

# 2. Deploy with Secret Manager (handles permission issues)
CONFIG_FILE=my-config.env ./deploy-fixed.sh
```

### 🔧 What it does:
- Creates all secrets in Google Cloud Secret Manager
- Sets up proper IAM permissions
- Creates service account with minimal required permissions
- Deploys applications that fetch secrets at runtime
- Handles API enablement and permission errors

---

## Option 3: Interactive Deployment 🤝 **GUIDED**

**Best for**: First-time deployment, learning how it works, custom configuration

### ✅ Pros:
- **Step-by-step guidance** - prompts for each setting
- **Educational** - explains what each step does
- **Flexible** - customize deployment options
- **Error handling** - detailed error messages and recovery

### ⚠️ Cons:
- **Takes longer** - requires manual input for each value
- **Less automation** - more human intervention needed

### 🚀 How to Use:
```bash
# Run interactive deployment
./deploy.sh
# Follow the prompts to enter your credentials
```

---

## 🎯 Quick Decision Guide

### **Just want to test it quickly?**
```bash
# Use simple deployment
cp deploy-config.env test-config.env
# Edit test-config.env
CONFIG_FILE=test-config.env ./deploy-simple.sh
```

### **Setting up for production use?**
```bash
# Use secure deployment  
cp deploy-config.env prod-config.env
# Edit prod-config.env
CONFIG_FILE=prod-config.env ./deploy-fixed.sh
```

### **First time and want to understand each step?**
```bash
# Use interactive deployment
./deploy.sh
```

### **Having permission issues?**
```bash
# Use the fixed deployment script - handles most permission problems
./deploy-fixed.sh
```

---

## 📋 Required Information (All Methods)

You'll need these regardless of deployment method:

### Google Cloud:
- **Project ID** - Your GCP project identifier
- **OAuth Client ID & Secret** - From Google Cloud Console > APIs & Services > Credentials

### Google Sheets:
- **Main Sheet ID** - For padharamani data (from sheet URL)
- **Approved Users Sheet ID** - For login whitelist (from sheet URL) 
- **Telegram Users Sheet ID** - For bot registrations (from sheet URL)

### Google Calendar:
- **Calendar ID** - From Calendar Settings (usually ends with @gmail.com)

### Telegram:
- **Bot Token** - From [@BotFather](https://t.me/botfather)

---

## 🔄 Switching Between Methods

You can switch deployment methods anytime:

### From Simple to Secure:
```bash
# Your app will automatically prefer Secret Manager if available
./deploy-fixed.sh  # Migrates to Secret Manager
```

### From Secure to Simple:
```bash
# Redeploy with environment variables
./deploy-simple.sh  # Uses env vars instead
```

### Testing Both:
```bash
# Deploy to different services
gcloud run deploy sant-padharamani-test --image=gcr.io/PROJECT/sant-padharamani
gcloud run deploy sant-padharamani-prod --image=gcr.io/PROJECT/sant-padharamani
```

---

## 🛠️ Troubleshooting by Method

### Simple Deployment Issues:
- **"Permission denied"** → Use `./deploy-fixed.sh` instead
- **"Environment variable not set"** → Check your config file has all values
- **"Service account key failed"** → May need to create service account manually

### Secure Deployment Issues:
- **"Secret not found"** → Check Secret Manager permissions
- **"API not enabled"** → Script should handle this automatically
- **"IAM permission denied"** → Ensure you have Editor/Owner role

### General Issues:
- **"gcloud not authenticated"** → Run `gcloud auth login`
- **"Docker build failed"** → Check if you have Docker running locally
- **"Region not available"** → Try different region (us-central1, us-east1)

---

## 💡 Pro Tips

1. **Start with Simple**: Use `./deploy-simple.sh` for initial testing
2. **Upgrade to Secure**: Use `./deploy-fixed.sh` for production
3. **Use Config Files**: Keep different config files for dev/staging/prod
4. **Test Locally First**: Use `.env` file for local development before deploying
5. **Monitor Logs**: Always check deployment logs if something fails

---

## 🔗 Quick Links

- **Simple Deployment**: `./deploy-simple.sh` - Fast & Easy
- **Secure Deployment**: `./deploy-fixed.sh` - Production Ready  
- **Interactive Deployment**: `./deploy.sh` - Guided Setup
- **Troubleshooting**: See `TROUBLESHOOTING.md`
- **Full Documentation**: See `DEPLOYMENT.md`

Choose the method that fits your needs and get your Sant Padharamani dashboard running! 🙏