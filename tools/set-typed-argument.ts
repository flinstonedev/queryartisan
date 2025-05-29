import { z } from "zod";
import {
    GraphQLValidationUtils,
    loadQueryState,
    saveQueryState,
    fetchAndCacheSchema,
    buildQueryFromStructure,
    validateInputComplexity
} from "./shared-utils.js";
import { coerceInputValue, valueFromAST, parseValue } from 'graphql';

const setTypedArgumentDefinition = z.object({
    sessionId: z.string().describe("The session ID for the user's current query building session."),
    fieldPath: z.string().describe("The dot-separated path to the field where the argument will be set (e.g., 'characters' or 'user.posts')."),
    argumentName: z.string().describe("The name of the argument to set."),
    value: z.union([z.string(), z.number(), z.boolean(), z.null()]).describe("The value for the argument. Can be a number, boolean, null, or string representation of these."),
});

type SetTypedArgumentParams = z.infer<typeof setTypedArgumentDefinition>;

/**
 * Sets a typed argument (number, boolean, null) on a field in the GraphQL query.
 * This tool performs schema-aware validation to ensure the value is valid for the argument's type.
 */
async function handler({ sessionId, fieldPath, argumentName, value }: SetTypedArgumentParams): Promise<any> {
    // --- Input Validation ---
    const complexityError = validateInputComplexity(value, `argument "${argumentName}"`);
    if (complexityError) {
        return { content: [{ type: 'text', text: JSON.stringify({ success: undefined, error: complexityError }) }] };
    }

    if (typeof value === 'string') {
        const lengthValidation = GraphQLValidationUtils.validateStringLength(value, argumentName);
        if (!lengthValidation.valid) {
            return { content: [{ type: 'text', text: JSON.stringify({ success: undefined, error: lengthValidation.error }) }] };
        }

        const controlCharValidation = GraphQLValidationUtils.validateNoControlCharacters(value, argumentName);
        if (!controlCharValidation.valid) {
            return { content: [{ type: 'text', text: JSON.stringify({ success: undefined, error: controlCharValidation.error }) }] };
        }
    }

    if (!GraphQLValidationUtils.isValidGraphQLName(argumentName)) {
        return { content: [{ type: 'text', text: JSON.stringify({ success: undefined, error: `Invalid argument name: ${argumentName}` }) }] };
    }
    // --- End Input Validation ---

    const state = await loadQueryState(sessionId);
    if (!state) {
        return { content: [{ type: 'text', text: JSON.stringify({ success: undefined, error: 'Session not found. Please start a new session.' }) }] };
    }

    const schema = await fetchAndCacheSchema(state.headers);
    if (!schema) {
        return { content: [{ type: 'text', text: JSON.stringify({ success: undefined, error: 'Could not fetch or load GraphQL schema.' }) }] };
    }

    // Validate argument name
    if (!GraphQLValidationUtils.isValidGraphQLName(argumentName)) {
        return { content: [{ type: 'text', text: JSON.stringify({ success: undefined, error: `Invalid argument name: ${argumentName}` }) }] };
    }

    // --- Pagination Size Validation ---
    const PAGINATION_ARGS = ['first', 'last', 'limit', 'count'];
    const MAX_PAGINATION_LIMIT = 100;
    if (PAGINATION_ARGS.includes(argumentName.toLowerCase()) && typeof value === 'number') {
        if (value > MAX_PAGINATION_LIMIT) {
            return {
                content: [{
                    type: 'text', text: JSON.stringify({
                        success: undefined,
                        error: `Pagination argument '${argumentName}' exceeds the maximum allowed limit of ${MAX_PAGINATION_LIMIT}.`
                    })
                }]
            };
        }
        if (value < 0) {
            return {
                content: [{
                    type: 'text', text: JSON.stringify({
                        success: undefined,
                        error: `Pagination argument '${argumentName}' cannot be negative.`
                    })
                }]
            };
        }
    }
    // --- End Pagination Size Validation ---

    // Find the field in the query structure FIRST
    const pathParts = fieldPath.split('.').filter(p => p);
    if (pathParts.length === 0) {
        return { content: [{ type: 'text', text: JSON.stringify({ success: undefined, error: "fieldPath cannot be empty." }) }] };
    }

    let currentPath: any = state.queryStructure;
    for (const part of pathParts) {
        if (!currentPath.fields || !currentPath.fields[part]) {
            return { content: [{ type: 'text', text: JSON.stringify({ success: undefined, error: `Field at path '${fieldPath}' not found.` }) }] };
        }
        currentPath = currentPath.fields[part];
    }

    const targetField = currentPath;

    if (!targetField) {
        return { content: [{ type: 'text', text: JSON.stringify({ success: undefined, error: `Field at path '${fieldPath}' not found.` }) }] };
    }

    // NOW, perform schema-aware validation
    const argType = GraphQLValidationUtils.getArgumentType(schema, fieldPath, argumentName);

    if (!argType) {
        return {
            content: [{
                type: 'text',
                text: JSON.stringify({
                    success: undefined,
                    error: `Argument '${argumentName}' not found on field '${fieldPath}'.`,
                })
            }]
        };
    }

    // Parse and coerce the value to the proper type
    let coercedValue: any;
    try {
        // If value is already the correct JavaScript type, use it directly
        if (typeof value === 'number' || typeof value === 'boolean' || value === null) {
            // Special handling for ID types - numbers should stay as numbers for proper serialization
            const typeName = argType.toString();
            if (typeof value === 'number' && (typeName === 'ID' || typeName.startsWith('ID'))) {
                coercedValue = value; // Keep as number for unquoted serialization
            } else {
                coercedValue = coerceInputValue(value, argType);
            }
        } else if (typeof value === 'string') {
            // Check if it's a variable reference (starts with $)
            if (value.startsWith('$')) {
                // Variable references should be stored as-is for later resolution
                coercedValue = value;
            } else {
                // Enhanced string coercion for multiple types
                const typeName = argType.toString();

                // Check for string "null" and convert to actual null
                if (value.toLowerCase() === 'null') {
                    coercedValue = coerceInputValue(null, argType);
                }
                // Try boolean coercion first for Boolean types or string-booleans
                else {
                    const booleanValue = GraphQLValidationUtils.coerceToBoolean(value);
                    if (booleanValue !== null) {
                        coercedValue = coerceInputValue(booleanValue, argType);
                        if (coercedValue !== undefined) {
                            // Successfully coerced as boolean
                        } else {
                            // Fall back to direct string coercion
                            coercedValue = coerceInputValue(value, argType);
                        }
                    }
                    // Try numeric coercion for non-String types
                    else if (!typeName.includes('String') && /^-?\d+\.?\d*$/.test(value)) {
                        // Try parsing as number for numeric types
                        const numValue = Number(value);
                        if (!isNaN(numValue) && isFinite(numValue)) {
                            coercedValue = coerceInputValue(numValue, argType);
                            if (coercedValue !== undefined) {
                                // Successfully coerced as number
                            } else {
                                // Fall back to string coercion
                                coercedValue = coerceInputValue(value, argType);
                            }
                        } else {
                            coercedValue = coerceInputValue(value, argType);
                        }
                    } else {
                        // For other strings or String types, try direct coercion first
                        coercedValue = coerceInputValue(value, argType);
                    }

                    // If direct coercion fails, try parsing as GraphQL literal
                    if (coercedValue === undefined) {
                        try {
                            const parsedAST = parseValue(value);
                            coercedValue = valueFromAST(parsedAST, argType);
                        } catch (parseError) {
                            // If both fail, handle String and ID types specially
                            if (typeName === 'String' || typeName.startsWith('String')) {
                                coercedValue = value;
                            } else if (typeName === 'ID' || typeName.startsWith('ID')) {
                                // ID types can be strings or numbers - try to parse as number first
                                const numValue = Number(value);
                                if (!isNaN(numValue) && isFinite(numValue)) {
                                    coercedValue = numValue;
                                } else {
                                    coercedValue = value;
                                }
                            } else if (typeName === 'Boolean' || typeName.startsWith('Boolean')) {
                                // For Boolean types, try enhanced coercion once more
                                const finalBoolValue = GraphQLValidationUtils.coerceToBoolean(value);
                                if (finalBoolValue !== null) {
                                    coercedValue = finalBoolValue;
                                }
                            }
                        }
                    }
                }
            }
        } else {
            // Fallback to direct coercion
            coercedValue = coerceInputValue(value, argType);
        }

        // Final validation (skip for variable references)
        if (coercedValue === undefined && !(value != null && value.toString().startsWith('$'))) {
            throw new Error(`Cannot coerce value "${value}" to type ${argType}`);
        }
    } catch (error: any) {
        return {
            content: [{
                type: 'text',
                text: JSON.stringify({
                    success: undefined,
                    error: `Invalid value for argument '${argumentName}'. Reason: ${error.message}`,
                })
            }]
        };
    }

    if (!targetField.args) {
        targetField.args = {};
    }

    // Set the argument with the coerced value
    targetField.args[argumentName] = {
        value: coercedValue,
        is_typed: !(typeof coercedValue === 'string' && coercedValue.startsWith('$')), // Variables should not be marked as typed
    };

    await saveQueryState(sessionId, state);

    const query = buildQueryFromStructure(
        state.queryStructure,
        state.operationType,
        state.variablesSchema,
        state.operationName,
        state.fragments,
        state.operationDirectives,
        state.variablesDefaults
    );

    return {
        content: [{
            type: 'text', text: JSON.stringify({
                success: true,
                message: `Typed argument '${argumentName}' set to ${JSON.stringify(coercedValue)} at path '${fieldPath}'.`,
                query,
                queryStructure: state.queryStructure,
            })
        }]
    };
}

export const setTypedArgumentTool = {
    name: 'set-typed-argument',
    description: 'Sets a typed argument (number, boolean, null) on a field in the GraphQL query structure.',
    schema: {
        sessionId: z.string().describe("The session ID for the user's current query building session."),
        fieldPath: z.string().describe("The dot-separated path to the field where the argument will be set (e.g., 'characters' or 'user.posts')."),
        argumentName: z.string().describe("The name of the argument to set."),
        value: z.union([z.string(), z.number(), z.boolean(), z.null()]).describe("The value for the argument. Can be a number, boolean, null, or string representation of these."),
    },
    handler,
    isInternal: false
}; 