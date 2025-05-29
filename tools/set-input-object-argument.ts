import { z } from "zod";
import {
    loadQueryState,
    saveQueryState,
    GraphQLValidationUtils,
    fetchAndCacheSchema,
    validateInputComplexity
} from "./shared-utils.js";
import { getNamedType } from 'graphql';

async function setObjectValueByPath(obj: any, path: string, value: any) {
    const keys = path.split('.');
    let current = obj;
    for (let i = 0; i < keys.length - 1; i++) {
        const key = keys[i];
        if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
            throw new Error('Prototype pollution attempt detected');
        }
        if (!current[key] || typeof current[key] !== 'object') {
            current[key] = {};
        }
        current = current[key];
    }
    const lastKey = keys[keys.length - 1];
    if (lastKey === '__proto__' || lastKey === 'constructor' || lastKey === 'prototype') {
        throw new Error('Prototype pollution attempt detected');
    }
    current[lastKey] = value;
}

export async function setInputObjectArgument(
    sessionId: string,
    fieldPath: string,
    argumentName: string,
    objectPath: string,
    value: any
) {
    try {
        // --- Input Validation ---
        const complexityError = validateInputComplexity(value, `input object argument "${argumentName}"`);
        if (complexityError) {
            return { error: complexityError };
        }
        // --- End Input Validation ---

        const queryState = await loadQueryState(sessionId);
        if (!queryState) {
            return { error: 'Session not found.' };
        }

        let fieldNode = queryState.queryStructure;
        if (fieldPath) {
            const pathParts = fieldPath.split('.');
            for (const part of pathParts) {
                if (!fieldNode.fields || !fieldNode.fields[part]) {
                    return { error: `Field at path '${fieldPath}' not found.` };
                }
                fieldNode = fieldNode.fields[part];
            }
        }

        if (!(fieldNode as any).args) {
            (fieldNode as any).args = {};
        }

        // Check if the argument is a variable reference
        const existingArg = (fieldNode as any).args[argumentName];
        if (existingArg && typeof existingArg === 'string' && existingArg.startsWith('$')) {
            return {
                error: `Cannot set input object properties on variable argument '${argumentName}'. The argument is currently set to variable '${existingArg}'. Remove the variable first or use a different approach.`
            };
        }

        if (!(fieldNode as any).args[argumentName]) {
            (fieldNode as any).args[argumentName] = {};
        }

        await setObjectValueByPath((fieldNode as any).args[argumentName], objectPath, value);

        await saveQueryState(sessionId, queryState);

        return {
            success: true,
            message: `Set '${objectPath}' to '${JSON.stringify(value)}' in input object '${argumentName}' at field '${fieldPath}'.`
        };

    } catch (error) {
        return { error: error instanceof Error ? error.message : String(error) };
    }
}

export const setInputObjectArgumentTool = {
    name: "set-input-obj-arg",
    description: "Set nested properties within GraphQL input object arguments for complex data structures",
    schema: {
        sessionId: z.string().describe("Session ID"),
        fieldPath: z.string().describe("Dot-notation path to the field"),
        argumentName: z.string().describe("Argument name for the input object"),
        objectPath: z.string().describe("Dot-notation path inside the input object"),
        value: z.string().describe("Value to set"),
    },
    handler: async ({
        sessionId,
        fieldPath,
        argumentName,
        objectPath,
        value
    }: {
        sessionId: string;
        fieldPath: string;
        argumentName: string;
        objectPath: string;
        value: string | number | boolean | null;
    }) => {
        const result = await setInputObjectArgument(
            sessionId,
            fieldPath,
            argumentName,
            objectPath,
            value
        );
        return {
            content: [{
                type: "text",
                text: JSON.stringify(result, null, 2)
            }],
        };
    },
}; 