<!-- Triggering new deployment -->

# Sant Padhramani

This is a Node.js/Express application for Sant Padhramani, deployed on Google Cloud Run.

## Features

- Google Sheets integration for data storage.
- JWT authentication.
- Telegram bot component (planned).

## Deployment

Deployment is handled via GitHub Connect to Google Cloud Run.

## Environment Variables

- `NODE_ENV`: `production`
- `GOOGLE_SPREADSHEET_ID`: ID of the Google Sheet used for data.
- `TELEGRAM_BOT_TOKEN`: Telegram Bot API token.
- `JWT_SECRET`: Secret key for JWT signing and verification (fetched from Google Secret Manager).
- `GOOGLE_SERVICE_ACCOUNT_PATH`: Path to the Google Service Account credentials file (mounted from Google Secret Manager).
- `GOOGLE_CLOUD_PROJECT_ID`: Your Google Cloud Project ID.
