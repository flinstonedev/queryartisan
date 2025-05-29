import { describe, it, expect, vi } from 'vitest';
import { setTypedArgumentTool } from '../../tools/set-typed-argument.js';

import { expectSuccess } from '../test-helpers.js';

vi.mock('../../tools/shared-utils', async () => {
    const { createSharedUtilsMock } = await import('../setup');
    const { buildSchema } = await import('graphql');

    const mockQueryState = {
        headers: {},
        operationType: 'query',
        queryStructure: {
            fields: {
                user: {
                    fieldName: 'user',
                    alias: null,
                    args: {},
                    fields: {},
                    directives: [],
                    fragmentSpreads: [],
                    inlineFragments: []
                },
            },
            fragmentSpreads: [],
            inlineFragments: []
        },
    };

    const testSchema = buildSchema(`
        type Query {
            user(
                age: Int,
                id: String,
                name: String,
                status: String,
                page: Int,
                rating: Float,
                active: Boolean,
                optional: String
            ): String
        }
    `);

    return createSharedUtilsMock({
        loadQueryState: vi.fn().mockResolvedValue(mockQueryState),
        fetchAndCacheSchema: vi.fn().mockResolvedValue(testSchema),
        GraphQLValidationUtils: {
            getArgumentType: (schema, fieldPath, argName) => {
                const queryType = schema.getQueryType();
                if (queryType) {
                    const field = queryType.getFields()[fieldPath];
                    if (field) {
                        const arg = field.args.find(a => a.name === argName);
                        if (arg) return arg.type;
                    }
                }
                return null;
            },
            isValidGraphQLName: (name) => /^[_A-Za-z][_0-9A-Za-z]*$/.test(name),
            validateStringLength: vi.fn().mockImplementation((value: string, name: string) => {
                const MAX_STRING_LENGTH = 8192;
                if (value.length > MAX_STRING_LENGTH) {
                    return {
                        valid: false,
                        error: `Input for "${name}" exceeds maximum allowed length of ${MAX_STRING_LENGTH} characters.`
                    };
                }
                return { valid: true };
            }),
            validateNoControlCharacters: vi.fn().mockImplementation((value: string, name: string) => {
                // eslint-disable-next-line no-control-regex
                const controlCharRegex = /[\u0000-\u001F\u007F-\u009F]/;
                if (controlCharRegex.test(value)) {
                    return {
                        valid: false,
                        error: `Input for "${name}" contains disallowed control characters.`
                    };
                }
                return { valid: true };
            }),
            validatePaginationValue: vi.fn().mockImplementation((argumentName: string, value: string) => {
                const paginationArgs = ['first', 'last', 'limit', 'top', 'count'];
                const MAX_PAGINATION_VALUE = 500;
                if (paginationArgs.includes(argumentName.toLowerCase())) {
                    const numericValue = parseInt(value, 10);
                    if (!isNaN(numericValue) && numericValue > MAX_PAGINATION_VALUE) {
                        return {
                            valid: false,
                            error: `Pagination value for '${argumentName}' (${numericValue}) exceeds maximum of ${MAX_PAGINATION_VALUE}.`
                        };
                    }
                }
                return { valid: true };
            }),
            coerceToBoolean: vi.fn().mockImplementation((value: any) => {
                // Direct boolean
                if (typeof value === 'boolean') {
                    return value;
                }
                // String representations of boolean (protocol conversion case)
                if (typeof value === 'string') {
                    const lowerValue = value.toLowerCase();
                    if (lowerValue === 'true') {
                        return true;
                    }
                    if (lowerValue === 'false') {
                        return false;
                    }
                }
                return null;
            }),
        }
    });
});

describe('Argument Handling', () => {
    it('should set a string argument on a field', async () => {
        const result = await setTypedArgumentTool.handler({ sessionId: 'test-session', fieldPath: 'user', argumentName: 'name', value: 'Rick Sanchez' });
        const response = JSON.parse(result.content[0].text);
        expect(response.success).toBe(true);
        expect(response.message).toBe("Typed argument 'name' set to \"Rick Sanchez\" at path 'user'.");
    });

    it('should set a typed argument on a field', async () => {
        const result = await setTypedArgumentTool.handler({ sessionId: 'test-session', fieldPath: 'user', argumentName: 'age', value: 30 });
        const response = JSON.parse(result.content[0].text);
        expect(response.success).toBe(true);
        expect(response.message).toBe("Typed argument 'age' set to 30 at path 'user'.");
    });

    it('should set a variable argument on a field', async () => {
        const result = await setTypedArgumentTool.handler({ sessionId: 'test-session', fieldPath: 'user', argumentName: 'name', value: '$userName' });
        const response = JSON.parse(result.content[0].text);
        expect(response.success).toBe(true);
        expect(response.message).toBe("Typed argument 'name' set to \"$userName\" at path 'user'.");
    });

    describe('Critical Argument Validation', () => {
        it('should handle string arguments correctly', async () => {
            const result = await setTypedArgumentTool.handler({ sessionId: 'test-session', fieldPath: 'user', argumentName: 'name', value: 'Rick' });
            const response = JSON.parse(result.content[0].text);
            expectSuccess(response, "Typed argument 'name' set to \"Rick\" at path 'user'.");
        });

        it('should handle variable references correctly', async () => {
            const result = await setTypedArgumentTool.handler({ sessionId: 'test-session', fieldPath: 'user', argumentName: 'id', value: '$characterId' });
            const response = JSON.parse(result.content[0].text);
            expectSuccess(response, "Typed argument 'id' set to \"$characterId\" at path 'user'.");
        });

        it('should handle enum arguments correctly', async () => {
            const result = await setTypedArgumentTool.handler({ sessionId: 'test-session', fieldPath: 'user', argumentName: 'status', value: 'ALIVE' });
            const response = JSON.parse(result.content[0].text);
            expectSuccess(response, "Typed argument 'status' set to \"ALIVE\" at path 'user'.");
        });

        it('should support all GraphQL scalar types correctly', async () => {
            // String
            const stringResult = await setTypedArgumentTool.handler({ sessionId: 'test-session', fieldPath: 'user', argumentName: 'name', value: 'Rick' });
            expect(JSON.parse(stringResult.content[0].text).success).toBe(true);

            // Int
            const intResult = await setTypedArgumentTool.handler({ sessionId: 'test-session', fieldPath: 'user', argumentName: 'page', value: 42 });
            expect(JSON.parse(intResult.content[0].text).success).toBe(true);

            // Float  
            const floatResult = await setTypedArgumentTool.handler({ sessionId: 'test-session', fieldPath: 'user', argumentName: 'rating', value: 3.14 });
            expect(JSON.parse(floatResult.content[0].text).success).toBe(true);

            // Boolean
            const booleanResult = await setTypedArgumentTool.handler({ sessionId: 'test-session', fieldPath: 'user', argumentName: 'active', value: true });
            expect(JSON.parse(booleanResult.content[0].text).success).toBe(true);

            // Null
            const nullResult = await setTypedArgumentTool.handler({ sessionId: 'test-session', fieldPath: 'user', argumentName: 'optional', value: null });
            expect(JSON.parse(nullResult.content[0].text).success).toBe(true);
        });
    });
});

describe('Argument Handling - Error Handling', () => {
    it('should return an error for a non-existent field path', async () => {
        const result = await setTypedArgumentTool.handler({ sessionId: 'test-session', fieldPath: 'non.existent', argumentName: 'id', value: '123' });
        const response = JSON.parse(result.content[0].text);
        expect(response.error).toContain("Field at path 'non.existent' not found.");
    });

    it('should return an error for an invalid argument name', async () => {
        const result = await setTypedArgumentTool.handler({ sessionId: 'test-session', fieldPath: 'user', argumentName: 'invalid-name!', value: 42 });
        const response = JSON.parse(result.content[0].text);
        expect(response.error).toContain('Invalid argument name: invalid-name!');
    });
}); 