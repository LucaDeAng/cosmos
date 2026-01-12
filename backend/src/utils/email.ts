// Email Utility
// Handles sending verification and password reset emails

interface EmailConfig {
  from: string;
  service?: string;
  host?: string;
  port?: number;
  auth?: {
    user: string;
    pass: string;
  };
}

// Configure your email service here
const emailConfig: EmailConfig = {
  from: process.env.EMAIL_FROM || 'noreply@yourapp.com',
  // Add your email service configuration (SMTP, SendGrid, etc.)
};

/**
 * Send email verification
 */
export async function sendVerificationEmail(email: string, token: string): Promise<void> {
  const verificationUrl = `${process.env.APP_URL || 'http://localhost:3000'}/verify-email?token=${token}`;

  // TODO: Implement actual email sending
  // For now, just log to console
  console.log(`
    ========================================
    EMAIL VERIFICATION
    ========================================
    To: ${email}
    Subject: Verify your email address
    
    Click the link below to verify your email:
    ${verificationUrl}
    
    This link will expire in 24 hours.
    ========================================
  `);

  // Example with nodemailer:
  /*
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: emailConfig.auth.user,
      pass: emailConfig.auth.pass
    }
  });

  await transporter.sendMail({
    from: emailConfig.from,
    to: email,
    subject: 'Verify your email address',
    html: `
      <h1>Email Verification</h1>
      <p>Click the link below to verify your email:</p>
      <a href="${verificationUrl}">${verificationUrl}</a>
      <p>This link will expire in 24 hours.</p>
    `
  });
  */
}

/**
 * Send password reset email
 */
export async function sendPasswordResetEmail(email: string, token: string): Promise<void> {
  const resetUrl = `${process.env.APP_URL || 'http://localhost:3000'}/reset-password?token=${token}`;

  // TODO: Implement actual email sending
  console.log(`
    ========================================
    PASSWORD RESET
    ========================================
    To: ${email}
    Subject: Reset your password
    
    Click the link below to reset your password:
    ${resetUrl}
    
    This link will expire in 1 hour.
    ========================================
  `);

  // Example implementation same as above
}

/**
 * Send account lockout notification
 */
export async function sendAccountLockoutEmail(email: string, unlockTime: Date): Promise<void> {
  console.log(`
    ========================================
    ACCOUNT LOCKED
    ========================================
    To: ${email}
    Subject: Account Security Alert
    
    Your account has been temporarily locked due to multiple failed login attempts.
    It will be automatically unlocked at: ${unlockTime.toLocaleString()}
    
    If this wasn't you, please contact support immediately.
    ========================================
  `);
}
