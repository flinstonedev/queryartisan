import { z } from "zod";
import { GraphQLSchema, isObjectType, isInterfaceType, getNamedType } from 'graphql';
import {
    QueryState,
    loadQueryState,
    saveQueryState,
    fetchAndCacheSchema,
    GraphQLValidationUtils
} from "./shared-utils.js";

// Core business logic - testable function
export async function selectGraphQLField(
    sessionId: string,
    parentPath: string = "",
    fieldName: string,
    alias?: string
): Promise<{
    message?: string;
    fieldKey?: string;
    parentPath?: string;
    error?: string;
}> {
    try {
        // Validate field alias syntax
        const aliasValidation = GraphQLValidationUtils.validateFieldAlias(alias || null);
        if (!aliasValidation.valid) {
            return {
                error: aliasValidation.error || 'Invalid field alias.'
            };
        }

        // Validate field name syntax
        if (!GraphQLValidationUtils.isValidGraphQLName(fieldName)) {
            return {
                error: `Invalid field name "${fieldName}". Must match /^[_A-Za-z][_0-9A-Za-z]*$/`
            };
        }

        // Load query state
        const queryState = await loadQueryState(sessionId);
        if (!queryState) {
            return {
                error: 'Session not found.'
            };
        }

        // Real-time schema validation
        try {
            const schema = await fetchAndCacheSchema(queryState.headers);

            // Determine the current type context for validation
            let currentType = schema.getType(queryState.operationTypeName);

            if (parentPath) {
                const pathParts = parentPath.split('.');
                let currentQueryNode = queryState.queryStructure;

                for (const part of pathParts) {
                    if (!currentQueryNode.fields[part]) {
                        return {
                            error: `Parent path '${parentPath}' not found in query structure.`
                        };
                    }

                    // Navigate through the type system
                    if (isObjectType(currentType) || isInterfaceType(currentType)) {
                        const fields = currentType.getFields();
                        const field = fields[part];
                        if (field) {
                            currentType = getNamedType(field.type);
                        }
                    }

                    currentQueryNode = currentQueryNode.fields[part];
                }
            }

            // Validate the field exists on the current type
            if (isObjectType(currentType) || isInterfaceType(currentType)) {
                const fieldValidation = GraphQLValidationUtils.validateFieldInSchema(
                    schema,
                    currentType,
                    fieldName
                );

                if (!fieldValidation.valid) {
                    return {
                        error: fieldValidation.error
                    };
                }
            }
        } catch (schemaError) {
            // If schema validation fails, warn but continue
            console.warn('Schema validation failed:', schemaError);
        }

        // Navigate to the parent node in the query structure
        let parentNode = queryState.queryStructure;
        if (parentPath) {
            const pathParts = parentPath.split('.');
            for (const part of pathParts) {
                if (!parentNode.fields[part]) {
                    return {
                        error: `Parent path '${parentPath}' not found in query structure.`
                    };
                }
                parentNode = parentNode.fields[part]!;
            }
        }

        // Add the field to the structure
        if (!parentNode.fields) {
            parentNode.fields = {};
        }

        const key = alias || fieldName;

        // Check for alias conflicts
        if (parentNode.fields[key] && parentNode.fields[key].fieldName !== fieldName) {
            return {
                error: `Alias conflict: '${key}' is already used for field '${parentNode.fields[key].fieldName}'. Choose a different alias or field name.`
            };
        }

        parentNode.fields[key] = {
            fieldName: fieldName,
            alias: alias || null,
            args: {},
            fields: {},
            directives: [],
            fragmentSpreads: [],
            inlineFragments: []
        };

        // Save updated query state
        await saveQueryState(sessionId, queryState);

        return {
            message: `Field '${fieldName}' selected successfully at path '${parentPath}'`,
            fieldKey: key,
            parentPath: parentPath
        };
    } catch (error) {
        return {
            error: error instanceof Error ? error.message : String(error)
        };
    }
}

export const selectFieldTool = {
    name: "select-field",
    description: "Add a field to the GraphQL query structure with optional aliasing and validation",
    schema: {
        sessionId: z.string().describe('The session ID from start-query-session.'),
        parentPath: z.string().default("").describe('Dot-notation path where the field should be added (e.g., "user", "" for root).'),
        fieldName: z.string().describe('The name of the field to select.'),
        alias: z.string().optional().describe('An optional alias for the selected field.'),
    },
    handler: async ({ sessionId, parentPath = "", fieldName, alias }: {
        sessionId: string,
        parentPath?: string,
        fieldName: string,
        alias?: string
    }) => {
        const result = await selectGraphQLField(sessionId, parentPath, fieldName, alias);

        return {
            content: [{
                type: "text",
                text: JSON.stringify(result, null, 2)
            }],
        };
    }
}; 