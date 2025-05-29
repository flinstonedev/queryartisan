import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { buildSchema, GraphQLInputObjectType, GraphQLString, GraphQLNonNull, GraphQLID } from 'graphql';
import { startQuerySessionTool } from '../../tools/start-query-session.js';
import { selectFieldTool } from '../../tools/select-field.js';
import { getInputObjectHelpTool } from '../../tools/get-input-object-help.js';
import { endQuerySessionTool } from '../../tools/end-query-session.js';
import * as sharedUtils from '../../tools/shared-utils';

vi.mock('../../tools/shared-utils', async () => {
    const { createSharedUtilsMock } = await import('../core/setup');
    const { buildSchema } = await import('graphql');

    const testSchema = buildSchema(`
        input FilterCharacter {
            name: String
            status: String
        }
        
        type Character {
            id: ID!
            name: String
            status: String
        }
        
        type Query {
            characters(filter: FilterCharacter): [Character]
        }
    `);

    const mockQueryState = {
        headers: {},
        operationType: 'query',
        operationTypeName: 'Query',
        operationName: 'InputObjectHelpTest',
        queryStructure: {
            fields: {},
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

    return createSharedUtilsMock({
        fetchAndCacheSchema: vi.fn().mockResolvedValue(testSchema),
        loadQueryState: vi.fn().mockResolvedValue(mockQueryState),
        validateInputComplexity: vi.fn().mockReturnValue(null),
        getTypeNameStr: vi.fn((type: any) => {
            if (!type) return 'Unknown';
            if (type.name) return type.name;
        }),
    });
});

describe('Get Input Object Help Tool Tests', () => {
    let sessionId: string;

    beforeEach(async () => {
        const result = await startQuerySessionTool.handler({
            operationType: 'query',
            operationName: 'InputObjectHelpTest',
        });

        const parsed = JSON.parse(result.content[0].text);
        sessionId = parsed.sessionId;
        expect(sessionId).toBeDefined();
    });

    afterEach(async () => {
        if (sessionId) {
            await endQuerySessionTool.handler({ sessionId });
        }
    });

    it('should get help for a valid input object type', async () => {
        await selectFieldTool.handler({
            sessionId,
            fieldName: 'characters'
        });

        const result = await getInputObjectHelpTool.handler({
            inputTypeName: 'FilterCharacter'
        });

        const response = JSON.parse(result.content[0].text);
        expect(response.inputTypeName).toBe('FilterCharacter');
        expect(response.fields).toBeDefined();
    });

    it('should handle non-existent input object type', async () => {
        await selectFieldTool.handler({
            sessionId,
            fieldName: 'characters'
        });

        const result = await getInputObjectHelpTool.handler({
            inputTypeName: 'NonExistentType'
        });

        const response = JSON.parse(result.content[0].text);
        expect(response.error).toContain('not found or not an input object type');
    });
});

describe('getInputObjectHelp direct function tests', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should return input object help in normal mode', async () => {
        const { buildSchema } = await import('graphql');
        const testSchema = buildSchema(`
            input UserInput {
                id: ID!
                name: String
            }
            
            type Query {
                test: String
            }
        `);

        vi.mocked(sharedUtils.resolveEndpointAndHeaders).mockReturnValue({
            url: 'http://example.com/graphql',
            headers: {},
        });

        vi.mocked(sharedUtils.fetchAndCacheSchema).mockResolvedValue(testSchema);

        const result = await getInputObjectHelpTool.handler({
            inputTypeName: 'UserInput'
        });

        const response = JSON.parse(result.content[0].text);
        expect(response.inputTypeName).toBe('UserInput');
        expect(response.fields).toHaveLength(2);
        expect(response.fields[0].name).toBe('id');
        expect(response.fields[1].name).toBe('name');
    });

    it('should handle schema fetch error', async () => {
        vi.mocked(sharedUtils.resolveEndpointAndHeaders).mockReturnValue({
            url: 'http://example.com/graphql',
            headers: {},
        });

        vi.mocked(sharedUtils.fetchAndCacheSchema).mockRejectedValue(new Error('Schema fetch failed'));

        const result = await getInputObjectHelpTool.handler({
            inputTypeName: 'UserInput'
        });

        const response = JSON.parse(result.content[0].text);
        expect(response.error).toBe('Schema fetch failed');
    });

    it('should handle missing endpoint', async () => {
        vi.mocked(sharedUtils.resolveEndpointAndHeaders).mockReturnValue({
            url: null,
            headers: {},
        });

        const result = await getInputObjectHelpTool.handler({
            inputTypeName: 'UserInput'
        });

        const response = JSON.parse(result.content[0].text);
        expect(response.error).toContain('No default GraphQL endpoint configured');
    });

    it('should handle type not found', async () => {
        const mockSchema = {
            getType: vi.fn().mockReturnValue(null),
        };

        vi.mocked(sharedUtils.resolveEndpointAndHeaders).mockReturnValue({
            url: 'http://example.com/graphql',
            headers: {},
        });

        vi.mocked(sharedUtils.fetchAndCacheSchema).mockResolvedValue(mockSchema as any);

        const result = await getInputObjectHelpTool.handler({
            inputTypeName: 'NonExistentType'
        });

        const response = JSON.parse(result.content[0].text);
        expect(response.error).toContain('not found or not an input object type');
    });
}); 