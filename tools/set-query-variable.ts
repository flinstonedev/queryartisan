import { z } from "zod";
import {
    QueryState,
    loadQueryState,
    saveQueryState,
    GraphQLValidationUtils,
    fetchAndCacheSchema,
    validateInputComplexity
} from "./shared-utils.js";
import { typeFromAST, GraphQLType } from "graphql";
import { parseType } from "graphql/language/parser.js";

// Core business logic - testable function
export async function setQueryVariable(
    sessionId: string,
    variableName: string,
    variableType: string,
    defaultValue?: string | number | boolean | null
): Promise<{
    success?: boolean;
    message?: string;
    variablesSchema?: { [key: string]: string };
    variablesDefaults?: { [key: string]: any };
    error?: string;
}> {
    try {
        // --- Input Validation ---
        const complexityError = validateInputComplexity(defaultValue, `default value for variable "${variableName}"`);
        if (complexityError) {
            return { error: complexityError };
        }
        // --- End Input Validation ---

        // Validate variable name
        const variableValidation = GraphQLValidationUtils.validateVariableName(variableName);
        if (!variableValidation.valid) {
            return {
                error: variableValidation.error || 'Invalid variable name.'
            };
        }

        // Validate variable type syntax
        const typeValidation = GraphQLValidationUtils.validateVariableType(variableType);
        if (!typeValidation.valid) {
            return {
                error: typeValidation.error || 'Invalid variable type.'
            };
        }

        // Validate variable type exists in schema
        const schema = await fetchAndCacheSchema();
        if (schema) {
            try {
                const typeNode = parseType(variableType);
                const gqlType = typeFromAST(schema, typeNode as any);

                if (!gqlType) {
                    return {
                        error: `Type '${variableType}' does not exist in the GraphQL schema.`
                    };
                }
            } catch (parseError: any) {
                return {
                    error: `Invalid variable type syntax: ${parseError.message}`
                };
            }
        }

        // Load query state
        const queryState = await loadQueryState(sessionId);
        if (!queryState) {
            return {
                error: 'Session not found.'
            };
        }

        // Legacy validation for backward compatibility
        if (!variableName.startsWith('$')) {
            return {
                error: `Variable name must start with '$'. Provided: '${variableName}'.`
            };
        }

        // Update variables schema
        queryState.variablesSchema[variableName] = variableType;

        // Set default value if provided
        if (defaultValue !== undefined) {
            try {
                const schema = await fetchAndCacheSchema(queryState.headers);
                const typeNode = parseType(variableType);
                const gqlType = typeFromAST(schema, typeNode as any);

                if (!gqlType) {
                    return { error: `Could not determine GraphQL type for '${variableType}'.` };
                }

                // Apply coercion for string values
                let processedValue = defaultValue;
                if (typeof defaultValue === 'string') {
                    const coercedValue = GraphQLValidationUtils.coerceStringValue(defaultValue);
                    if (coercedValue.coerced) {
                        processedValue = coercedValue.value;
                    }
                }

                const validationError = GraphQLValidationUtils.validateValueAgainstType(processedValue, gqlType);
                if (validationError) {
                    return { error: `For default value of variable '${variableName}': ${validationError}` };
                }

                queryState.variablesDefaults[variableName] = processedValue;
            } catch (e: any) {
                return { error: `Type validation for default value failed: ${e.message}` };
            }
        }

        // Save the updated query state
        await saveQueryState(sessionId, queryState);

        return {
            success: true,
            message: `Variable '${variableName}' set to type '${variableType}'${defaultValue !== undefined ? ` with default value ${JSON.stringify(defaultValue)}` : ''}.`,
            variablesSchema: queryState.variablesSchema,
            variablesDefaults: queryState.variablesDefaults
        };
    } catch (error) {
        return {
            error: error instanceof Error ? error.message : String(error)
        };
    }
}

export const setQueryVariableTool = {
    name: "set-query-variable",
    description: "Define a GraphQL variable with its type and optional default value for use in the query",
    schema: {
        sessionId: z.string().describe('The session ID from start-query-session.'),
        variableName: z.string().describe('The variable name (must start with $, e.g., "$userId").'),
        variableType: z.string().describe('The GraphQL variable type (e.g., "ID!", "String", "Int").'),
        defaultValue: z.string().optional().describe('Optional default value for the variable.'),
    },
    handler: async ({ sessionId, variableName, variableType, defaultValue }: {
        sessionId: string,
        variableName: string,
        variableType: string,
        defaultValue?: string | number | boolean | null
    }) => {
        const result = await setQueryVariable(sessionId, variableName, variableType, defaultValue);

        return {
            content: [{
                type: "text",
                text: JSON.stringify(result, null, 2)
            }],
        };
    }
}; 