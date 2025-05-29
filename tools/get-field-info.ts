import { z } from "zod";
import {
    GraphQLSchema,
    isObjectType,
    isInterfaceType
} from 'graphql';
import { resolveEndpointAndHeaders, fetchAndCacheSchema, getTypeNameStr } from "./shared-utils.js";

// Core business logic - testable function
export async function getFieldInfo(
    typeName: string,
    fieldName: string
): Promise<{
    name?: string;
    description?: string;
    type?: string;
    args?: any[];
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

        if (!gqlType || (!isObjectType(gqlType) && !isInterfaceType(gqlType))) {
            return {
                error: `Type '${typeName}' not found or not an object/interface type`
            };
        }

        const fields = gqlType.getFields();
        const field = fields[fieldName];

        if (!field) {
            return {
                error: `Field '${fieldName}' not found on type '${typeName}'`
            };
        }

        const argsInfo = field.args.map((arg: any) => ({
            name: arg.name,
            description: arg.description,
            type: getTypeNameStr(arg.type),
            defaultValue: arg.defaultValue !== undefined ? String(arg.defaultValue) : null
        }));

        return {
            name: fieldName,
            description: field.description || undefined,
            type: getTypeNameStr(field.type),
            args: argsInfo
        };
    } catch (error) {
        return {
            error: error instanceof Error ? error.message : String(error)
        };
    }
}

export const getFieldInfoTool = {
    name: "get-field-info",
    description: "Get detailed information about a specific field within a GraphQL type including arguments and return type",
    schema: {
        typeName: z.string().describe('The name of the parent GraphQL type.'),
        fieldName: z.string().describe('The name of the field to get information for.'),
    },
    handler: async ({ typeName, fieldName }: { typeName: string, fieldName: string }) => {
        const result = await getFieldInfo(typeName, fieldName);

        return {
            content: [{
                type: "text",
                text: JSON.stringify(result, null, 2)
            }],
        };
    }
}; 