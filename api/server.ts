import { config } from 'dotenv';
import { createMcpHandler } from "@vercel/mcp-adapter";
import { RateLimitMiddleware } from './rate-limit-middleware.js';
import { getAllTools } from '../tools/index.js';

// Load environment variables from .env file
config({ path: '.env' });

// Initialize rate limiting middleware
const rateLimitMiddleware = new RateLimitMiddleware(process.env.REDIS_URL);

const allTools = getAllTools();

const handler = createMcpHandler((server: any) => {
    for (const tool of allTools) {
        try {
            // Validate tool schema before registration
            if (!tool.schema || typeof tool.schema !== 'object') {
                console.warn(`Tool ${tool.name} has invalid schema:`, tool.schema);
                continue;
            }

            // Wrap each tool handler with rate limiting
            const rateLimitedHandler = rateLimitMiddleware.wrapToolHandler(
                tool.name,
                tool.handler
            );

            // Use the correct @vercel/mcp-adapter API format: 
            // server.tool(name, description, schema, handler)
            server.tool(
                tool.name,
                (tool as any).description || `${tool.name} tool`,
                tool.schema,
                rateLimitedHandler
            );
            console.log(`Registered tool: ${tool.name}`);
        } catch (error) {
            console.error(`Failed to register tool ${tool.name}:`, error);
            // Continue with other tools even if one fails
        }
    }

    // Add a special tool to check rate limit status  
    server.tool(
        'get-rate-limit-status',
        'Get current rate limit status for the client',
        {
            // No required parameters - all data comes from request context
        },
        async (...args: any[]) => {
            const request = args[args.length - 1];
            const status = await rateLimitMiddleware.getRateLimitStatus(request);
            return {
                content: [{
                    type: 'text',
                    text: JSON.stringify(status, null, 2)
                }]
            };
        }
    );
});

// Graceful shutdown handling
process.on('SIGTERM', async () => {
    console.log('Shutting down gracefully...');
    await rateLimitMiddleware.disconnect();
    process.exit(0);
});

process.on('SIGINT', async () => {
    console.log('Shutting down gracefully...');
    await rateLimitMiddleware.disconnect();
    process.exit(0);
});

export { handler as GET, handler as POST, handler as DELETE }; 