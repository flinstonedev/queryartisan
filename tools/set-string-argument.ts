import { z } from "zod";
import { QueryState, loadQueryState, saveQueryState, GraphQLValidationUtils } from "./shared-utils.js";

// Core business logic - testable function
export async function setStringArgument(
    sessionId: string,
    fieldPath: string,
    argumentName: string,
    value: string,
    isEnum: boolean = false
): Promise<{
    success?: boolean;
    message?: string;
    warning?: string;
    queryStructure?: any;
    error?: string;
}> {
    try {
        // Input validation for size and control characters, skip for enums
        if (!isEnum) {
            if (value === '') {
                return {
                    error: `Empty string not allowed for argument "${argumentName}". Use null for empty values or provide a non-empty string.`
                };
            }
            const lengthValidation = GraphQLValidationUtils.validateStringLength(value, argumentName);
            if (!lengthValidation.valid) return { error: lengthValidation.error };

            const controlCharValidation = GraphQLValidationUtils.validateNoControlCharacters(value, argumentName);
            if (!controlCharValidation.valid) return { error: controlCharValidation.error };
        }

        const paginationValidation = GraphQLValidationUtils.validatePaginationValue(argumentName, value);
        if (!paginationValidation.valid) return { error: paginationValidation.error };

        // Validate argument name syntax
        if (!GraphQLValidationUtils.isValidGraphQLName(argumentName)) {
            return {
                error: `Invalid argument name "${argumentName}". Must match /^[_A-Za-z][_0-9A-Za-z]*$/`
            };
        }

        // Load query state
        const queryState = await loadQueryState(sessionId);
        if (!queryState) {
            return {
                error: 'Session not found.'
            };
        }

        // Validate argument against schema
        try {
            const { fetchAndCacheSchema } = await import('./shared-utils.js');
            const schema = await fetchAndCacheSchema(queryState.headers);
            if (schema) {
                const argType = GraphQLValidationUtils.getArgumentType(schema, fieldPath, argumentName);
                if (!argType) {
                    return {
                        error: `Argument '${argumentName}' not found on field '${fieldPath}'. Please check the schema documentation.`
                    };
                }
            }
        } catch (error) {
            // Schema validation failed, but continue anyway to maintain backward compatibility
            console.warn(`Schema validation failed for argument ${argumentName}:`, error);
        }

        // Navigate to field in query structure
        let currentNode = queryState.queryStructure;
        if (fieldPath) {
            const pathParts = fieldPath.split('.');
            for (const part of pathParts) {
                if (!currentNode.fields || !currentNode.fields[part]) {
                    return {
                        error: `Field at path '${fieldPath}' not found.`
                    };
                }
                currentNode = currentNode.fields[part];
            }
        }

        // Set the argument value using secure serialization
        if (!(currentNode as any).args) {
            (currentNode as any).args = {};
        }

        // Enhanced type detection and coercion
        if (isEnum) {
            (currentNode as any).args[argumentName] = { value, is_enum: true }; // Store enum with proper flag
        } else {
            // Auto-detect numeric and boolean values for better GraphQL output
            const coercedResult = GraphQLValidationUtils.coerceStringValue(value);

            if (coercedResult.coerced) {
                // Store as typed value for proper rendering
                (currentNode as any).args[argumentName] = {
                    value: coercedResult.value,
                    is_typed: true,
                    original_string: value // Keep original for debugging
                };
            } else {
                // Store string with special marker to indicate it needs quoting during query building
                (currentNode as any).args[argumentName] = { __graphqlString: value };
            }
        }

        // Save updated query state
        await saveQueryState(sessionId, queryState);

        let message = `String argument '${argumentName}' set to "${value}" at path '${fieldPath}'.`;
        let warning = undefined;

        // Add type coercion feedback and performance warnings
        if (!isEnum) {
            const coercedResult = GraphQLValidationUtils.coerceStringValue(value);
            if (coercedResult.coerced && coercedResult.warning) {
                warning = coercedResult.warning;
                message += ` Auto-coerced to ${coercedResult.type}.`;
            }

            // Add performance warning if applicable
            const performanceWarning = GraphQLValidationUtils.generatePerformanceWarning(argumentName, coercedResult.coerced ? coercedResult.value : value);
            if (performanceWarning) {
                warning = warning ? `${warning} ${performanceWarning}` : performanceWarning;
            }
        }

        return {
            success: true,
            message,
            warning,
            queryStructure: queryState.queryStructure
        };
    } catch (error) {
        return {
            error: error instanceof Error ? error.message : String(error)
        };
    }
}

export const setStringArgumentTool = {
    name: "set-string-argument",
    description: "Set string or enum arguments on GraphQL fields with automatic type detection and validation",
    schema: {
        sessionId: z.string().describe('The session ID from start-query-session.'),
        fieldPath: z.string().describe('Dot-notation path to the field (e.g., "user.profile").'),
        argumentName: z.string().describe('The name of the argument to set.'),
        value: z.string().describe('The string value for the argument.'),
        isEnum: z.boolean().default(false).describe('If true, treat as enum value (unquoted).'),
    },
    handler: async ({ sessionId, fieldPath, argumentName, value, isEnum = false }: {
        sessionId: string,
        fieldPath: string,
        argumentName: string,
        value: string,
        isEnum?: boolean
    }) => {
        const result = await setStringArgument(sessionId, fieldPath, argumentName, value, isEnum);

        return {
            content: [{
                type: "text",
                text: JSON.stringify(result, null, 2)
            }],
        };
    }
}; 