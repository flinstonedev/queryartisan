import { z } from "zod";
import { QueryState, loadQueryState, saveQueryState, GraphQLValidationUtils, fetchAndCacheSchema } from "./shared-utils.js";
import { isObjectType, isInterfaceType, getNamedType, GraphQLObjectType, GraphQLInterfaceType, GraphQLFieldMap, GraphQLField, GraphQLNamedType } from 'graphql';

// Core business logic - testable function
export async function selectMultipleFields(
    sessionId: string,
    parentPath: string = "",
    fieldNames: string[]
): Promise<{
    success?: boolean;
    message?: string;
    selectedFields?: string[];
    parentPath?: string;
    error?: string;
}> {
    try {
        // Validate field names syntax
        for (const fieldName of fieldNames) {
            if (!GraphQLValidationUtils.isValidGraphQLName(fieldName)) {
                return {
                    error: `Invalid field name "${fieldName}". Must match /^[_A-Za-z][_0-9A-Za-z]*$/`
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
                parentNode = parentNode.fields[part];
            }
        }

        // Optional field validation - only validate if we can properly resolve the schema and type
        try {
            const schema = await fetchAndCacheSchema(queryState.headers);
            if (schema) {
                // Determine the parent type for validation
                let parentType: GraphQLObjectType | GraphQLInterfaceType | null = null;
                if (parentPath === "") {
                    // Root level - use the operation type
                    const operationType = queryState.operationType || 'query';
                    parentType = schema.getQueryType() || null;
                    if (operationType === 'mutation') {
                        parentType = schema.getMutationType() || null;
                    } else if (operationType === 'subscription') {
                        parentType = schema.getSubscriptionType() || null;
                    }
                } else {
                    // Navigate to parent type through the path
                    let currentType: GraphQLObjectType | GraphQLInterfaceType | null = schema.getQueryType() || null;
                    const pathParts = parentPath.split('.');

                    for (const part of pathParts) {
                        if (!currentType || (!isObjectType(currentType) && !isInterfaceType(currentType))) {
                            currentType = null;
                            break;
                        }

                        const fieldDef: GraphQLField<any, any> | undefined = currentType.getFields()[part];
                        if (!fieldDef) {
                            currentType = null;
                            break;
                        }

                        const namedType: GraphQLNamedType = getNamedType(fieldDef.type);
                        if (isObjectType(namedType) || isInterfaceType(namedType)) {
                            currentType = namedType;
                        } else {
                            currentType = null;
                            break;
                        }
                    }

                    parentType = currentType;
                }

                // Only validate if we successfully resolved the parent type
                if (parentType && (isObjectType(parentType) || isInterfaceType(parentType))) {
                    const availableFields = parentType.getFields();
                    const invalidFields = fieldNames.filter(fieldName => !availableFields[fieldName]);

                    if (invalidFields.length > 0) {
                        return {
                            error: `Invalid fields on type '${parentType.name}': ${invalidFields.join(', ')}. Available fields: ${Object.keys(availableFields).join(', ')}`
                        };
                    }
                }
            }
        } catch (validationError) {
            // If validation fails, continue without validation to maintain backward compatibility
            console.warn('Field validation failed, continuing without validation:', validationError);
        }

        // Add all fields to the query structure
        if (!parentNode.fields) {
            parentNode.fields = {};
        }

        const addedFields: string[] = [];
        for (const fieldName of fieldNames) {
            parentNode.fields[fieldName] = {
                fieldName: fieldName,  // Add fieldName property for proper serialization
                alias: null,
                args: {},
                fields: {},
                directives: [],
                fragmentSpreads: [],
                inlineFragments: []
            };
            addedFields.push(fieldName);
        }

        // Save the updated query state
        await saveQueryState(sessionId, queryState);

        return {
            success: true,
            message: `Successfully selected ${addedFields.length} fields at path '${parentPath}': ${addedFields.join(', ')}.`,
            selectedFields: addedFields,
            parentPath
        };
    } catch (error) {
        return {
            error: error instanceof Error ? error.message : String(error)
        };
    }
}

export const selectMultipleFieldsTool = {
    name: "select-multi-fields",
    description: "Add multiple fields to the GraphQL query structure in a single operation for efficiency",
    schema: {
        sessionId: z.string().describe('The session ID from start-query-session.'),
        parentPath: z.string().default("").describe('Dot-notation path where fields should be added (e.g., "user", "" for root).'),
        fieldNames: z.array(z.string()).describe('Array of field names to select (without aliases or arguments).'),
    },
    handler: async ({ sessionId, parentPath = "", fieldNames }: {
        sessionId: string,
        parentPath?: string,
        fieldNames: string[]
    }) => {
        const result = await selectMultipleFields(sessionId, parentPath, fieldNames);

        return {
            content: [{
                type: "text",
                text: JSON.stringify(result, null, 2)
            }],
        };
    }
}; 