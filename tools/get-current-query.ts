import { z } from "zod";
import { QueryState, loadQueryState, buildQueryFromStructure } from "./shared-utils.js";

// Core business logic - testable function
export async function getCurrentQuery(sessionId: string, prettyPrint: boolean = false): Promise<{
    queryString?: string;
    variables_schema?: Record<string, string>;
    error?: string;
}> {
    try {
        // Load query state
        const queryState = await loadQueryState(sessionId);
        if (!queryState) {
            return {
                error: 'Session not found.'
            };
        }

        const queryString = buildQueryFromStructure(
            queryState.queryStructure,
            queryState.operationType,
            queryState.variablesSchema,
            queryState.operationName,
            queryState.fragments,
            queryState.operationDirectives,
            queryState.variablesDefaults
        );

        // Validate required arguments and provide warnings
        let warnings: string[] = [];
        try {
            const { fetchAndCacheSchema, GraphQLValidationUtils } = await import('./shared-utils.js');
            const schema = await fetchAndCacheSchema(queryState.headers);
            if (schema && GraphQLValidationUtils.validateRequiredArguments) {
                const validation = GraphQLValidationUtils.validateRequiredArguments(
                    schema,
                    queryState.queryStructure,
                    queryState.operationType
                );
                warnings = validation.warnings;
            }
        } catch (error) {
            // Schema validation failed, but continue anyway to maintain backward compatibility
            console.warn('Required argument validation failed:', error);
        }

        const result: any = {
            queryString: queryString,
            variables_schema: queryState.variablesSchema
        };

        if (warnings.length > 0) {
            result.warnings = warnings;
        }

        return result;
    } catch (error) {
        return {
            error: error instanceof Error ? error.message : String(error)
        };
    }
}



export const getCurrentQueryTool = {
    name: "get-current-query",
    description: "Visualize the current GraphQL query structure and generated query string for debugging and review",
    schema: {
        sessionId: z.string().describe('The session ID from start-query-session.'),
        prettyPrint: z.boolean().default(false).describe('Whether to format the output query string.'),
    },
    handler: async ({ sessionId, prettyPrint = false }: { sessionId: string, prettyPrint?: boolean }) => {
        const result = await getCurrentQuery(sessionId, prettyPrint);

        return {
            content: [{
                type: "text",
                text: JSON.stringify(result, null, 2)
            }],
        };
    }
}; 