import { z } from "zod";
import { QueryState, loadQueryState, saveQueryState, GraphQLValidationUtils } from "./shared-utils.js";

// Core business logic - testable function
export async function setOperationDirective(
    sessionId: string,
    directiveName: string,
    argumentName?: string,
    argumentValue?: string | number | boolean | null
): Promise<{
    success?: boolean;
    message?: string;
    directiveName?: string;
    argumentName?: string;
    argumentValue?: string | number | boolean | null;
    error?: string;
}> {
    try {
        // Validate directive name syntax
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

        // Add directive to operation
        if (!queryState.operationDirectives) {
            queryState.operationDirectives = [];
        }

        let existingDirective = queryState.operationDirectives.find((d: any) => d.name === directiveName);

        if (existingDirective) {
            if (argumentName && argumentValue !== undefined) {
                if (!existingDirective.arguments) {
                    existingDirective.arguments = [];
                }
                existingDirective.arguments.push({ name: argumentName, value: argumentValue });
            }
        } else {
            const newDirective: any = { name: directiveName, arguments: [] };
            if (argumentName && argumentValue !== undefined) {
                newDirective.arguments.push({ name: argumentName, value: argumentValue });
            }
            queryState.operationDirectives.push(newDirective);
        }

        // Save updated query state
        await saveQueryState(sessionId, queryState);

        return {
            success: true,
            message: `Operation directive '@${directiveName}' applied to query.`,
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

export const setOperationDirectiveTool = {
    name: "set-op-directive",
    description: "Add directives to the root operation for query-level behavior control",
    schema: {
        sessionId: z.string().describe('The session ID from start-query-session.'),
        directiveName: z.string().describe('The name of the directive (e.g., "cached", "auth").'),
        argumentName: z.string().optional().describe('Optional argument name for the directive.'),
        argumentValue: z.string().optional().describe('Optional argument value.'),
    },
    handler: async ({ sessionId, directiveName, argumentName, argumentValue }: {
        sessionId: string,
        directiveName: string,
        argumentName?: string,
        argumentValue?: string | number | boolean | null
    }) => {
        const result = await setOperationDirective(sessionId, directiveName, argumentName, argumentValue);

        return {
            content: [{
                type: "text",
                text: JSON.stringify(result, null, 2)
            }],
        };
    }
}; 