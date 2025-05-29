import { z } from "zod";
import { QueryState, loadQueryState, saveQueryState, GraphQLValidationUtils } from "./shared-utils.js";

// Core business logic - testable function
export async function applyNamedFragment(
    sessionId: string,
    parentPath: string = "",
    fragmentName: string
): Promise<{
    success?: boolean;
    message?: string;
    parentPath?: string;
    fragmentName?: string;
    error?: string;
}> {
    try {
        // Validate fragment name syntax
        if (!GraphQLValidationUtils.isValidGraphQLName(fragmentName)) {
            return {
                error: `Invalid fragment name "${fragmentName}". Must match /^[_A-Za-z][_0-9A-Za-z]*$/`
            };
        }

        // Load query state
        const queryState = await loadQueryState(sessionId);
        if (!queryState) {
            return {
                error: 'Session not found.'
            };
        }

        // Check if fragment exists
        if (!queryState.fragments || !queryState.fragments[fragmentName]) {
            return {
                error: `Fragment '${fragmentName}' not found. Define it first using define-named-fragment.`
            };
        }

        // Navigate to the parent node in the query structure
        let parentNode = queryState.queryStructure;
        if (parentPath) {
            const pathParts = parentPath.split('.');
            for (const part of pathParts) {
                if (!parentNode.fields || !parentNode.fields[part]) {
                    return {
                        error: `Parent path '${parentPath}' not found in query structure.`
                    };
                }
                parentNode = parentNode.fields[part];
            }
        }

        // Add fragment spread to the parent node
        if (!parentNode.fragmentSpreads) {
            parentNode.fragmentSpreads = [];
        }

        if (!parentNode.fragmentSpreads.includes(fragmentName)) {
            parentNode.fragmentSpreads.push(fragmentName);
        }

        // Save updated query state
        await saveQueryState(sessionId, queryState);

        return {
            success: true,
            message: `Fragment '${fragmentName}' applied at path '${parentPath}'.`,
            fragmentName,
            parentPath
        };
    } catch (error) {
        return {
            error: error instanceof Error ? error.message : String(error)
        };
    }
}

export const applyNamedFragmentTool = {
    name: "apply-fragment",
    description: "Apply a previously defined named fragment to a specific location in the query",
    schema: z.object({
        sessionId: z.string().describe('The session ID from start-query-session.'),
        parentPath: z.string().default("").describe('Dot-notation path where the fragment should be applied (e.g., "user", "" for root).'),
        fragmentName: z.string().describe('The name of the fragment to apply.'),
    }),
    handler: async ({ sessionId, parentPath = "", fragmentName }: {
        sessionId: string,
        parentPath?: string,
        fragmentName: string
    }) => {
        const result = await applyNamedFragment(sessionId, parentPath, fragmentName);

        return {
            content: [{
                type: "text",
                text: JSON.stringify(result, null, 2)
            }],
        };
    }
}; 