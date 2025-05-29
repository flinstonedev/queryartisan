import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setTypedArgumentTool } from '../../tools/set-typed-argument';
import * as sharedUtils from '../../tools/shared-utils';
import { buildSchema, GraphQLInt } from 'graphql';

// Mock shared-utils
vi.mock('../../tools/shared-utils', async (importOriginal) => {
    const original: any = await importOriginal();
    return {
        ...original,
        loadQueryState: vi.fn(),
        saveQueryState: vi.fn(),
        fetchAndCacheSchema: vi.fn(),
        buildQueryFromStructure: vi.fn().mockReturnValue('{ test }'),
        GraphQLValidationUtils: {
            ...original.GraphQLValidationUtils,
            isValidGraphQLName: vi.fn().mockReturnValue(true),
            getArgumentType: vi.fn(),
        }
    };
});

const mockedLoadQueryState = vi.mocked(sharedUtils.loadQueryState);
const mockedFetchAndCacheSchema = vi.mocked(sharedUtils.fetchAndCacheSchema);
const mockedGetArgumentType = vi.mocked(sharedUtils.GraphQLValidationUtils.getArgumentType);

describe('setTypedArgumentTool', () => {

    beforeEach(() => {
        vi.clearAllMocks();

        const schema = buildSchema(`
            type Query {
                items(first: Int, other: Int): [String]
            }
        `);
        mockedFetchAndCacheSchema.mockResolvedValue(schema);

        mockedLoadQueryState.mockResolvedValue({
            headers: {},
            operationType: 'query',
            operationTypeName: 'Query',
            operationName: null,
            queryStructure: { fields: { items: { fields: {} } }, fragmentSpreads: [], inlineFragments: [] },
            fragments: {},
            variablesSchema: {},
            variablesDefaults: {},
            variablesValues: {},
            operationDirectives: [],
            createdAt: new Date().toISOString(),
        });

        // Mock getArgumentType to return a basic Int type
        mockedGetArgumentType.mockReturnValue(GraphQLInt);
    });

    it('should reject pagination argument "first" if it exceeds the limit', async () => {
        const result = await setTypedArgumentTool.handler({
            sessionId: 'test-session',
            fieldPath: 'items',
            argumentName: 'first',
            value: 999
        });

        const parsedContent = JSON.parse(result.content[0].text);
        expect(parsedContent.error).toContain('exceeds the maximum allowed limit');
    });

    it('should reject a negative pagination argument', async () => {
        const result = await setTypedArgumentTool.handler({
            sessionId: 'test-session',
            fieldPath: 'items',
            argumentName: 'last',
            value: -1
        });
        const parsedContent = JSON.parse(result.content[0].text);
        expect(parsedContent.error).toContain('cannot be negative');
    });

    it('should accept a valid pagination argument', async () => {
        const result = await setTypedArgumentTool.handler({
            sessionId: 'test-session',
            fieldPath: 'items',
            argumentName: 'first',
            value: 50
        });
        const parsedContent = JSON.parse(result.content[0].text);
        expect(parsedContent.success).toBe(true);
    });

    it('should accept a non-pagination argument without limit checks', async () => {
        const result = await setTypedArgumentTool.handler({
            sessionId: 'test-session',
            fieldPath: 'items',
            argumentName: 'other',
            value: 999
        });
        const parsedContent = JSON.parse(result.content[0].text);
        expect(parsedContent.success).toBe(true);
    });
}); 