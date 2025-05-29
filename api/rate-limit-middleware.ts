import { RateLimiter, RATE_LIMIT_CONFIGS, EXPENSIVE_TOOLS, SCHEMA_TOOLS, RateLimitResult } from './rate-limiter.js';

export interface RateLimitError extends Error {
    code: 'RATE_LIMIT_EXCEEDED';
    details: {
        limit: number;
        windowMs: number;
        resetTime: number;
        remainingRequests: number;
    };
}

// Complexity-based rate limit configurations
export const COMPLEXITY_RATE_LIMITS = {
    low: {
        windowMs: 60000,
        maxRequests: 100,
        keyPrefix: 'complexity-low'
    },
    medium: {
        windowMs: 60000,
        maxRequests: 50,
        keyPrefix: 'complexity-medium'
    },
    high: {
        windowMs: 60000,
        maxRequests: 20,
        keyPrefix: 'complexity-high'
    },
    extreme: {
        windowMs: 60000,
        maxRequests: 5,
        keyPrefix: 'complexity-extreme'
    }
} as const;

export class RateLimitMiddleware {
    private rateLimiter: RateLimiter;
    private globalCounter = 0;

    constructor(redisUrl?: string) {
        this.rateLimiter = new RateLimiter(redisUrl);
    }

    /**
     * Extract client identifier from request
     * Falls back to a global counter if no unique identifier is available
     */
    private getClientIdentifier(request: any): string {
        try {
            // Safely handle request parsing to avoid keyValidator._parse errors
            const headers = (request && typeof request === 'object' && request.headers) ? request.headers : {};

            // Extract client ID with proper error handling
            const clientId = headers['x-client-id'] ||
                headers['user-agent'] ||
                headers['x-forwarded-for'] ||
                headers['x-real-ip'] ||
                (request && request.connection && request.connection.remoteAddress) ||
                `fallback-${++this.globalCounter}`;

            // Ensure client ID is a string and limit length for security
            return String(clientId).substring(0, 100);
        } catch (error) {
            console.warn('Error parsing client identifier, using fallback:', error);
            return `fallback-${++this.globalCounter}`;
        }
    }

    /**
     * Calculate complexity tier based on request data
     */
    private calculateComplexityTier(request: any): keyof typeof COMPLEXITY_RATE_LIMITS {
        try {
            // Extract complexity information from request if available
            let complexityScore = 0;

            if (request && typeof request === 'object') {
                // Look for complexity in various places the request might store it
                if (request.complexity && typeof request.complexity.complexityScore === 'number') {
                    complexityScore = request.complexity.complexityScore;
                } else if (request.body && typeof request.body === 'string') {
                    // Try to parse body if it's a string
                    try {
                        const parsed = JSON.parse(request.body);
                        if (parsed.complexity && typeof parsed.complexity.complexityScore === 'number') {
                            complexityScore = parsed.complexity.complexityScore;
                        }
                    } catch {
                        // Ignore parsing errors
                    }
                } else if (request.body && typeof request.body === 'object' && request.body.complexity) {
                    complexityScore = request.body.complexity.complexityScore || 0;
                }
            }

            // Classify complexity
            if (complexityScore >= 800) return 'extreme';
            if (complexityScore >= 400) return 'high';
            if (complexityScore >= 100) return 'medium';
            return 'low';
        } catch (error) {
            console.warn('Error calculating complexity tier, using low:', error);
            return 'low';
        }
    }

    /**
     * Create rate limit error
     */
    private createRateLimitError(
        message: string,
        config: any,
        result: RateLimitResult
    ): RateLimitError {
        const error = new Error(message) as RateLimitError;
        error.code = 'RATE_LIMIT_EXCEEDED';
        error.details = {
            limit: config.maxRequests,
            windowMs: config.windowMs,
            resetTime: result.resetTime,
            remainingRequests: result.remainingRequests
        };
        return error;
    }

    /**
     * Check rate limits for a tool call
     */
    async checkRateLimit(toolName: string, request: any): Promise<void> {
        const clientId = this.getClientIdentifier(request);
        const complexityTier = this.calculateComplexityTier(request);
        const checks: Promise<void>[] = [];

        // Global rate limit check
        checks.push(this.checkGlobalLimit());

        // Per-client rate limit check
        checks.push(this.checkClientLimit(clientId));

        // Complexity-based rate limit check
        checks.push(this.checkComplexityLimit(clientId, complexityTier));

        // Tool-specific rate limit checks
        if (SCHEMA_TOOLS.has(toolName)) {
            checks.push(this.checkSchemaLimit(clientId));
        } else if (EXPENSIVE_TOOLS.has(toolName)) {
            checks.push(this.checkExpensiveLimit(clientId));
        }

        // Execute all checks in parallel
        await Promise.all(checks);
    }

    private async checkGlobalLimit(): Promise<void> {
        const result = await this.rateLimiter.checkLimit('global', RATE_LIMIT_CONFIGS.global);

        if (!result.allowed) {
            throw this.createRateLimitError(
                'Global rate limit exceeded. Too many requests across all clients.',
                RATE_LIMIT_CONFIGS.global,
                result
            );
        }
    }

    private async checkClientLimit(clientId: string): Promise<void> {
        const result = await this.rateLimiter.checkLimit(
            clientId,
            RATE_LIMIT_CONFIGS.perClient
        );

        if (!result.allowed) {
            throw this.createRateLimitError(
                'Client rate limit exceeded. Please slow down your requests.',
                RATE_LIMIT_CONFIGS.perClient,
                result
            );
        }
    }

    private async checkComplexityLimit(clientId: string, tier: keyof typeof COMPLEXITY_RATE_LIMITS): Promise<void> {
        const config = COMPLEXITY_RATE_LIMITS[tier];
        const result = await this.rateLimiter.checkLimit(
            `${clientId}:${config.keyPrefix}`,
            config
        );

        if (!result.allowed) {
            throw this.createRateLimitError(
                `Rate limit exceeded for ${tier} complexity operations. Complex queries consume more resources.`,
                config,
                result
            );
        }
    }

    private async checkExpensiveLimit(clientId: string): Promise<void> {
        const result = await this.rateLimiter.checkLimit(
            `${clientId}:expensive`,
            RATE_LIMIT_CONFIGS.expensive
        );

        if (!result.allowed) {
            throw this.createRateLimitError(
                'Rate limit exceeded for expensive operations. These operations consume more resources.',
                RATE_LIMIT_CONFIGS.expensive,
                result
            );
        }
    }

    private async checkSchemaLimit(clientId: string): Promise<void> {
        const result = await this.rateLimiter.checkLimit(
            `${clientId}:schema`,
            RATE_LIMIT_CONFIGS.schema
        );

        if (!result.allowed) {
            throw this.createRateLimitError(
                'Rate limit exceeded for schema operations. Schema introspection is heavily rate limited.',
                RATE_LIMIT_CONFIGS.schema,
                result
            );
        }
    }

    /**
     * Wrap a tool handler with rate limiting
     */
    wrapToolHandler(toolName: string, originalHandler: Function) {
        return async (...args: any[]) => {
            try {
                // Extract request context with proper error handling
                const request = args[args.length - 1]; // Assume request is last argument

                // Check rate limits
                await this.checkRateLimit(toolName, request);

                // Call original handler if rate limits pass
                return await originalHandler(...args);
            } catch (error) {
                // Enhanced error handling for debugging keyValidator._parse issues
                if (error && typeof error === 'object') {
                    // Check for Zod validation errors
                    if ('code' in error && error.code === 'invalid_type') {
                        console.error(`Zod validation error in tool ${toolName}:`, {
                            error: error,
                            args: args,
                            toolName: toolName
                        });
                        const errorMessage = (error as any).message || 'Invalid input type';
                        throw new Error(`Parameter validation failed for tool ${toolName}: ${errorMessage}`);
                    }

                    // Check for keyValidator._parse errors
                    if ((error as any).message && (error as any).message.includes('keyValidator._parse')) {
                        console.error(`keyValidator._parse error in tool ${toolName}:`, {
                            error: error,
                            message: (error as any).message,
                            stack: (error as any).stack,
                            args: args,
                            toolName: toolName
                        });
                        throw new Error(`Schema validation failed for tool ${toolName}. Please check parameter types and format.`);
                    }

                    // Check for rate limit errors
                    if ('code' in error && error.code === 'RATE_LIMIT_EXCEEDED') {
                        // Re-throw rate limit errors with additional context
                        const rateLimitError = error as RateLimitError;
                        console.warn(`Rate limit exceeded for tool ${toolName}:`, rateLimitError.details);
                        throw rateLimitError;
                    }
                }

                // Enhanced logging for any other errors to help debug keyValidator issues
                console.error(`Unexpected error in tool ${toolName}:`, {
                    error: error,
                    message: error instanceof Error ? error.message : String(error),
                    stack: error instanceof Error ? error.stack : undefined,
                    args: args,
                    toolName: toolName
                });

                // Re-throw other errors unchanged
                throw error;
            }
        };
    }

    /**
     * Get current rate limit status for a client
     */
    async getRateLimitStatus(request: any) {
        const clientId = this.getClientIdentifier(request);
        const complexityTier = this.calculateComplexityTier(request);

        const [global, client, expensive, schema, complexity] = await Promise.all([
            this.rateLimiter.checkLimit('global', { ...RATE_LIMIT_CONFIGS.global, maxRequests: RATE_LIMIT_CONFIGS.global.maxRequests + 1 }),
            this.rateLimiter.checkLimit(clientId, { ...RATE_LIMIT_CONFIGS.perClient, maxRequests: RATE_LIMIT_CONFIGS.perClient.maxRequests + 1 }),
            this.rateLimiter.checkLimit(`${clientId}:expensive`, { ...RATE_LIMIT_CONFIGS.expensive, maxRequests: RATE_LIMIT_CONFIGS.expensive.maxRequests + 1 }),
            this.rateLimiter.checkLimit(`${clientId}:schema`, { ...RATE_LIMIT_CONFIGS.schema, maxRequests: RATE_LIMIT_CONFIGS.schema.maxRequests + 1 }),
            this.rateLimiter.checkLimit(`${clientId}:${COMPLEXITY_RATE_LIMITS[complexityTier].keyPrefix}`, { ...COMPLEXITY_RATE_LIMITS[complexityTier], maxRequests: COMPLEXITY_RATE_LIMITS[complexityTier].maxRequests + 1 })
        ]);

        return {
            clientId,
            complexityTier,
            limits: {
                global: {
                    remaining: Math.max(0, global.remainingRequests - 1),
                    limit: RATE_LIMIT_CONFIGS.global.maxRequests,
                    resetTime: global.resetTime
                },
                client: {
                    remaining: Math.max(0, client.remainingRequests - 1),
                    limit: RATE_LIMIT_CONFIGS.perClient.maxRequests,
                    resetTime: client.resetTime
                },
                expensive: {
                    remaining: Math.max(0, expensive.remainingRequests - 1),
                    limit: RATE_LIMIT_CONFIGS.expensive.maxRequests,
                    resetTime: expensive.resetTime
                },
                schema: {
                    remaining: Math.max(0, schema.remainingRequests - 1),
                    limit: RATE_LIMIT_CONFIGS.schema.maxRequests,
                    resetTime: schema.resetTime
                },
                complexity: {
                    tier: complexityTier,
                    remaining: Math.max(0, complexity.remainingRequests - 1),
                    limit: COMPLEXITY_RATE_LIMITS[complexityTier].maxRequests,
                    resetTime: complexity.resetTime
                }
            }
        };
    }

    async disconnect() {
        await this.rateLimiter.disconnect();
    }
} 