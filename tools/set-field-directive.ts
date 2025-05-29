import { z } from "zod";
import {
    QueryState,
    loadQueryState,
    saveQueryState,
    GraphQLValidationUtils,
    fetchAndCacheSchema,
    validateInputComplexity
} from "./shared-utils.js";
import { isTypeSubTypeOf, typeFromAST } from "graphql";
import { parseType } from "graphql/language/parser.js";

// Core business logic - testable function
export async function setFieldDirective(
    sessionId: string,
    fieldPath: string,
    directiveName: string,
    argumentName?: string,
    argumentValue?: string | number | boolean | null
): Promise<{
    success?: boolean;
    message?: string;
    warning?: string;
    fieldPath?: string;
    directiveName?: string;
    argumentName?: string;
    argumentValue?: string | number | boolean | null;
    error?: string;
}> {
    // --- Input Validation ---
    const complexityError = validateInputComplexity(argumentValue, `directive argument "${argumentName}"`);
    if (complexityError) {
        return { error: complexityError };
    }
    // --- End Input Validation ---

    try {
        if (!GraphQLValidationUtils.isValidGraphQLName(directiveName.replace('@', ''))) {
            return {
                error: `Invalid directive name "${directiveName}".`
            };
        }

        // Load query state
        const queryState = await loadQueryState(sessionId);
        if (!queryState) {
            return {
                error: 'Session not found.'
            };
        }

        if (argumentName) {
            try {
                const schema = await fetchAndCacheSchema(queryState.headers);
                const directive = schema.getDirective(directiveName);

                if (!directive) {
                    return { error: `Directive '@${directiveName}' not found in the schema.` };
                }

                const argDef = directive.args.find(a => a.name === argumentName);

                if (!argDef) {
                    return { error: `Argument '${argumentName}' not found on directive '@${directiveName}'.` };
                }

                if (typeof argumentValue === 'string' && argumentValue.startsWith('$')) {
                    // It's a variable
                    const variableName = argumentValue;
                    const variableTypeStr = queryState.variablesSchema[variableName];
                    if (!variableTypeStr) {
                        return { error: `Variable '${variableName}' is not defined.` };
                    }
                    const varTypeNode = parseType(variableTypeStr);
                    const varGqlType = typeFromAST(schema, varTypeNode as any);
                    if (!varGqlType) {
                        return { error: `Could not determine type for variable '${variableName}'.` };
                    }

                    if (!isTypeSubTypeOf(schema, varGqlType, argDef.type)) {
                        return { error: `Variable '${variableName}' of type '${variableTypeStr}' cannot be used for argument '${argumentName}' of type '${argDef.type.toString()}'.` };
                    }
                } else {
                    // It's a literal value
                    const validationError = GraphQLValidationUtils.validateValueAgainstType(argumentValue, argDef.type);
                    if (validationError) {
                        return { error: `For argument '${argumentName}' on directive '@${directiveName}': ${validationError}` };
                    }
                }

            } catch (e: any) {
                return { error: `Directive argument validation failed: ${e.message}` };
            }
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

        // Add directive to field
        if (!(currentNode as any).directives) {
            (currentNode as any).directives = [];
        }

        let existingDirective = (currentNode as any).directives.find((d: any) => d.name === directiveName);

        // Handle type coercion for string arguments
        let processedArgumentValue = argumentValue;
        if (argumentName && argumentValue !== undefined && typeof argumentValue === 'string') {
            const coercedResult = GraphQLValidationUtils.coerceStringValue(argumentValue);
            if (coercedResult.coerced) {
                processedArgumentValue = coercedResult.value;
            }
        }

        if (existingDirective) {
            if (argumentName && argumentValue !== undefined) {
                if (!existingDirective.arguments) {
                    existingDirective.arguments = [];
                }
                existingDirective.arguments.push({ name: argumentName, value: processedArgumentValue });
            }
        } else {
            const newDirective: any = { name: directiveName };
            if (argumentName && argumentValue !== undefined) {
                newDirective.arguments = [{ name: argumentName, value: processedArgumentValue }];
            }
            (currentNode as any).directives.push(newDirective);
        }

        // Save updated query state
        await saveQueryState(sessionId, queryState);

        let message = `Directive '@${directiveName}' applied to field at path '${fieldPath}'.`;
        let warning = undefined;

        // Add type coercion feedback
        if (argumentName && argumentValue !== undefined && typeof argumentValue === 'string') {
            const coercedResult = GraphQLValidationUtils.coerceStringValue(argumentValue);
            if (coercedResult.coerced && coercedResult.warning) {
                warning = coercedResult.warning;
                message += ` Auto-coerced argument to ${coercedResult.type}.`;
            }
        }

        return {
            success: true,
            message,
            warning,
            fieldPath,
            directiveName,
            argumentName,
            argumentValue
        };
    } catch (error) {
        return {
            error: error instanceof Error ? error.message : String(error)
        };
    }
}

export const setFieldDirectiveTool = {
    name: "set-field-directive",
    description: "Add GraphQL directives like @include or @skip to fields for conditional selection",
    schema: {
        sessionId: z.string().describe('The session ID from start-query-session.'),
        fieldPath: z.string().describe('Dot-notation path to the field (e.g., "user.profile").'),
        directiveName: z.string().describe('The name of the directive (e.g., "include", "skip").'),
        argumentName: z.string().optional().describe('Optional argument name for the directive.'),
        argumentValue: z.string().optional().describe('Optional argument value.'),
    },
    handler: async ({ sessionId, fieldPath, directiveName, argumentName, argumentValue }: {
        sessionId: string,
        fieldPath: string,
        directiveName: string,
        argumentName?: string,
        argumentValue?: string | number | boolean | null
    }) => {
        const result = await setFieldDirective(sessionId, fieldPath, directiveName, argumentName, argumentValue);

        return {
            content: [{
                type: "text",
                text: JSON.stringify(result, null, 2)
            }],
        };
    }
}; 