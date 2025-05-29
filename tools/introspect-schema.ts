import { z } from "zod";
import { GraphQLSchema, printSchema } from 'graphql';
import { resolveEndpointAndHeaders, fetchAndCacheSchema, rawSchemaJsonCache } from "./shared-utils.js";

// Core business logic - testable function
export async function introspectGraphQLSchema(): Promise<{
    schemaSdl?: string;
    fullSchemaJson?: any;
    error?: string;
    schemaDetails?: any;
}> {
    const { url: resolvedUrl, headers } = resolveEndpointAndHeaders();

    if (!resolvedUrl) {
        return {
            error: "No default GraphQL endpoint configured in environment variables (DEFAULT_GRAPHQL_ENDPOINT)"
        };
    }

    try {
        const schema = await fetchAndCacheSchema(headers);
        const rawJson = rawSchemaJsonCache.get(resolvedUrl) || {};
        const schemaSdl = printSchema(schema);

        // Define a size limit (e.g., 800KB) for the response payload
        const MAX_SCHEMA_SIZE_BYTES = 800 * 1024;
        const rawJsonString = JSON.stringify(rawJson);
        const estimatedSizeBytes = schemaSdl.length + rawJsonString.length;

        if (estimatedSizeBytes > MAX_SCHEMA_SIZE_BYTES) {
            return {
                error: `Schema is too large to return directly (estimated ${Math.round(estimatedSizeBytes / 1024)}KB). Please use get-root-operation-types and get-type-info for schema exploration.`,
                schemaDetails: {
                    character_count_sdl: schemaSdl.length,
                    character_count_json_string: rawJsonString.length,
                    estimated_total_kb: Math.round(estimatedSizeBytes / 1024),
                    limit_kb: MAX_SCHEMA_SIZE_BYTES / 1024
                }
            };
        }

        return {
            schemaSdl: schemaSdl,
            fullSchemaJson: rawJson
        };
    } catch (error) {
        return {
            error: error instanceof Error ? `Failed to introspect schema: ${error.message}` : String(error)
        };
    }
}

export const introspectSchemaTool = {
    name: "introspect-schema",
    description: "Retrieve the complete GraphQL schema definition for API understanding and exploration",
    schema: {
        format: z.enum(['sdl', 'json', 'both']).default('both').describe('Format to return schema in: SDL text, JSON object, or both.'),
    },
    handler: async ({ format = 'both' }: { format?: 'sdl' | 'json' | 'both' }) => {
        const result = await introspectGraphQLSchema();

        return {
            content: [{
                type: "text",
                text: JSON.stringify(result, null, 2)
            }],
        };
    }
}; 