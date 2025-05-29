import { z } from "zod";
import {
    QueryState,
    loadQueryState,
    saveQueryState,
    GraphQLValidationUtils,
    fetchAndCacheSchema,
    validateInputComplexity
} from "./shared-utils.js";
import { typeFromAST } from "graphql";
import { parseType } from "graphql/language/parser.js";

// Core business logic - testable function
export async function setVariableValue(
    sessionId: string,
    variableName: string,
    value: string | number | boolean | null
): Promise<{
    success?: boolean;
    message?: string;
    variablesValues?: { [key: string]: any };
    error?: string;
}> {
    try {
        // Input validation for size and control characters
        const complexityError = validateInputComplexity(value, `variable "${variableName}"`);
        if (complexityError) {
            return { error: complexityError };
        }
        if (typeof value === 'string') {
            const MAX_STRING_LENGTH = 8192;
            if (value.length > MAX_STRING_LENGTH) {
                return {
                    error: `Input string for variable "${variableName}" exceeds maximum allowed length of ${MAX_STRING_LENGTH} characters.`
                };
            }

            // Reject strings containing control characters (e.g., null bytes)
            // eslint-disable-next-line no-control-regex
            const controlCharRegex = /[\u0000-\u001F\u007F-\u009F]/;
            if (controlCharRegex.test(value)) {
                return {
                    error: `Input string for variable "${variableName}" contains disallowed control characters.`
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

        // Check if variable is defined in schema
        if (!queryState.variablesSchema[variableName]) {
            return {
                error: `Variable '${variableName}' is not defined in the query schema. Use set-query-variable first.`
            };
        }

        const variableType = queryState.variablesSchema[variableName];

        try {
            const schema = await fetchAndCacheSchema(queryState.headers);
            const typeNode = parseType(variableType);
            const gqlType = typeFromAST(schema, typeNode as any);

            if (!gqlType) {
                return { error: `Could not determine GraphQL type for '${variableType}'.` };
            }

            // Apply coercion for string values
            let processedValue = value;
            if (typeof value === 'string') {
                const coercedValue = GraphQLValidationUtils.coerceStringValue(value);
                if (coercedValue.coerced) {
                    processedValue = coercedValue.value;
                }
            }

            const validationError = GraphQLValidationUtils.validateValueAgainstType(processedValue, gqlType);
            if (validationError) {
                return { error: `For variable '${variableName}': ${validationError}` };
            }

            // Set the variable value
            queryState.variablesValues[variableName] = processedValue;
        } catch (e: any) {
            return { error: `Type validation failed: ${e.message}` };
        }

        // Save the updated query state
        await saveQueryState(sessionId, queryState);

        return {
            success: true,
            message: `Variable '${variableName}' value set to ${JSON.stringify(value)}.`,
            variablesValues: queryState.variablesValues
        };
    } catch (error) {
        return {
            error: error instanceof Error ? error.message : String(error)
        };
    }
}

export const setVariableValueTool = {
    name: "set-variable-value",
    description: "Assign a runtime value to a previously defined GraphQL variable for query execution",
    schema: {
        sessionId: z.string().describe('The session ID from start-query-session.'),
        variableName: z.string().describe('The variable name (e.g., "$userId").'),
        value: z.string().describe('The value to assign to the variable.'),
    },
    handler: async ({ sessionId, variableName, value }: {
        sessionId: string,
        variableName: string,
        value: string | number | boolean | null
    }) => {
        const result = await setVariableValue(sessionId, variableName, value);

        return {
            content: [{
                type: "text",
                text: JSON.stringify(result, null, 2)
            }],
        };
    }
}; 