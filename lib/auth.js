import got from 'got';
import { auth0Config } from './config.js';
import { logger } from './logger.js';
import { Store } from './store.js';

const tokenStore = new Store('auth0-store');
const TOKEN_KEY = 'tokens';

const auth = {
  async login(apiKey) {
    try {
      logger.info('Logging in with API key');
      
      // Exchange API key for token
      const { token } = await got.post('https://api.testdriver.ai/auth/exchange-api-key', {
        json: { apiKey }
      }).json();

      if (!token) {
        throw new Error('Failed to exchange API key for token');
      }

      // Get user info to verify the token works
      const user = await got.get('https://api.testdriver.ai/api/v1/whoami', {
        headers: {
          Authorization: `Bearer ${token}`
        }
      }).json();

      // Store both token and user info
      tokenStore.set(TOKEN_KEY, {
        token,
        user,
        expires_at: Date.now() + (24 * 60 * 60 * 1000) // 24 hours
      });

      logger.info('Successfully logged in');
      return token;

    } catch (error) {
      logger.error('Authentication failed:', error);
      throw error;
    }
  },

  async logout() {
    try {
      tokenStore.delete(TOKEN_KEY);
      logger.info('Successfully logged out');
    } catch (error) {
      logger.error('Failed to logout:', error);
      throw error;
    }
  },

  async getToken() {
    const tokens = tokenStore.get(TOKEN_KEY);
    if (!tokens || Date.now() >= tokens.expires_at) {
      throw new Error('No valid token found. Please login with an API key first');
    }
    return tokens.token;
  },

  async isAuthenticated() {
    const tokens = tokenStore.get(TOKEN_KEY);
    return tokens && tokens.expires_at && Date.now() < tokens.expires_at;
  },

  async getStsCredentials() {
    const token = await this.getToken();
    const response = await got.post('https://api.testdriver.ai/api/v1/upload/sts', {
      headers: {
        Authorization: `Bearer ${token}`
      }
    }).json();
    
    logger.debug('STS response:', response);

    // Ensure all required fields are present
    const required = ['accessKeyId', 'secretAccessKey', 'sessionToken', 'bucket'];
    const missing = required.filter(field => !response[field]);
    if (missing.length > 0) {
      throw new Error(`Missing required STS fields: ${missing.join(', ')}`);
    }

    const timestamp = Date.now();
    const uploadId = Math.random().toString(36).substring(2, 15);
    
    return {
      accessKeyId: response.accessKeyId,
      secretAccessKey: response.secretAccessKey,
      sessionToken: response.sessionToken,
      bucket: response.bucket,
      file: `uploads/${timestamp}-${uploadId}`, // More unique file path
      region: response.region || 'us-east-1' // Default to us-east-1 if not specified
    };
  }
};

export { auth };
