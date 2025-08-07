import os
import json
import logging
from google.cloud import secretmanager
from typing import Dict, Optional

logger = logging.getLogger(__name__)

class SecretManager:
    """
    Google Cloud Secret Manager client for retrieving secrets
    """
    
    def __init__(self):
        self.client = secretmanager.SecretManagerServiceClient()
        self.project_id = os.getenv('GOOGLE_CLOUD_PROJECT_ID')
        self.cache = {}
        self.cache_expiry = 5 * 60  # 5 minutes in seconds
        
    def get_secret(self, secret_name: str, version: str = 'latest') -> Optional[str]:
        """
        Get a secret from Google Cloud Secret Manager or environment variable
        
        Args:
            secret_name: Name of the secret
            version: Version of the secret (default: 'latest')
            
        Returns:
            The secret value as string
        """
        # First check environment variables (for simple deployment or local dev)
        env_value = os.getenv(secret_name.upper().replace('-', '_'))
        if env_value:
            logger.info(f"Using environment variable for {secret_name}")
            return env_value
        
        # Check cache first
        cache_key = f"{secret_name}:{version}"
        if cache_key in self.cache:
            cached_data = self.cache[cache_key]
            if (cached_data['timestamp'] + self.cache_expiry) > self._get_current_time():
                return cached_data['value']
        
        try:
            # Cloud Run environment - get from Secret Manager
            name = f"projects/{self.project_id}/secrets/{secret_name}/versions/{version}"
            response = self.client.access_secret_version(request={"name": name})
            secret = response.payload.data.decode("UTF-8")
            
            # Cache the secret
            self.cache[cache_key] = {
                'value': secret,
                'timestamp': self._get_current_time()
            }
            
            return secret
        except Exception as error:
            logger.error(f"Failed to retrieve secret {secret_name}: {error}")
            
            # Fallback to environment variable
            env_value = os.getenv(secret_name.upper())
            if env_value:
                return env_value
            
            raise Exception(f"Secret {secret_name} not found in Secret Manager or environment variables")
    
    def get_secrets(self, secret_names: list) -> Dict[str, Optional[str]]:
        """
        Get multiple secrets at once
        
        Args:
            secret_names: List of secret names
            
        Returns:
            Dictionary with secret names as keys and values as secrets
        """
        secrets = {}
        for name in secret_names:
            try:
                secrets[name] = self.get_secret(name)
            except Exception as error:
                logger.error(f"Failed to get secret {name}: {error}")
                secrets[name] = None
        
        return secrets
    
    def get_service_account_credentials(self) -> dict:
        """
        Get Google service account credentials
        
        Returns:
            Service account credentials as dictionary
        """
        try:
            # Check for base64-encoded credentials in environment variable first
            if os.getenv('GOOGLE_SERVICE_ACCOUNT_CREDENTIALS'):
                try:
                    import base64
                    decoded = base64.b64decode(os.getenv('GOOGLE_SERVICE_ACCOUNT_CREDENTIALS')).decode()
                    credentials = json.loads(decoded)
                    logger.info('Using base64-encoded service account credentials from environment')
                    return credentials
                except Exception as decode_error:
                    # If base64 decode fails, try as direct JSON
                    try:
                        credentials = json.loads(os.getenv('GOOGLE_SERVICE_ACCOUNT_CREDENTIALS'))
                        logger.info('Using direct JSON service account credentials from environment')
                        return credentials
                    except Exception as json_error:
                        logger.error(f"Failed to parse service account credentials from environment: {json_error}")

            # Try Secret Manager
            credentials_json = self.get_secret('google-service-account-credentials')
            return json.loads(credentials_json)
        except Exception as error:
            logger.error(f"Failed to get service account credentials: {error}")
            
            # For local development, try the GOOGLE_APPLICATION_CREDENTIALS file
            if os.getenv('GOOGLE_APPLICATION_CREDENTIALS') and os.getenv('GOOGLE_APPLICATION_CREDENTIALS').endswith('.json'):
                try:
                    with open(os.getenv('GOOGLE_APPLICATION_CREDENTIALS'), 'r') as f:
                        return json.load(f)
                except Exception as file_error:
                    logger.error(f"Failed to read local credentials file: {file_error}")
            
            raise Exception('Service account credentials not found')
    
    def clear_cache(self):
        """Clear the cache (useful for testing or forced refresh)"""
        self.cache.clear()
    
    def _get_current_time(self) -> int:
        """Get current timestamp"""
        import time
        return int(time.time())

# Create a singleton instance
secret_manager = SecretManager()