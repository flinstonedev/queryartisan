import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setTypedArgumentTool } from '../../tools/set-typed-argument';
import { buildSchema } from 'graphql';
import * as sharedUtils from '../../tools/shared-utils';
import { QueryState } from '../../tools/shared-utils';

vi.mock('../../tools/shared-utils', async () => {
    const originalModule = await vi.importActual('../../tools/shared-utils');
    const { buildSchema } = await import('graphql');

    const TEST_SCHEMA_STRING = `
        type Query {
            characters(id: ID, name: String, page: Int, rating: Float, filter: Boolean, first: Int): [Character!]
            character(id: ID!): Character
        }
        type Character {
            id: ID!
            name: String!
        }
    `;
    const TEST_SCHEMA = buildSchema(TEST_SCHEMA_STRING);

    return {
        ...originalModule,
        loadQueryState: vi.fn(),
        saveQueryState: vi.fn(),
        fetchAndCacheSchema: vi.fn().mockResolvedValue(TEST_SCHEMA),
        resolveEndpointAndHeaders: vi.fn().mockReturnValue({ url: 'http://test.com/graphql', headers: {} }),
        validateInputComplexity: vi.fn().mockReturnValue(null),
    };
});

const mockedLoadQueryState = vi.mocked(sharedUtils.loadQueryState);
const mockedSaveQueryState = vi.mocked(sharedUtils.saveQueryState);

describe('setTypedArgument', () => {
    let sessionId: string;
    let state: QueryState;

    beforeEach(() => {
        sessionId = 'test-session';
        state = {
            headers: {},
            operationType: 'query',
            operationTypeName: 'Query',
            operationName: 'MyQuery',
            queryStructure: {
                fields: {
                    characters: {
                        fieldName: 'characters',
                        args: {},
                        fields: {
                            id: { fieldName: 'id', args: {}, fields: {} }
                        }
                    },
                    character: {
                        fieldName: 'character',
                        args: {},
                        fields: {
                            name: { fieldName: 'name', args: {}, fields: {} }
                        }
                    }
                },
                fragmentSpreads: [],
                inlineFragments: []
            },
            fragments: {},
            variablesSchema: {},
            variablesDefaults: {},
            variablesValues: {},
            operationDirectives: [],
            createdAt: new Date().toISOString()
        };

        mockedLoadQueryState.mockResolvedValue(JSON.parse(JSON.stringify(state))); // Deep copy
        mockedSaveQueryState.mockResolvedValue();
        vi.clearAllMocks();
    });

    it('should set an Int argument', async () => {
        const result = await setTypedArgumentTool.handler({ sessionId, fieldPath: 'characters', argumentName: 'page', value: 1 });
        const response = JSON.parse(result.content[0].text);
        expect(response.success).toBe(true);
        expect(mockedSaveQueryState).toHaveBeenCalled();
        const savedState = mockedSaveQueryState.mock.calls[0][1];
        expect(savedState.queryStructure.fields.characters.args.page).toEqual({ value: 1, is_typed: true });
    });

    it('should set a String argument', async () => {
        const result = await setTypedArgumentTool.handler({ sessionId, fieldPath: 'characters', argumentName: 'name', value: 'Rick' });
        const response = JSON.parse(result.content[0].text);
        expect(response.success).toBe(true);
        const savedState = mockedSaveQueryState.mock.calls[0][1];
        expect(savedState.queryStructure.fields.characters.args.name).toEqual({ value: 'Rick', is_typed: true });
    });

    describe('Error Handling - Invalid Argument Names', () => {

        it('should reject argument names with special characters', async () => {
            const result = await setTypedArgumentTool.handler({
                sessionId,
                fieldPath: 'characters',
                argumentName: 'invalid-name!',
                value: 'test'
            });

            const response = JSON.parse(result.content[0].text);
            expect(response.success).toBeUndefined();
            expect(response.error).toBe("Invalid argument name: invalid-name!");
        });


        it('should reject argument names starting with numbers', async () => {
            const result = await setTypedArgumentTool.handler({
                sessionId,
                fieldPath: 'characters',
                argumentName: '123invalid',
                value: 'test'
            });

            const response = JSON.parse(result.content[0].text);
            expect(response.error).toBe("Invalid argument name: 123invalid");
        });


        it('should reject empty argument names', async () => {
            const result = await setTypedArgumentTool.handler({
                sessionId,
                fieldPath: 'characters',
                argumentName: '',
                value: 'test'
            });
            const response = JSON.parse(result.content[0].text);
            expect(response.error).toBe("Invalid argument name: ");
        });
    });

    describe('Error Handling - Schema Validation', () => {

        it('should reject non-existent field paths', async () => {
            const result = await setTypedArgumentTool.handler({
                sessionId,
                fieldPath: 'nonexistent.field',
                argumentName: 'arg',
                value: 'value'
            });
            const response = JSON.parse(result.content[0].text);
            expect(response.error).toContain("Field at path 'nonexistent.field' not found.");
        });

        it('should reject non-existent arguments on valid fields', async () => {
            const result = await setTypedArgumentTool.handler({
                sessionId,
                fieldPath: 'characters',
                argumentName: 'nonExistentArg',
                value: 'value'
            });
            const response = JSON.parse(result.content[0].text);
            expect(response.error).toContain("Argument 'nonExistentArg' not found on field 'characters'.");
        });

        it('should reject invalid session IDs', async () => {
            mockedLoadQueryState.mockResolvedValue(null);
            const result = await setTypedArgumentTool.handler({
                sessionId: 'invalid-session',
                fieldPath: 'characters',
                argumentName: 'page',
                value: 1
            });
            const response = JSON.parse(result.content[0].text);
            expect(response.error).toContain("Session not found. Please start a new session.");
        });

        it('should return error for invalid value type', async () => {
            const result = await setTypedArgumentTool.handler({ sessionId, fieldPath: 'characters', argumentName: 'page', value: 'not-an-int' });
            const response = JSON.parse(result.content[0].text);
            expect(response.error).toContain("Invalid value for argument 'page'. Reason: Invalid value \"not-an-int\": Int cannot represent non-integer value: \"not-an-int\"");
        });

        it('should return error for null on non-nullable argument', async () => {
            const result = await setTypedArgumentTool.handler({ sessionId, fieldPath: 'character', argumentName: 'id', value: null });
            const response = JSON.parse(result.content[0].text);

            // The function correctly rejects null values for non-nullable arguments
            expect(response.error).toBeDefined();
            expect(response.error).toContain("Expected non-nullable type");
            expect(response.error).toContain("not to be null");
        });
    });

    describe('Pagination Argument Capping', () => {
        it('should cap "first" argument at 100', async () => {
            const result = await setTypedArgumentTool.handler({ sessionId, fieldPath: 'characters', argumentName: 'first', value: 200 });
            const response = JSON.parse(result.content[0].text);
            expect(response.error).toContain("Pagination argument 'first' exceeds the maximum allowed limit of 100.");
        });
    });

    describe('Input Complexity Validation', () => {
        it('should call validateInputComplexity and return error if validation fails', async () => {
            const complexityError = "Input is too complex: Exceeded maximum depth of 10";
            vi.mocked(sharedUtils.validateInputComplexity).mockReturnValue(complexityError);

            const result = await setTypedArgumentTool.handler({ sessionId, fieldPath: 'characters', argumentName: 'name', value: { complex: "object" } });
            const response = JSON.parse(result.content[0].text);
            expect(response.error).toEqual(complexityError);
            expect(mockedSaveQueryState).not.toHaveBeenCalled();
        });
    });
}); 