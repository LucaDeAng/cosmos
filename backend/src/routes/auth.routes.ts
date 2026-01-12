// Authentication Routes
import express from 'express';
import { AuthService } from '../auth/auth.service';
import { rateLimit } from '../middleware/auth.middleware';

const router = express.Router();
const isDev = process.env.NODE_ENV !== 'production';

/**
 * POST /api/auth/register
 * Register a new user
 */
router.post('/register', rateLimit(10, 60000), async (req, res) => {
  try {
    const { email, password, fullName, companyName, companyDomain } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const result = await AuthService.register({
      email,
      password,
      fullName,
      companyName,
      companyDomain,
    });

    res.status(201).json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * POST /api/auth/login
 * Login user
 */
router.post('/login', rateLimit(5, 60000), async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const ipAddress = req.ip;
    const userAgent = req.headers['user-agent'];

    const result = await AuthService.login(
      { email, password },
      ipAddress,
      userAgent
    );

    res.json(result);
  } catch (error: any) {
    res.status(401).json({ error: error.message });
  }
});

/**
 * GET /api/auth/verify-email
 * Verify email address
 */
router.get('/verify-email', async (req, res) => {
  try {
    const { token } = req.query;

    if (!token || typeof token !== 'string') {
      return res.status(400).json({ error: 'Verification token is required' });
    }

    const result = await AuthService.verifyEmail(token);
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * POST /api/auth/forgot-password
 * Request password reset
 */
router.post('/forgot-password', rateLimit(3, 60000), async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const result = await AuthService.requestPasswordReset(email);
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * POST /api/auth/reset-password
 * Reset password with token
 */
router.post('/reset-password', async (req, res) => {
  try {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
      return res.status(400).json({ error: 'Token and new password are required' });
    }

    const result = await AuthService.resetPassword(token, newPassword);
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * POST /api/auth/oauth/:provider
 * Social login (google/github)
 * Body: { token?: string, email?: string, fullName?: string }
 */
router.post('/oauth/:provider', rateLimit(10, 60000), async (req, res) => {
  try {
    const { provider } = req.params;
    const { token, email, fullName } = req.body || {};

    if (!token && !isDev) {
      return res.status(400).json({ error: 'Token is required' });
    }

    const result = await AuthService.socialLogin({
      provider: provider as 'google' | 'github',
      token,
      email,
      fullName,
    });

    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message || 'OAuth login failed' });
  }
});

export default router;
