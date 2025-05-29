import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { RateLimiter, RateLimitConfig } from '../api/rate-limiter.js';
import { RateLimitMiddleware } from '../api/rate-limit-middleware.js';

describe('RateLimiter', () => {
    let rateLimiter: RateLimiter;

    beforeEach(() => {
        rateLimiter = new RateLimiter(); // Use memory store for tests
    });

    afterEach(async () => {
        await rateLimiter.disconnect();
    });

    it('should allow requests within limit', async () => {
        const config: RateLimitConfig = {
            windowMs: 60000,
            maxRequests: 5,
            keyPrefix: 'test'
        };

        const result = await rateLimiter.checkLimit('client1', config);

        expect(result.allowed).toBe(true);
        expect(result.remainingRequests).toBe(4);
        expect(result.totalRequests).toBe(1);
    });

    it('should deny requests when limit exceeded', async () => {
        const config: RateLimitConfig = {
            windowMs: 60000,
            maxRequests: 2,
            keyPrefix: 'test'
        };

        // First request - allowed
        let result = await rateLimiter.checkLimit('client1', config);
        expect(result.allowed).toBe(true);
        expect(result.remainingRequests).toBe(1);

        // Second request - allowed
        result = await rateLimiter.checkLimit('client1', config);
        expect(result.allowed).toBe(true);
        expect(result.remainingRequests).toBe(0);

        // Third request - denied
        result = await rateLimiter.checkLimit('client1', config);
        expect(result.allowed).toBe(false);
        expect(result.remainingRequests).toBe(0);
    });

    it('should isolate different clients', async () => {
        const config: RateLimitConfig = {
            windowMs: 60000,
            maxRequests: 1,
            keyPrefix: 'test'
        };

        // Client 1 hits limit
        let result = await rateLimiter.checkLimit('client1', config);
        expect(result.allowed).toBe(true);

        result = await rateLimiter.checkLimit('client1', config);
        expect(result.allowed).toBe(false);

        // Client 2 should still be allowed
        result = await rateLimiter.checkLimit('client2', config);
        expect(result.allowed).toBe(true);
    });

    it('should reset after window expires', async () => {
        const config: RateLimitConfig = {
            windowMs: 100, // Very short window for testing
            maxRequests: 1,
            keyPrefix: 'test'
        };

        // Hit limit
        let result = await rateLimiter.checkLimit('client1', config);
        expect(result.allowed).toBe(true);

        result = await rateLimiter.checkLimit('client1', config);
        expect(result.allowed).toBe(false);

        // Wait for window to expire
        await new Promise(resolve => setTimeout(resolve, 150));

        // Should be allowed again
        result = await rateLimiter.checkLimit('client1', config);
        expect(result.allowed).toBe(true);
    });
});

describe('RateLimitMiddleware', () => {
    let middleware: RateLimitMiddleware;

    beforeEach(() => {
        middleware = new RateLimitMiddleware(); // Use memory store for tests
    });

    afterEach(async () => {
        await middleware.disconnect();
    });

    it('should wrap tool handlers with rate limiting', async () => {
        let handlerCalled = false;
        const mockHandler = async () => {
            handlerCalled = true;
            return { success: true };
        };

        const wrappedHandler = middleware.wrapToolHandler('test-tool', mockHandler);

        // Mock request object
        const mockRequest = { headers: { 'x-client-id': 'test-client' } };

        const result = await wrappedHandler({}, mockRequest);

        expect(handlerCalled).toBe(true);
        expect(result).toEqual({ success: true });
    });

    it('should throw rate limit error when limit exceeded', async () => {
        const mockHandler = async () => ({ success: true });
        const wrappedHandler = middleware.wrapToolHandler('introspect-schema', mockHandler);

        const mockRequest = { headers: { 'x-client-id': 'test-client' } };

        // Make multiple requests to hit schema limit (5 per 5 minutes)
        for (let i = 0; i < 5; i++) {
            await wrappedHandler({}, mockRequest);
        }

        // Next request should be rate limited
        await expect(wrappedHandler({}, mockRequest)).rejects.toThrow('Rate limit exceeded');
    });

    it('should provide rate limit status', async () => {
        const mockRequest = { headers: { 'x-client-id': 'test-client' } };

        const status = await middleware.getRateLimitStatus(mockRequest);

        expect(status).toHaveProperty('clientId');
        expect(status).toHaveProperty('limits');
        expect(status.limits).toHaveProperty('global');
        expect(status.limits).toHaveProperty('client');
        expect(status.limits).toHaveProperty('expensive');
        expect(status.limits).toHaveProperty('schema');

        expect(status.limits.global).toHaveProperty('remaining');
        expect(status.limits.global).toHaveProperty('limit');
        expect(status.limits.global).toHaveProperty('resetTime');
    });
}); 