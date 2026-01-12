// Authentication Middleware
// Protects routes and validates JWT tokens

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { supabase } from '../config/supabase';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

export interface AuthRequest extends Request {
  user?: {
    userId: string;
    email: string;
    role: string;
    companyId?: string;
  };
}

/**
 * Verify JWT token and authenticate user
 */
export async function authenticate(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.substring(7);

    // Verify JWT
    const decoded = jwt.verify(token, JWT_SECRET) as any;

    // Check if session exists and is valid
    const { data: session, error } = await supabase
      .from('user_sessions')
      .select('*')
      .eq('token', token)
      .gt('expires_at', new Date().toISOString())
      .single();

    if (error || !session) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    // Check if user is still active
    const { data: user } = await supabase
      .from('users')
      .select('id, is_active')
      .eq('id', decoded.userId)
      .single();

    if (!user || !user.is_active) {
      return res.status(401).json({ error: 'User account is inactive' });
    }

    // Attach user info to request
    req.user = {
      userId: decoded.userId,
      email: decoded.email,
      role: decoded.role,
      companyId: decoded.companyId,
    };

    next();
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      return res.status(401).json({ error: 'Invalid token' });
    }
    return res.status(500).json({ error: 'Authentication failed' });
  }
}

/**
 * Check if user has required role
 */
export function authorize(...allowedRoles: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    next();
  };
}

/**
 * Check if user belongs to the same company
 */
export function checkCompanyAccess(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  if (!req.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const companyId = req.params.companyId || req.body.companyId;

  if (req.user.role === 'super_admin') {
    return next();
  }

  if (req.user.companyId !== companyId) {
    return res.status(403).json({ error: 'Access denied to this company' });
  }

  next();
}

/**
 * Rate limiting middleware
 */
const requestCounts = new Map<string, { count: number; resetTime: number }>();

export function rateLimit(maxRequests: number = 100, windowMs: number = 60000) {
  return (req: Request, res: Response, next: NextFunction) => {
    const identifier = req.ip || 'unknown';
    const now = Date.now();
    const data = requestCounts.get(identifier);

    if (!data || now > data.resetTime) {
      requestCounts.set(identifier, {
        count: 1,
        resetTime: now + windowMs,
      });
      return next();
    }

    if (data.count >= maxRequests) {
      return res.status(429).json({
        error: 'Too many requests',
        retryAfter: Math.ceil((data.resetTime - now) / 1000),
      });
    }

    data.count++;
    next();
  };
}
