import { z } from "zod";
import { QueryState, loadQueryState, buildQueryFromStructure, GraphQLValidationUtils, fetchAndCacheSchema, analyzeQueryComplexity } from "./shared-utils.js";
import { parse, validate } from 'graphql';

// Core business logic - testable function
export async function validateGraphQLQuery(sessionId: string): Promise<{
    valid?: boolean;
    errors?: string[];
    query?: string;
    error?: string;
    complexity?: {
        depth: number;
        fieldCount: number;
        complexityScore: number;
        warnings: string[];
    };
}> {
    try {
        // Load query state
        const queryState = await loadQueryState(sessionId);
        if (!queryState) {
            return {
                error: 'Session not found.'
            };
        }

        // Analyze query complexity first
        const complexityAnalysis = analyzeQueryComplexity(
            queryState.queryStructure,
            queryState.operationType
        );

        if (!complexityAnalysis.valid) {
            return {
                valid: false,
                errors: complexityAnalysis.errors,
                complexity: {
                    depth: complexityAnalysis.depth,
                    fieldCount: complexityAnalysis.fieldCount,
                    complexityScore: complexityAnalysis.complexityScore,
                    warnings: complexityAnalysis.warnings,
                }
            };
        }

        // Build query string for validation
        const queryString = buildQueryFromStructure(
            queryState.queryStructure,
            queryState.operationType,
            queryState.variablesSchema,
            queryState.operationName,
            queryState.fragments
        );

        if (!queryString || queryString.trim() === '') {
            return {
                valid: false,
                errors: ['Query is empty. Add fields to the query structure first.'],
                query: queryString
            };
        }

        // Validate the query using GraphQL validation utilities
        try {
            const schema = await fetchAndCacheSchema(queryState.headers);
            const validationResult = GraphQLValidationUtils.validateAgainstSchema(
                queryString,
                schema
            );

            if (!validationResult.valid) {
                return {
                    valid: false,
                    errors: validationResult.errors || ['Unknown validation error'],
                    query: queryString,
                    complexity: {
                        depth: complexityAnalysis.depth,
                        fieldCount: complexityAnalysis.fieldCount,
                        complexityScore: complexityAnalysis.complexityScore,
                        warnings: complexityAnalysis.warnings,
                    }
                };
            }

            // Check for missing required arguments
            if (GraphQLValidationUtils.validateRequiredArguments) {
                const requiredArgsValidation = GraphQLValidationUtils.validateRequiredArguments(
                    schema,
                    queryState.queryStructure,
                    queryState.operationType
                );

                if (requiredArgsValidation.warnings.length > 0) {
                    return {
                        valid: false,
                        errors: requiredArgsValidation.warnings,
                        query: queryString,
                        complexity: {
                            depth: complexityAnalysis.depth,
                            fieldCount: complexityAnalysis.fieldCount,
                            complexityScore: complexityAnalysis.complexityScore,
                            warnings: complexityAnalysis.warnings,
                        }
                    };
                }
            }
        } catch (schemaError) {
            return {
                valid: false,
                errors: [`Schema validation failed: ${schemaError instanceof Error ? schemaError.message : String(schemaError)}`],
                query: queryString,
                complexity: {
                    depth: complexityAnalysis.depth,
                    fieldCount: complexityAnalysis.fieldCount,
                    complexityScore: complexityAnalysis.complexityScore,
                    warnings: complexityAnalysis.warnings,
                }
            };
        }

        return {
            valid: true,
            query: queryString,
            complexity: {
                depth: complexityAnalysis.depth,
                fieldCount: complexityAnalysis.fieldCount,
                complexityScore: complexityAnalysis.complexityScore,
                warnings: complexityAnalysis.warnings,
            }
        };
    } catch (error) {
        return {
            error: error instanceof Error ? error.message : String(error)
        };
    }
}

export const validateQueryTool = {
    name: "validate-query",
    description: "Validate the built GraphQL query against the schema for syntax and semantic correctness",
    schema: {
        sessionId: z.string().describe('The session ID from start-query-session.'),
    },
    handler: async ({ sessionId }: { sessionId: string }) => {
        const result = await validateGraphQLQuery(sessionId);

        return {
            content: [{
                type: "text",
                text: JSON.stringify(result, null, 2)
            }],
        };
    }
}; 