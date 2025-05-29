import { z } from "zod";
import {
    GraphQLSchema,
    isObjectType,
    isInterfaceType,
    isEnumType,
    isInputObjectType
} from 'graphql';
import { resolveEndpointAndHeaders, fetchAndCacheSchema, getTypeNameStr } from "./shared-utils.js";

// Helper function to safely convert values to strings
function safeStringify(value: any): string {
    if (value === null || value === undefined) {
        return 'null';
    }

    if (typeof value === 'string') {
        return value;
    }

    if (typeof value === 'number' || typeof value === 'boolean') {
        return String(value);
    }

    // Handle objects that might not serialize properly
    try {
        if (typeof value === 'object') {
            // Try JSON stringify first
            return JSON.stringify(value);
        }
        return String(value);
    } catch (error) {
        // If serialization fails, return null for descriptions/defaultValues
        return 'null';
    }
}

// Helper function to safely get description
function safeGetDescription(obj: any): string | null {
    try {
        if (typeof obj.description === 'string') {
            return obj.description;
        }

        if (obj.description === null || obj.description === undefined) {
            return null;
        }

        // For descriptions, if we can't serialize, return null
        if (typeof obj.description === 'object') {
            try {
                return JSON.stringify(obj.description);
            } catch {
                return null; // Better than '[object Object]'
            }
        }

        return String(obj.description);
    } catch (error) {
        return null;
    }
}

// Core business logic - testable function
export async function getTypeInfo(typeName: string): Promise<{
    name?: string;
    kind?: string;
    description?: string;
    fields?: any[];
    enum_values?: any[];
    input_fields?: any[];
    error?: string;
}> {
    const { url: resolvedUrl, headers } = resolveEndpointAndHeaders();

    if (!resolvedUrl) {
        return {
            error: "No default GraphQL endpoint configured in environment variables (DEFAULT_GRAPHQL_ENDPOINT)"
        };
    }

    try {
        const schema = await fetchAndCacheSchema(headers);
        const gqlType = schema.getType(typeName);

        if (!gqlType) {
            return {
                error: `Type '${typeName}' not found in schema`
            };
        }

        const outputData: any = {
            name: gqlType.name,
            kind: gqlType.constructor.name,
            description: safeGetDescription(gqlType)
        };

        if (isObjectType(gqlType) || isInterfaceType(gqlType)) {
            const fields = gqlType.getFields();
            outputData.fields = Object.entries(fields).map(([fieldName, field]) => ({
                name: fieldName,
                description: safeGetDescription(field),
                type: getTypeNameStr((field as any).type),
                args: (field as any).args.map((arg: any) => ({
                    name: arg.name,
                    description: safeGetDescription(arg),
                    type: getTypeNameStr(arg.type),
                    defaultValue: arg.defaultValue !== undefined ? safeStringify(arg.defaultValue) : null
                }))
            }));
        } else if (isEnumType(gqlType)) {
            outputData.enum_values = gqlType.getValues().map((value: any) => ({
                name: value.name,
                description: safeGetDescription(value),
                value: value.value
            }));
        } else if (isInputObjectType(gqlType)) {
            const fields = gqlType.getFields();
            outputData.input_fields = Object.entries(fields).map(([fieldName, field]) => ({
                name: fieldName,
                description: safeGetDescription(field),
                type: getTypeNameStr(field.type),
                defaultValue: field.defaultValue !== undefined ? safeStringify(field.defaultValue) : null
            }));
        }

        return outputData;
    } catch (error) {
        return {
            error: error instanceof Error ? error.message : String(error)
        };
    }
}

export const getTypeInfoTool = {
    name: "get-type-info",
    description: "Get detailed information about a specific GraphQL type including fields, descriptions, and relationships",
    schema: {
        typeName: z.string().describe('The name of the GraphQL type to get information for.'),
    },
    handler: async ({ typeName }: { typeName: string }) => {
        const result = await getTypeInfo(typeName);

        return {
            content: [{
                type: "text",
                text: JSON.stringify(result, null, 2)
            }],
        };
    }
}; 