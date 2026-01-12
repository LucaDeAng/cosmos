/**
 * Rate Limiter
 *
 * Sliding window rate limiter for external API calls.
 * Tracks request counts per source with configurable windows.
 * Uses Supabase for persistent tracking across restarts.
 */

import { supabase } from '../../config/supabase';
import type { KnowledgeSourceType, RateLimitConfig, RateLimitStatus } from '../types';

// In-memory cache for rate limit checks (to reduce DB calls)
interface RateLimitCache {
  count: number;
  windowStart: Date;
  maxRequests: number;
  lastChecked: Date;
}

const CACHE_TTL_MS = 10000; // 10 seconds cache for rate limit checks

export class RateLimiter {
  private cache: Map<string, RateLimitCache> = new Map();

  /**
   * Check if a request is allowed under rate limits
   */
  async checkLimit(
    source: KnowledgeSourceType,
    config: RateLimitConfig,
    tenantId?: string
  ): Promise<RateLimitStatus> {
    const cacheKey = this.buildCacheKey(source, config, tenantId);
    const windowStart = this.getWindowStart(config.windowSeconds);

    // Check memory cache first
    const cached = this.cache.get(cacheKey);
    if (cached && this.isCacheValid(cached, windowStart)) {
      const allowed = cached.count < cached.maxRequests;
      return {
        allowed,
        remaining: Math.max(0, cached.maxRequests - cached.count),
        resetAt: new Date(cached.windowStart.getTime() + config.windowSeconds * 1000),
        source,
      };
    }

    // Check/update database
    try {
      const result = await this.checkAndIncrementDB(
        source,
        config,
        tenantId,
        windowStart
      );

      // Update cache
      this.cache.set(cacheKey, {
        count: result.count,
        windowStart,
        maxRequests: config.maxRequests,
        lastChecked: new Date(),
      });

      return {
        allowed: result.allowed,
        remaining: result.remaining,
        resetAt: new Date(windowStart.getTime() + config.windowSeconds * 1000),
        source,
      };
    } catch (error) {
      console.warn('Rate limit check failed:', error);
      // On error, be permissive but log it
      return {
        allowed: true,
        remaining: config.maxRequests,
        resetAt: new Date(windowStart.getTime() + config.windowSeconds * 1000),
        source,
      };
    }
  }

  /**
   * Record a request (increment counter)
   */
  async recordRequest(
    source: KnowledgeSourceType,
    config: RateLimitConfig,
    tenantId?: string
  ): Promise<void> {
    const cacheKey = this.buildCacheKey(source, config, tenantId);
    const windowStart = this.getWindowStart(config.windowSeconds);

    // Update memory cache
    const cached = this.cache.get(cacheKey);
    if (cached && this.isCacheValid(cached, windowStart)) {
      cached.count++;
      cached.lastChecked = new Date();
    }

    // Update database - get current count and increment
    try {
      const effectiveTenantId = config.scope === 'per_tenant' ? tenantId : null;

      // First try to get existing record
      const { data: existing } = await supabase
        .from('api_rate_limits')
        .select('request_count')
        .eq('source_name', source)
        .eq('tenant_id', effectiveTenantId)
        .eq('window_start', windowStart.toISOString())
        .maybeSingle();

      const newCount = (existing?.request_count || 0) + 1;

      // Upsert with the new count
      await supabase.from('api_rate_limits').upsert(
        {
          source_name: source,
          tenant_id: effectiveTenantId,
          window_start: windowStart.toISOString(),
          window_duration_seconds: config.windowSeconds,
          request_count: newCount,
          max_requests: config.maxRequests,
          last_request_at: new Date().toISOString(),
        },
        { onConflict: 'source_name,tenant_id,window_start' }
      );
    } catch (error) {
      console.warn('Rate limit record failed:', error);
    }
  }

  /**
   * Get current rate limit status without incrementing
   */
  async getStatus(
    source: KnowledgeSourceType,
    config: RateLimitConfig,
    tenantId?: string
  ): Promise<RateLimitStatus> {
    const windowStart = this.getWindowStart(config.windowSeconds);
    const effectiveTenantId = config.scope === 'per_tenant' ? tenantId : null;

    try {
      const { data } = await supabase
        .from('api_rate_limits')
        .select('request_count')
        .eq('source_name', source)
        .eq('tenant_id', effectiveTenantId)
        .eq('window_start', windowStart.toISOString())
        .maybeSingle();

      const count = data?.request_count || 0;

      return {
        allowed: count < config.maxRequests,
        remaining: Math.max(0, config.maxRequests - count),
        resetAt: new Date(windowStart.getTime() + config.windowSeconds * 1000),
        source,
      };
    } catch (error) {
      console.warn('Rate limit status check failed:', error);
      return {
        allowed: true,
        remaining: config.maxRequests,
        resetAt: new Date(windowStart.getTime() + config.windowSeconds * 1000),
        source,
      };
    }
  }

  /**
   * Reset rate limit for a source
   */
  async reset(
    source: KnowledgeSourceType,
    tenantId?: string
  ): Promise<void> {
    // Clear memory cache
    for (const key of this.cache.keys()) {
      if (key.startsWith(`${source}:`)) {
        this.cache.delete(key);
      }
    }

    // Clear database entries
    try {
      let query = supabase
        .from('api_rate_limits')
        .delete()
        .eq('source_name', source);

      if (tenantId) {
        query = query.eq('tenant_id', tenantId);
      }

      await query;
    } catch (error) {
      console.warn('Rate limit reset failed:', error);
    }
  }

  /**
   * Get statistics for all rate limits
   */
  async getAllStats(): Promise<
    Array<{
      source: KnowledgeSourceType;
      tenantId: string | null;
      count: number;
      maxRequests: number;
      windowStart: Date;
      remaining: number;
    }>
  > {
    try {
      const now = new Date();
      const { data } = await supabase
        .from('api_rate_limits')
        .select('*')
        .gt('window_start', new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString())
        .order('window_start', { ascending: false });

      if (!data) return [];

      return data.map(row => ({
        source: row.source_name as KnowledgeSourceType,
        tenantId: row.tenant_id,
        count: row.request_count,
        maxRequests: row.max_requests,
        windowStart: new Date(row.window_start),
        remaining: Math.max(0, row.max_requests - row.request_count),
      }));
    } catch (error) {
      console.warn('Rate limit stats fetch failed:', error);
      return [];
    }
  }

  /**
   * Check and increment in database
   */
  private async checkAndIncrementDB(
    source: KnowledgeSourceType,
    config: RateLimitConfig,
    tenantId: string | undefined,
    windowStart: Date
  ): Promise<{ allowed: boolean; count: number; remaining: number }> {
    const effectiveTenantId = config.scope === 'per_tenant' ? tenantId : null;

    // Try to get existing record
    const { data: existing } = await supabase
      .from('api_rate_limits')
      .select('request_count')
      .eq('source_name', source)
      .eq('tenant_id', effectiveTenantId)
      .eq('window_start', windowStart.toISOString())
      .maybeSingle();

    const currentCount = existing?.request_count || 0;

    return {
      allowed: currentCount < config.maxRequests,
      count: currentCount,
      remaining: Math.max(0, config.maxRequests - currentCount),
    };
  }

  /**
   * Get the start of the current time window
   */
  private getWindowStart(windowSeconds: number): Date {
    const now = Date.now();
    const windowMs = windowSeconds * 1000;
    const windowStart = Math.floor(now / windowMs) * windowMs;
    return new Date(windowStart);
  }

  /**
   * Build cache key
   */
  private buildCacheKey(
    source: KnowledgeSourceType,
    config: RateLimitConfig,
    tenantId?: string
  ): string {
    const windowStart = this.getWindowStart(config.windowSeconds);
    const tenant = config.scope === 'per_tenant' ? tenantId || 'global' : 'global';
    return `${source}:${tenant}:${windowStart.getTime()}`;
  }

  /**
   * Check if cache is still valid for current window
   */
  private isCacheValid(cache: RateLimitCache, currentWindowStart: Date): boolean {
    const now = new Date();
    const cacheAge = now.getTime() - cache.lastChecked.getTime();

    return (
      cache.windowStart.getTime() === currentWindowStart.getTime() &&
      cacheAge < CACHE_TTL_MS
    );
  }
}

// Singleton instance
let limiterInstance: RateLimiter | null = null;

export function getRateLimiter(): RateLimiter {
  if (!limiterInstance) {
    limiterInstance = new RateLimiter();
  }
  return limiterInstance;
}

export default RateLimiter;
