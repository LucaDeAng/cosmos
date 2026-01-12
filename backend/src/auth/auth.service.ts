// Authentication Service
// Handles user registration, login, and verification

import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { supabase } from '../config/supabase';
import { sendVerificationEmail, sendPasswordResetEmail } from '../utils/email';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const JWT_EXPIRES_IN = '7d';
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_DURATION_MINUTES = 30;

interface RegisterData {
  email: string;
  password: string;
  fullName?: string;
  companyName?: string;
  companyDomain?: string;
}

interface LoginData {
  email: string;
  password: string;
}

interface SocialLoginData {
  provider: 'google' | 'github';
  token?: string; // access_token or id_token
  email?: string; // fallback for dev mode
  fullName?: string; // optional display name
}

export class AuthService {
  /**
   * Register a new user
   */
  static async register(data: RegisterData) {
    const { email, password, fullName, companyName, companyDomain } = data;

    // Validate email format
    if (!this.isValidEmail(email)) {
      throw new Error('Invalid email format');
    }

    // Validate password strength (relaxed in development)
    const isDev = process.env.NODE_ENV !== 'production';
    if (!isDev && !this.isStrongPassword(password)) {
      throw new Error('Password must be at least 8 characters with uppercase, lowercase, number, and special character');
    }
    if (password.length < 8) {
      throw new Error('Password must be at least 8 characters');
    }

    // Check if user already exists
    const { data: existingUser } = await supabase
      .from('users')
      .select('id')
      .eq('email', email.toLowerCase())
      .single();

    if (existingUser) {
      throw new Error('User with this email already exists');
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Generate email verification token
    const verificationToken = crypto.randomBytes(32).toString('hex');

    // Create company if provided (or find existing by domain)
    let companyId = null;
    if (companyName) {
      const domain = companyDomain || email.split('@')[1];
      
      // First check if company with this domain already exists
      const { data: existingCompany } = await supabase
        .from('companies')
        .select('id')
        .eq('domain', domain)
        .single();

      if (existingCompany) {
        // Use existing company
        companyId = existingCompany.id;
      } else {
        // Create new company
        const { data: company, error: companyError } = await supabase
          .from('companies')
          .insert({
            name: companyName,
            domain: domain,
          })
          .select()
          .single();

        if (companyError) {
          // If still fails (race condition), try to get existing
          const { data: fallbackCompany } = await supabase
            .from('companies')
            .select('id')
            .eq('domain', domain)
            .single();
          
          if (fallbackCompany) {
            companyId = fallbackCompany.id;
          } else {
            throw companyError;
          }
        } else {
          companyId = company.id;
        }
      }
    }

    // In development, auto-verify email
    const isDevelopment = process.env.NODE_ENV !== 'production';
    
    // Create user
    const { data: user, error: userError } = await supabase
      .from('users')
      .insert({
        email: email.toLowerCase(),
        password_hash: passwordHash,
        full_name: fullName,
        company_id: companyId,
        email_verification_token: isDevelopment ? null : verificationToken,
        is_email_verified: isDevelopment, // Auto-verify in development
      })
      .select()
      .single();

    if (userError) throw userError;

    // Send verification email (skip in development)
    if (!isDevelopment) {
      await sendVerificationEmail(email, verificationToken);
    }

    // Log audit
    await this.logAudit(user.id, 'USER_REGISTERED', 'users', user.id);

    return {
      success: true,
      message: 'Registration successful. Please check your email to verify your account.',
      userId: user.id,
    };
  }

  /**
   * Login user
   */
  static async login(data: LoginData, ipAddress?: string, userAgent?: string) {
    const { email, password } = data;

    // Get user
    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', email.toLowerCase())
      .single();

    if (error || !user) {
      throw new Error('Invalid email or password');
    }

    // Check if account is locked
    if (user.account_locked_until && new Date(user.account_locked_until) > new Date()) {
      throw new Error('Account is temporarily locked due to multiple failed login attempts');
    }

    // Check if account is active
    if (!user.is_active) {
      throw new Error('Account is deactivated. Please contact support.');
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password_hash);

    if (!isPasswordValid) {
      // Increment failed attempts
      const failedAttempts = (user.failed_login_attempts || 0) + 1;
      const updateData: any = { failed_login_attempts: failedAttempts };

      // Lock account if max attempts reached
      if (failedAttempts >= MAX_LOGIN_ATTEMPTS) {
        const lockoutUntil = new Date();
        lockoutUntil.setMinutes(lockoutUntil.getMinutes() + LOCKOUT_DURATION_MINUTES);
        updateData.account_locked_until = lockoutUntil.toISOString();
      }

      await supabase
        .from('users')
        .update(updateData)
        .eq('id', user.id);

      throw new Error('Invalid email or password');
    }

    // Check email verification
    if (!user.is_email_verified) {
      throw new Error('Please verify your email before logging in');
    }

    // Check company subscription
    if (user.company_id) {
      const { data: company } = await supabase
        .from('companies')
        .select('subscription_valid_until, is_active')
        .eq('id', user.company_id)
        .single();

      if (!company?.is_active) {
        throw new Error('Company account is inactive');
      }

      if (company.subscription_valid_until && new Date(company.subscription_valid_until) < new Date()) {
        throw new Error('Company subscription has expired');
      }
    }

    // Reset failed attempts and update last login
    await supabase
      .from('users')
      .update({
        failed_login_attempts: 0,
        account_locked_until: null,
        last_login: new Date().toISOString(),
      })
      .eq('id', user.id);

    // Generate JWT token
    const token = jwt.sign(
      {
        userId: user.id,
        email: user.email,
        role: user.role,
        companyId: user.company_id,
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    // Create session
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await supabase
      .from('user_sessions')
      .insert({
        user_id: user.id,
        token,
        ip_address: ipAddress,
        user_agent: userAgent,
        expires_at: expiresAt.toISOString(),
      });

    // Log audit
    await this.logAudit(user.id, 'USER_LOGIN', 'users', user.id, { ip_address: ipAddress });

    return {
      success: true,
      token,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.full_name,
        role: user.role,
        companyId: user.company_id,
      },
    };
  }

  /**
   * Social login (Google/GitHub)
   * Verifies provider token when available, otherwise allows dev fallback with email.
   */
  static async socialLogin(payload: SocialLoginData) {
    const isDevelopment = process.env.NODE_ENV !== 'production';
    const { provider, token, email: fallbackEmail, fullName: fallbackName } = payload;

    if (!['google', 'github'].includes(provider)) {
      throw new Error('Unsupported provider');
    }

    let email = fallbackEmail?.toLowerCase();
    let fullName = fallbackName || '';

    // Verify provider token when provided
    if (token) {
      if (provider === 'google') {
        // Use Google tokeninfo to validate id_token
        const tokenInfoUrl = `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(token)}`;
        const resp = await fetch(tokenInfoUrl);
        if (!resp.ok) {
          throw new Error('Google token invalid or expired');
        }
        const data = await resp.json() as any;
        email = (data.email as string | undefined)?.toLowerCase() || email;
        fullName = data.name || fullName || '';
      } else if (provider === 'github') {
        // Use GitHub user API with access_token
        const resp = await fetch('https://api.github.com/user', {
          headers: { Authorization: `Bearer ${token}`, 'User-Agent': 'THEMIS-App' },
        });
        if (!resp.ok) {
          throw new Error('GitHub token invalid or expired');
        }
        const ghUser = await resp.json() as any;
        // GitHub emails endpoint may be needed for verified email; use fallback if missing
        email = (ghUser.email as string | undefined)?.toLowerCase() || email;
        fullName = ghUser.name || ghUser.login || fullName || '';
      }
    }

    if (!email) {
      if (isDevelopment) {
        throw new Error('Email required for social login in development');
      }
      throw new Error('Unable to resolve email from provider');
    }

    // Fetch or create user
    const { data: existingUser } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .single();

    let user = existingUser;

    if (!existingUser) {
      // Try to map company by domain
      const domain = email.split('@')[1];
      const { data: company } = await supabase
        .from('companies')
        .select('id')
        .eq('domain', domain)
        .single();

      const { data: created, error: createErr } = await supabase
        .from('users')
        .insert({
          email,
          full_name: fullName || email.split('@')[0],
          password_hash: null,
          company_id: company?.id || null,
          is_email_verified: true,
          email_verification_token: null,
          role: 'user',
        })
        .select()
        .single();

      if (createErr) throw createErr;
      user = created;
      await this.logAudit(user.id, 'USER_REGISTERED_SOCIAL', 'users', user.id, { provider });
    } else {
      // Ensure active
      if (!user.is_active) {
        throw new Error('Account is deactivated. Please contact support.');
      }
    }

    // Generate JWT token
    const tokenJwt = jwt.sign(
      {
        userId: user.id,
        email: user.email,
        role: user.role,
        companyId: user.company_id,
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    return {
      success: true,
      token: tokenJwt,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.full_name,
        role: user.role,
        companyId: user.company_id,
      },
      provider,
    };
  }

  /**
   * Verify email
   */
  static async verifyEmail(token: string) {
    const { data: user, error } = await supabase
      .from('users')
      .select('id, email')
      .eq('email_verification_token', token)
      .single();

    if (error || !user) {
      throw new Error('Invalid or expired verification token');
    }

    await supabase
      .from('users')
      .update({
        is_email_verified: true,
        email_verification_token: null,
      })
      .eq('id', user.id);

    await this.logAudit(user.id, 'EMAIL_VERIFIED', 'users', user.id);

    return { success: true, message: 'Email verified successfully' };
  }

  /**
   * Request password reset
   */
  static async requestPasswordReset(email: string) {
    const { data: user } = await supabase
      .from('users')
      .select('id, email')
      .eq('email', email.toLowerCase())
      .single();

    if (!user) {
      // Don't reveal if email exists
      return { success: true, message: 'If the email exists, a reset link has been sent' };
    }

    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetExpires = new Date();
    resetExpires.setHours(resetExpires.getHours() + 1);

    await supabase
      .from('users')
      .update({
        password_reset_token: resetToken,
        password_reset_expires: resetExpires.toISOString(),
      })
      .eq('id', user.id);

    await sendPasswordResetEmail(email, resetToken);

    return { success: true, message: 'If the email exists, a reset link has been sent' };
  }

  /**
   * Reset password
   */
  static async resetPassword(token: string, newPassword: string) {
    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('password_reset_token', token)
      .gt('password_reset_expires', new Date().toISOString())
      .single();

    if (!user) {
      throw new Error('Invalid or expired reset token');
    }

    if (!this.isStrongPassword(newPassword)) {
      throw new Error('Password must be at least 8 characters with uppercase, lowercase, number, and special character');
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);

    await supabase
      .from('users')
      .update({
        password_hash: passwordHash,
        password_reset_token: null,
        password_reset_expires: null,
      })
      .eq('id', user.id);

    await this.logAudit(user.id, 'PASSWORD_RESET', 'users', user.id);

    return { success: true, message: 'Password reset successfully' };
  }

  /**
   * Validate email format
   */
  private static isValidEmail(email: string): boolean {
    const emailRegex = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
    return emailRegex.test(email);
  }

  /**
   * Validate password strength
   */
  private static isStrongPassword(password: string): boolean {
    const minLength = 8;
    const hasUpperCase = /[A-Z]/.test(password);
    const hasLowerCase = /[a-z]/.test(password);
    const hasNumbers = /\d/.test(password);
    const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(password);

    return (
      password.length >= minLength &&
      hasUpperCase &&
      hasLowerCase &&
      hasNumbers &&
      hasSpecialChar
    );
  }

  /**
   * Log audit trail
   */
  private static async logAudit(
    userId: string,
    action: string,
    resourceType: string,
    resourceId: string,
    details?: any
  ) {
    await supabase.from('audit_logs').insert({
      user_id: userId,
      action,
      resource_type: resourceType,
      resource_id: resourceId,
      details,
    });
  }
}
