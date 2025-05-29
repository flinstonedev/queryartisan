import { z } from "zod";
import { QueryState, loadQueryState, resolveEndpointAndHeaders, buildQueryFromStructure, analyzeQueryComplexity, executeWithTimeout, QUERY_EXECUTION_TIMEOUT, MAX_QUERY_COMPLEXITY } from "./shared-utils.js";

// Core business logic - testable function
export async function executeGraphQLQuery(sessionId: string): Promise<{
    data?: any;
    errors?: any[];
    error?: string;
    queryString?: string;
    executionTime?: number;
    complexityAnalysis?: {
        depth: number;
        fieldCount: number;
        complexityScore: number;
        warnings: string[];
    };
}> {
    const startTime = Date.now();

    try {
        // Load the query state
        const queryState = await loadQueryState(sessionId);
        if (!queryState) {
            return { error: 'Session not found' };
        }

        // Build the query string
        let queryString: string;
        try {
            queryString = buildQueryFromStructure(
                queryState.queryStructure,
                queryState.operationType,
                queryState.variablesSchema,
                queryState.operationName,
                queryState.fragments || {},
                queryState.operationDirectives || [],
                queryState.variablesValues || {}
            );
        } catch (buildError: any) {
            return { error: `Failed to build query: ${buildError.message}` };
        }

        // Perform complexity analysis (but don't fail for backward compatibility)
        let complexityAnalysis;
        try {
            const analysis = analyzeQueryComplexity(queryState.queryStructure, queryState.operationType);

            complexityAnalysis = {
                depth: analysis.depth,
                fieldCount: analysis.fieldCount,
                complexityScore: analysis.complexityScore,
                warnings: analysis.warnings
            };

            // Only fail if complexity is critically high
            if (!analysis.valid && analysis.complexityScore > MAX_QUERY_COMPLEXITY.TOTAL_COMPLEXITY_SCORE) {
                return {
                    error: `Query complexity too high: ${analysis.errors.join('; ')}`,
                    complexityAnalysis
                };
            }
        } catch (complexityError: any) {
            // Don't fail on complexity analysis errors for backward compatibility
            console.warn('Complexity analysis failed:', complexityError.message);
        }

        // Determine timeout based on complexity
        const timeout = complexityAnalysis && complexityAnalysis.complexityScore > 500
            ? QUERY_EXECUTION_TIMEOUT.EXPENSIVE
            : QUERY_EXECUTION_TIMEOUT.DEFAULT;

        // Resolve endpoint and headers
        const { url, headers: envHeaders } = resolveEndpointAndHeaders();
        const headers = { ...envHeaders, ...queryState.headers };

        if (!url) {
            return {
                error: 'No GraphQL endpoint configured',
                queryString,
                executionTime: Date.now() - startTime,
                complexityAnalysis
            };
        }

        // Prepare request body
        const requestBody = {
            query: queryString,
            variables: queryState.variablesValues || {},
            operationName: queryState.operationName
        };

        // Execute the GraphQL request with timeout
        try {
            const fetchPromise = fetch(url, {
                method: 'POST',
                headers,
                body: JSON.stringify(requestBody)
            });

            const response = await executeWithTimeout(
                fetchPromise,
                timeout,
                `Query execution timed out after ${timeout}ms`
            );

            if (!response.ok) {
                return {
                    error: `HTTP ${response.status}: ${response.statusText}`,
                    queryString,
                    executionTime: Date.now() - startTime,
                    complexityAnalysis
                };
            }

            // Parse JSON response with timeout
            const jsonPromise = response.json();
            const result = await executeWithTimeout(
                jsonPromise,
                5000,
                'Response parsing timed out'
            );

            const executionTime = Date.now() - startTime;

            return {
                data: result.data,
                errors: result.errors,
                queryString,
                executionTime,
                complexityAnalysis
            };

        } catch (error: any) {
            const executionTime = Date.now() - startTime;
            return {
                error: error.message,
                queryString,
                executionTime,
                complexityAnalysis
            };
        }

    } catch (error: any) {
        const executionTime = Date.now() - startTime;
        return {
            error: `Execution failed: ${error.message}`,
            executionTime
        };
    }
}

export const executeQueryTool = {
    name: "execute-query",
    description: "Execute the built GraphQL query against the configured endpoint and return results",
    schema: {
        sessionId: z.string().describe('The session ID from start-query-session.'),
    },
    handler: async ({ sessionId }: { sessionId: string }) => {
        const result = await executeGraphQLQuery(sessionId);

        return {
            content: [{
                type: "text",
                text: JSON.stringify(result, null, 2)
            }],
        };
    }
}; 