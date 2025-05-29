import { z } from "zod";
import { GraphQLSchema } from 'graphql';
import {
    resolveEndpointAndHeaders,
    fetchAndCacheSchema,
    saveQueryState,
    generateSessionId,
    GraphQLValidationUtils,
    QueryState,
    validateInputComplexity
} from "./shared-utils.js";

// Core business logic - testable function
export async function createQuerySession(
    operationType: string = "query",
    operationName?: string,
    sessionHeaders?: Record<string, string>
): Promise<{
    sessionId?: string;
    operationType?: string;
    operationName?: string;
    createdAt?: string;
    error?: string;
}> {
    // Validate operation name syntax
    const operationNameValidation = GraphQLValidationUtils.validateOperationName(operationName || null);
    if (!operationNameValidation.valid) {
        return {
            error: operationNameValidation.error
        };
    }

    const { url: resolvedUrl, headers: envHeaders } = resolveEndpointAndHeaders();

    if (!resolvedUrl) {
        return {
            error: "No default GraphQL endpoint configured in environment variables (DEFAULT_GRAPHQL_ENDPOINT)"
        };
    }

    // Merge headers with session headers taking precedence
    const mergedHeaders = { ...envHeaders, ...sessionHeaders };

    // --- Input Validation ---
    const complexityError = validateInputComplexity(mergedHeaders, "headers");
    if (complexityError) {
        return { sessionId: '', error: complexityError };
    }
    // --- End Input Validation ---

    try {
        const schema = await fetchAndCacheSchema(mergedHeaders);

        // Check if the operation type is supported by the schema
        let operationTypeName: string;
        if (operationType === "query" && schema.getQueryType()) {
            operationTypeName = schema.getQueryType()!.name;
        } else if (operationType === "mutation" && schema.getMutationType()) {
            operationTypeName = schema.getMutationType()!.name;
        } else if (operationType === "subscription" && schema.getSubscriptionType()) {
            operationTypeName = schema.getSubscriptionType()!.name;
        } else {
            return {
                error: `Operation type '${operationType}' not supported by schema or invalid`
            };
        }

        // Generate session ID and create initial query state
        const sessionId = generateSessionId();
        const queryState: QueryState = {
            headers: mergedHeaders,
            operationType,
            operationTypeName,
            operationName: operationName || null,
            queryStructure: {
                fields: {},
                fragmentSpreads: [],
                inlineFragments: []
            },
            fragments: {},
            variablesSchema: {},
            variablesDefaults: {},
            variablesValues: {},
            operationDirectives: [],
            createdAt: new Date().toISOString()
        };

        // Save the query state
        await saveQueryState(sessionId, queryState);

        return {
            sessionId: sessionId,
            operationType: operationType,
            operationName: operationName,
            createdAt: queryState.createdAt
        };
    } catch (error) {
        return {
            error: error instanceof Error ? error.message : String(error)
        };
    }
}

export const startQuerySessionTool = {
    name: "start-query-session",
    description: "Initialize a new GraphQL query building session with persistent state management",
    schema: {
        operationType: z.enum(["query", "mutation", "subscription"]).default("query").describe('The type of GraphQL operation: query, mutation, or subscription.'),
        operationName: z.string().optional().describe('An optional name for the GraphQL operation (e.g., "MyQueryName").'),
        headers: z.record(z.string()).optional().describe('Optional: Custom HTTP headers for this session (e.g., for authentication).'),
    },
    handler: async ({ operationType = "query", operationName, headers: sessionHeaders }: {
        operationType?: string,
        operationName?: string,
        headers?: Record<string, string>
    }) => {
        const result = await createQuerySession(operationType, operationName, sessionHeaders);

        return {
            content: [{
                type: "text",
                text: JSON.stringify(result, null, 2)
            }],
        };
    }
}; 