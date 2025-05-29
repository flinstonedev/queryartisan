import Redis from 'redis';

export interface RateLimitConfig {
    windowMs: number;      // Time window in milliseconds
    maxRequests: number;   // Maximum requests per window
    keyPrefix?: string;    // Key prefix for Redis storage
}

export interface RateLimitResult {
    allowed: boolean;
    remainingRequests: number;
    resetTime: number;
    totalRequests: number;
}

export class RateLimiter {
    private redis: Redis.RedisClientType | null = null;
    private memoryStore: Map<string, { count: number; resetTime: number }> = new Map();
    private cleanupInterval: NodeJS.Timeout | null = null;

    constructor(redisUrl?: string) {
        if (redisUrl) {
            this.initRedis(redisUrl);
        }

        // Clean up expired memory store entries every minute
        this.cleanupInterval = setInterval(() => {
            this.cleanupMemoryStore();
        }, 60000);
    }

    private async initRedis(redisUrl: string) {
        try {
            this.redis = Redis.createClient({ url: redisUrl });

            this.redis.on('error', (err: Error) => {
                console.warn('Redis connection error, falling back to memory store:', err.message);
                this.redis = null;
            });

            this.redis.on('connect', () => {
                console.log('Redis connected for rate limiting');
            });

            await this.redis.connect();
        } catch (error) {
            console.warn('Failed to connect to Redis, using memory store:', error);
            this.redis = null;
        }
    }

    private cleanupMemoryStore() {
        const now = Date.now();
        for (const [key, data] of this.memoryStore.entries()) {
            if (now > data.resetTime) {
                this.memoryStore.delete(key);
            }
        }
    }

    async checkLimit(
        identifier: string,
        config: RateLimitConfig
    ): Promise<RateLimitResult> {
        const key = `${config.keyPrefix || 'rl'}:${identifier}`;
        const now = Date.now();
        const windowStart = now - config.windowMs;
        const resetTime = now + config.windowMs;

        if (this.redis) {
            return this.checkLimitRedis(key, config, now, windowStart, resetTime);
        } else {
            return this.checkLimitMemory(key, config, now, resetTime);
        }
    }

    private async checkLimitRedis(
        key: string,
        config: RateLimitConfig,
        now: number,
        windowStart: number,
        resetTime: number
    ): Promise<RateLimitResult> {
        try {
            // Use Redis sorted set to track requests within the sliding window
            const multi = this.redis!.multi();

            // Remove expired entries
            multi.zRemRangeByScore(key, '-inf', windowStart);

            // Count current requests in window
            multi.zCard(key);

            // Add current request
            multi.zAdd(key, { score: now, value: `${now}-${Math.random()}` });

            // Set expiration
            multi.expire(key, Math.ceil(config.windowMs / 1000));

            const results = await multi.exec();
            const currentCount = typeof results?.[1] === 'number' ? results[1] : 0;

            const allowed = currentCount < config.maxRequests;
            const remainingRequests = Math.max(0, config.maxRequests - currentCount - 1);

            return {
                allowed,
                remainingRequests,
                resetTime,
                totalRequests: currentCount + 1
            };
        } catch (error) {
            console.warn('Redis rate limit check failed, falling back to memory:', error);
            return this.checkLimitMemory(key, config, now, resetTime);
        }
    }

    private checkLimitMemory(
        key: string,
        config: RateLimitConfig,
        now: number,
        resetTime: number
    ): RateLimitResult {
        const existing = this.memoryStore.get(key);

        if (!existing || now > existing.resetTime) {
            // New window or expired window
            this.memoryStore.set(key, { count: 1, resetTime });
            return {
                allowed: true,
                remainingRequests: config.maxRequests - 1,
                resetTime,
                totalRequests: 1
            };
        }

        const newCount = existing.count + 1;
        this.memoryStore.set(key, { count: newCount, resetTime: existing.resetTime });

        const allowed = newCount <= config.maxRequests;
        const remainingRequests = Math.max(0, config.maxRequests - newCount);

        return {
            allowed,
            remainingRequests,
            resetTime: existing.resetTime,
            totalRequests: newCount
        };
    }

    async disconnect() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
        }

        if (this.redis) {
            await this.redis.disconnect();
        }
    }
}

// Default rate limit configurations (can be overridden by environment variables)
export const RATE_LIMIT_CONFIGS = {
    global: {
        windowMs: parseInt(process.env.RATE_LIMIT_GLOBAL_WINDOW_MS || '60000'),
        maxRequests: parseInt(process.env.RATE_LIMIT_GLOBAL_MAX_REQUESTS || '2000'),
        keyPrefix: 'global'
    },
    perClient: {
        windowMs: parseInt(process.env.RATE_LIMIT_CLIENT_WINDOW_MS || '60000'),
        maxRequests: parseInt(process.env.RATE_LIMIT_CLIENT_MAX_REQUESTS || '50'),
        keyPrefix: 'client'
    },
    expensive: {
        windowMs: parseInt(process.env.RATE_LIMIT_EXPENSIVE_WINDOW_MS || '60000'),
        maxRequests: parseInt(process.env.RATE_LIMIT_EXPENSIVE_MAX_REQUESTS || '10'),
        keyPrefix: 'expensive'
    },
    schema: {
        windowMs: parseInt(process.env.RATE_LIMIT_SCHEMA_WINDOW_MS || '300000'),
        maxRequests: parseInt(process.env.RATE_LIMIT_SCHEMA_MAX_REQUESTS || '5'),
        keyPrefix: 'schema'
    }
} as const;

// Tools that should have stricter rate limits
export const EXPENSIVE_TOOLS = new Set([
    'introspect-schema',
    'execute-query',
    'get-type-info',
    'validate-query'
]);

// Schema-related tools that should have very strict limits
export const SCHEMA_TOOLS = new Set([
    'introspect-schema'
]); 