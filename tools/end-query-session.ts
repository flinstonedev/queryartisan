import { z } from "zod";
import { QueryState, loadQueryState, deleteQueryState } from "./shared-utils.js";

// Core business logic - testable function
export async function endQuerySession(sessionId: string): Promise<{
    message?: string;
    sessionInfo?: {
        sessionId: string;
        operationType: string;
        operationName: string | null;
        createdAt: string;
        endedAt: string;
    };
    error?: string;
}> {
    try {
        // Load query state to get its details before deleting
        const queryState = await loadQueryState(sessionId);

        if (!queryState) {
            return {
                error: 'Session not found.'
            };
        }

        // Delete the query state
        const deleted = await deleteQueryState(sessionId);
        const endedAt = new Date().toISOString(); // Capture end time

        if (deleted) {
            const sessionInfo = {
                sessionId: sessionId,
                operationType: queryState.operationType,
                operationName: queryState.operationName,
                createdAt: queryState.createdAt,
                endedAt: endedAt
            };
            return {
                message: `Session ${sessionId} ended successfully`,
                sessionInfo: sessionInfo
            };
        } else {
            return {
                error: 'Failed to delete session state after retrieving it.'
            };
        }
    } catch (error) {
        return {
            error: error instanceof Error ? error.message : String(error)
        };
    }
}

export const endQuerySessionTool = {
    name: "end-query-session",
    description: "Clean up and close a GraphQL query building session to free resources",
    schema: {
        sessionId: z.string().describe('The session ID to end.'),
    },
    handler: async ({ sessionId }: { sessionId: string }) => {
        const result = await endQuerySession(sessionId);

        return {
            content: [{
                type: "text",
                text: JSON.stringify(result, null, 2)
            }],
        };
    }
}; 