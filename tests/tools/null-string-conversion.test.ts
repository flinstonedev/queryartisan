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

describe('Null String Conversion Fix', () => {
    let sessionId: string;
    let state: QueryState;

    beforeEach(() => {
        sessionId = 'test-session-null-fix';
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

    describe('String "null" Conversion', () => {
        it('should convert string "null" to actual null value', async () => {
            const result = await setTypedArgumentTool.handler({
                sessionId,
                fieldPath: 'characters',
                argumentName: 'filter',
                value: 'null'
            });

            const response = JSON.parse(result.content[0].text);
            expect(response.success).toBe(true);
            expect(response.error).toBeUndefined();

            // Check that the stored value is actual null, not string "null"
            const savedState = mockedSaveQueryState.mock.calls[0][1];
            const storedValue = savedState.queryStructure.fields.characters.args.filter.value;
            expect(storedValue).toBe(null);
            expect(storedValue).not.toBe('null');
            expect(typeof storedValue).not.toBe('string');
        });

        it('should convert string "NULL" (uppercase) to actual null value', async () => {
            const result = await setTypedArgumentTool.handler({
                sessionId,
                fieldPath: 'characters',
                argumentName: 'page',
                value: 'NULL'
            });

            const response = JSON.parse(result.content[0].text);
            expect(response.success).toBe(true);
            expect(response.error).toBeUndefined();

            // Check that the stored value is actual null, not string "NULL"
            const savedState = mockedSaveQueryState.mock.calls[0][1];
            const storedValue = savedState.queryStructure.fields.characters.args.page.value;
            expect(storedValue).toBe(null);
            expect(storedValue).not.toBe('NULL');
            expect(typeof storedValue).not.toBe('string');
        });

        it('should convert string "Null" (mixed case) to actual null value', async () => {
            const result = await setTypedArgumentTool.handler({
                sessionId,
                fieldPath: 'characters',
                argumentName: 'rating',
                value: 'Null'
            });

            const response = JSON.parse(result.content[0].text);
            expect(response.success).toBe(true);
            expect(response.error).toBeUndefined();

            // Check that the stored value is actual null, not string "Null"
            const savedState = mockedSaveQueryState.mock.calls[0][1];
            const storedValue = savedState.queryStructure.fields.characters.args.rating.value;
            expect(storedValue).toBe(null);
            expect(storedValue).not.toBe('Null');
            expect(typeof storedValue).not.toBe('string');
        });

        it('should generate query with null (not "null") for string null conversion', async () => {
            const result = await setTypedArgumentTool.handler({
                sessionId,
                fieldPath: 'characters',
                argumentName: 'filter',
                value: 'null'
            });

            const response = JSON.parse(result.content[0].text);
            expect(response.success).toBe(true);

            // Check that the generated query contains null, not "null"
            expect(response.query).toContain('filter: null');
            expect(response.query).not.toContain('filter: "null"');
        });

        it('should not convert other strings that contain "null" as substring', async () => {
            const result = await setTypedArgumentTool.handler({
                sessionId,
                fieldPath: 'characters',
                argumentName: 'name',
                value: 'nullable_field'
            });

            const response = JSON.parse(result.content[0].text);
            expect(response.success).toBe(true);

            // Check that the stored value is still a string since it's not exactly "null"
            const savedState = mockedSaveQueryState.mock.calls[0][1];
            const storedValue = savedState.queryStructure.fields.characters.args.name.value;
            expect(storedValue).toBe('nullable_field');
            expect(typeof storedValue).toBe('string');
        });
    });
}); 