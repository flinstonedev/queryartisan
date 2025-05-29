import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { startQuerySessionTool } from '../../tools/start-query-session.js';
import { selectFieldTool } from '../../tools/select-field.js';
import { setTypedArgumentTool } from '../../tools/set-typed-argument.js';
import { getCurrentQueryTool } from '../../tools/get-current-query.js';
import { endQuerySessionTool } from '../../tools/end-query-session.js';

vi.mock('../../tools/shared-utils', async () => {
    const { createSharedUtilsMock } = await import('../setup');
    const { buildSchema } = await import('graphql');
    const actualUtils = await vi.importActual('../../tools/shared-utils') as any;

    const mockQueryState = {
        headers: {},
        operationType: 'query',
        operationName: 'BasicTest',
        queryStructure: {
            fields: {},
            fragmentSpreads: [],
            inlineFragments: []
        },
        variablesSchema: {},
        variablesValues: {},
        createdAt: new Date().toISOString()
    };

    const testSchema = buildSchema(`
        type Query {
            characters(page: Int): [Character]
        }
        
        type Character {
            id: ID!
            name: String!
        }
    `);

    const mock = createSharedUtilsMock({
        loadQueryState: vi.fn().mockResolvedValue(mockQueryState),
        fetchAndCacheSchema: vi.fn().mockResolvedValue(testSchema),
        saveQueryState: vi.fn().mockImplementation(async (sid, qs) => {
            Object.assign(mockQueryState, qs);
        }),
    });

    (mock.GraphQLValidationUtils as any).getArgumentType = actualUtils.GraphQLValidationUtils.getArgumentType;
    return mock;
});

describe('Basic Integration Tests', () => {
    let sessionId: string;

    beforeEach(async () => {
        const result = await startQuerySessionTool.handler({
            operationType: 'query',
            operationName: 'BasicTest',
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

    it('should create a basic query with a field selection', async () => {
        await selectFieldTool.handler({
            sessionId,
            fieldName: 'characters',

        });

        const queryResult = await getCurrentQueryTool.handler({ sessionId });
        const queryResponse = JSON.parse(queryResult.content[0].text);

        expect(queryResponse.queryString).toContain('characters');
        expect(queryResponse.queryString).toContain('query BasicTest');
    });

    it('should handle basic argument setting', async () => {
        await selectFieldTool.handler({
            sessionId,
            fieldName: 'characters',

        });

        await setTypedArgumentTool.handler({
            sessionId,
            fieldPath: 'characters',
            argumentName: 'page',
            value: 1,

        });

        const queryResult = await getCurrentQueryTool.handler({ sessionId });
        const queryResponse = JSON.parse(queryResult.content[0].text);

        expect(queryResponse.queryString).toContain('characters(page: 1)');
    });
}); 