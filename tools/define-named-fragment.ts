import { z } from "zod";
import { QueryState, loadQueryState, saveQueryState, GraphQLValidationUtils } from "./shared-utils.js";
import { isObjectType, isInterfaceType, GraphQLObjectType, GraphQLInterfaceType } from 'graphql';

// Core business logic - testable function
export async function defineNamedFragment(
    sessionId: string,
    fragmentName: string,
    onType: string,
    fieldNames: string[]
): Promise<{
    success?: boolean;
    message?: string;
    fragmentName?: string;
    onType?: string;
    fieldNames?: string[];
    error?: string;
}> {
    try {
        // Validate fragment name syntax
        if (!GraphQLValidationUtils.isValidGraphQLName(fragmentName)) {
            return {
                error: `Invalid fragment name "${fragmentName}". Must match /^[_A-Za-z][_0-9A-Za-z]*$/`
            };
        }

        // Validate type name syntax
        if (!GraphQLValidationUtils.isValidGraphQLName(onType)) {
            return {
                error: `Invalid type name "${onType}". Must match /^[_A-Za-z][_0-9A-Za-z]*$/`
            };
        }

        // Load query state
        const queryState = await loadQueryState(sessionId);
        if (!queryState) {
            return {
                error: 'Session not found.'
            };
        }

        // Validate that the type exists in the schema
        try {
            const { fetchAndCacheSchema } = await import('./shared-utils.js');
            const schema = await fetchAndCacheSchema(queryState.headers);
            if (schema) {
                const type = schema.getType(onType);
                if (!type) {
                    return {
                        error: `Type '${onType}' not found in schema. Please check the schema documentation for valid types.`
                    };
                }
                // Ensure it's a type that can have fragments (Object, Interface, or Union)
                const { isObjectType, isInterfaceType, isUnionType } = await import('graphql');
                if (!isObjectType(type) && !isInterfaceType(type) && !isUnionType(type)) {
                    return {
                        error: `Type '${onType}' cannot be used for fragments. Only Object, Interface, and Union types are allowed.`
                    };
                }
            }
        } catch (error) {
            // Schema validation failed, but continue anyway to maintain backward compatibility
            console.warn(`Schema validation failed for fragment type ${onType}:`, error);
        }

        // Validate fields exist on the type
        try {
            const { fetchAndCacheSchema } = await import('./shared-utils.js');
            const schema = await fetchAndCacheSchema(queryState.headers);
            if (schema) {
                const type = schema.getType(onType);
                if (type && (isObjectType(type) || isInterfaceType(type))) {
                    const availableFields = (type as GraphQLObjectType | GraphQLInterfaceType).getFields();
                    const invalidFields = fieldNames.filter(fieldName => !availableFields[fieldName]);

                    if (invalidFields.length > 0) {
                        return {
                            error: `Invalid fields on type '${onType}': ${invalidFields.join(', ')}. Available fields: ${Object.keys(availableFields).join(', ')}`
                        };
                    }
                }
            }
        } catch (error) {
            // Field validation failed, but continue anyway to maintain backward compatibility
            console.warn(`Field validation failed for fragment on type ${onType}:`, error);
        }

        // Create fragment structure
        const fragmentFields: Record<string, any> = {};
        fieldNames.forEach(fieldName => {
            fragmentFields[fieldName] = {
                fieldName: fieldName,  // Add fieldName property for proper serialization
                alias: null,
                args: {},
                fields: {},
                directives: [],
                fragmentSpreads: [],
                inlineFragments: []
            };
        });

        // Add fragment to query state
        if (!queryState.fragments) {
            queryState.fragments = {};
        }

        // Check for fragment redefinition
        if (queryState.fragments[fragmentName]) {
            return {
                error: `Fragment '${fragmentName}' already exists. Please use a different name or remove the existing fragment first.`
            };
        }

        queryState.fragments[fragmentName] = {
            onType,
            fields: fragmentFields
        };

        // Save updated query state
        await saveQueryState(sessionId, queryState);

        return {
            success: true,
            message: `Fragment '${fragmentName}' defined on type '${onType}' with ${fieldNames.length} fields.`,
            fragmentName,
            onType,
            fieldNames
        };
    } catch (error) {
        return {
            error: error instanceof Error ? error.message : String(error)
        };
    }
}

export const defineNamedFragmentTool = {
    name: "define-fragment",
    description: "Create reusable named fragments for common field selections across queries",
    schema: {
        sessionId: z.string().describe('The session ID from start-query-session.'),
        fragmentName: z.string().describe('The name of the fragment (e.g., "userData").'),
        onType: z.string().describe('The GraphQL type the fragment applies to (e.g., "User").'),
        fieldNames: z.array(z.string()).describe('Array of field names to include in the fragment.'),
    },
    handler: async ({ sessionId, fragmentName, onType, fieldNames }: {
        sessionId: string,
        fragmentName: string,
        onType: string,
        fieldNames: string[]
    }) => {
        const result = await defineNamedFragment(sessionId, fragmentName, onType, fieldNames);

        return {
            content: [{
                type: "text",
                text: JSON.stringify(result, null, 2)
            }],
        };
    }
}; 