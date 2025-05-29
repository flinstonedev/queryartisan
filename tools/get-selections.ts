import { z } from "zod";
import {
    GraphQLSchema,
    GraphQLType,
    isObjectType,
    isInterfaceType,
    isUnionType,
    isNonNullType,
    isListType,
    getNamedType
} from 'graphql';
import { QueryState, loadQueryState, fetchAndCacheSchema, getTypeNameStr } from "./shared-utils.js";

// Core business logic - testable function
export async function getAvailableSelections(
    sessionId: string,
    currentPath: string = ""
): Promise<{
    selections?: any[];
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

        // Get schema from cache
        const schema = await fetchAndCacheSchema(queryState.headers);

        // Resolve type at the current path
        let currentType: GraphQLType = schema.getType(queryState.operationTypeName)!;

        if (currentPath) {
            const pathParts = currentPath.split('.');
            let currentQueryNode = queryState.queryStructure;

            for (const part of pathParts) {
                // Navigate through the query structure
                if (!currentQueryNode.fields[part]) {
                    return {
                        error: `Path '${currentPath}' not found in query structure`
                    };
                }

                // Get the field type from schema
                let unwrappedType: GraphQLType = currentType;
                while (isNonNullType(unwrappedType) || isListType(unwrappedType)) {
                    unwrappedType = unwrappedType.ofType;
                }

                if (isObjectType(unwrappedType) || isInterfaceType(unwrappedType)) {
                    const fields: any = unwrappedType.getFields();
                    const field: any = fields[part];
                    if (!field) {
                        return {
                            error: `Field '${part}' not found on type '${unwrappedType.name}'`
                        };
                    }
                    currentType = field.type;
                }

                currentQueryNode = currentQueryNode.fields[part];
            }
        }

        // Unwrap NonNull and List to get the underlying type
        let unwrappedCurrentType = currentType;
        while (isNonNullType(unwrappedCurrentType) || isListType(unwrappedCurrentType)) {
            unwrappedCurrentType = unwrappedCurrentType.ofType;
        }

        const selections: any[] = [];

        // Add fields if it's an object or interface type
        if (isObjectType(unwrappedCurrentType) || isInterfaceType(unwrappedCurrentType)) {
            const fields = unwrappedCurrentType.getFields();
            Object.entries(fields).forEach(([fieldName, field]) => {
                const argInfo = field.args.map((arg: any) => {
                    const argTypeStr = getTypeNameStr(arg.type);
                    const hasDefault = arg.defaultValue !== undefined;
                    return `${arg.name}: ${argTypeStr}${hasDefault ? ' (optional)' : ''}`;
                });

                const argSummary = argInfo.length > 0 ? ` (Args: ${argInfo.join(', ')})` : '';
                const returnTypeStr = getTypeNameStr(field.type);

                let enhancedDesc = field.description || '';
                if (enhancedDesc && !enhancedDesc.endsWith('.') && !enhancedDesc.endsWith('!') && !enhancedDesc.endsWith('?')) {
                    enhancedDesc += '.';
                }
                enhancedDesc += ` Returns ${returnTypeStr}.${argSummary}`;

                selections.push({
                    name: fieldName,
                    type: returnTypeStr,
                    description: enhancedDesc.trim()
                });
            });
        }

        // Add inline fragment suggestions for interface/union types
        if (isInterfaceType(unwrappedCurrentType)) {
            const possibleTypes = schema.getPossibleTypes(unwrappedCurrentType);
            possibleTypes.forEach((type: any) => {
                selections.push({
                    name: `... on ${type.name}`,
                    type: type.name,
                    description: `Select fields specific to ${type.name} type`
                });
            });
        } else if (isUnionType(unwrappedCurrentType)) {
            const possibleTypes = unwrappedCurrentType.getTypes();
            possibleTypes.forEach((type: any) => {
                selections.push({
                    name: `... on ${type.name}`,
                    type: type.name,
                    description: `Select fields specific to ${type.name} type`
                });
            });
        }

        return {
            selections
        };
    } catch (error) {
        return {
            error: error instanceof Error ? error.message : String(error)
        };
    }
}

export const getSelectionsTool = {
    name: "get-selections",
    description: "Get suggestions for available fields that can be selected at a specific path in the query structure",
    schema: {
        sessionId: z.string().describe('The active session ID for query building.'),
        currentPath: z.string().default("").describe('Dot-notation path within the query structure (e.g., "user.address", or "" for root).'),
    },
    handler: async ({ sessionId, currentPath }: { sessionId: string, currentPath?: string }) => {
        const result = await getAvailableSelections(sessionId, currentPath || "");

        return {
            content: [{
                type: "text",
                text: JSON.stringify(result, null, 2)
            }],
        };
    }
}; 