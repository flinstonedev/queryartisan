import { z } from "zod";
import { GraphQLSchema } from 'graphql';
import { resolveEndpointAndHeaders, fetchAndCacheSchema } from "./shared-utils.js";

// Core business logic - testable function
export async function getRootOperationTypes(): Promise<{
    query_type?: string | null;
    mutation_type?: string | null;
    subscription_type?: string | null;
    error?: string;
}> {
    const { url: resolvedUrl, headers } = resolveEndpointAndHeaders();

    if (!resolvedUrl) {
        return {
            error: "No default GraphQL endpoint configured in environment variables (DEFAULT_GRAPHQL_ENDPOINT)"
        };
    }

    try {
        const schema = await fetchAndCacheSchema(headers);
        return {
            query_type: schema.getQueryType()?.name || null,
            mutation_type: schema.getMutationType()?.name || null,
            subscription_type: schema.getSubscriptionType()?.name || null
        };
    } catch (error) {
        return {
            error: error instanceof Error ? error.message : String(error)
        };
    }
}

export const getRootOperationTypesTool = {
    name: "get-root-ops",
    description: "Discover the available root operation types (Query, Mutation, Subscription) and their entry points",
    schema: {
        includeFieldCounts: z.boolean().default(false).describe('Include count of available fields for each root operation type.'),
    },
    handler: async ({ includeFieldCounts = false }: { includeFieldCounts?: boolean }) => {
        const result = await getRootOperationTypes();

        return {
            content: [{
                type: "text",
                text: JSON.stringify(result, null, 2)
            }],
        };
    }
}; 