import { z } from "zod";
import {
    isInputObjectType,
    isNonNullType,
    getNamedType,
    GraphQLNamedType
} from 'graphql';
import { fetchAndCacheSchema, resolveEndpointAndHeaders, getTypeNameStr } from "./shared-utils.js";

// Helper function to generate example values
function generateExampleValue(gqlType: any): any {
    // Unwrap NonNull
    if (isNonNullType(gqlType)) {
        return generateExampleValue(gqlType.ofType);
    }

    // Check type name directly
    const typeName = gqlType?.name || gqlType?.ofType?.name;

    if (typeName === "String") return "example_string";
    if (typeName === "Int") return 42;
    if (typeName === "Float") return 3.14;
    if (typeName === "Boolean") return true;
    if (typeName === "ID") return "example_id";

    return "example_value";
}

// Core business logic - testable function
export async function getInputObjectHelp(
    inputTypeName: string
): Promise<{
    inputTypeName?: string;
    description?: string;
    fields?: any[];
    requiredFields?: string[];
    exampleUsage?: string;
    message?: string;
    error?: string;
}> {
    try {
        const { url: resolvedUrl, headers } = resolveEndpointAndHeaders();

        if (!resolvedUrl) {
            return {
                error: "No default GraphQL endpoint configured in environment variables (DEFAULT_GRAPHQL_ENDPOINT)"
            };
        }

        const schema = await fetchAndCacheSchema(headers);
        const inputType = schema.getType(inputTypeName);

        if (!inputType || !isInputObjectType(inputType)) {
            return {
                error: `Input type '${inputTypeName}' not found or not an input object type`
            };
        }

        const fields = inputType.getFields();
        const fieldInfo = Object.entries(fields).map(([fieldName, field]) => {
            const fieldType = getTypeNameStr(field.type);
            const isRequired = isNonNullType(field.type);
            const exampleValue = generateExampleValue(field.type);

            return {
                name: fieldName,
                type: fieldType,
                description: field.description || `Field of type ${fieldType}`,
                required: isRequired,
                defaultValue: field.defaultValue !== undefined ? String(field.defaultValue) : null,
                exampleValue: exampleValue
            };
        });

        // Generate example usage
        const requiredFields = fieldInfo.filter(f => f.required);
        const exampleFields = requiredFields.length > 0
            ? requiredFields.slice(0, 3).map(f => `${f.name}: ${JSON.stringify(f.exampleValue)}`).join(', ')
            : fieldInfo.slice(0, 3).map(f => `${f.name}: ${JSON.stringify(f.exampleValue)}`).join(', ');

        return {
            inputTypeName: inputTypeName,
            description: inputType.description || `Input type for ${inputTypeName}`,
            fields: fieldInfo,
            requiredFields: fieldInfo.filter(f => f.required).map(f => f.name),
            exampleUsage: `{ ${inputTypeName.toLowerCase()}: { ${exampleFields} } }`
        };
    } catch (error) {
        return {
            error: error instanceof Error ? error.message : String(error)
        };
    }
}

export const getInputObjectHelpTool = {
    name: "get-input-help",
    description: "Get guidance and field information for GraphQL input object types to help with argument construction",
    schema: {
        inputTypeName: z.string().describe('The name of the GraphQL input type to get help for.'),
    },
    handler: async ({ inputTypeName }: {
        inputTypeName: string
    }) => {
        const result = await getInputObjectHelp(inputTypeName);

        return {
            content: [{
                type: "text",
                text: JSON.stringify(result, null, 2)
            }],
        };
    }
}; 