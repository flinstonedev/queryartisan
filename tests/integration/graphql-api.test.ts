import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { startQuerySessionTool } from '../../tools/start-query-session.js';
import { selectFieldTool } from '../../tools/select-field.js';
import { setTypedArgumentTool } from '../../tools/set-typed-argument.js';
import { setStringArgumentTool } from '../../tools/set-string-argument.js';
import { setVariableValueTool } from '../../tools/set-variable-value.js';
import { setFieldDirectiveTool } from '../../tools/set-field-directive.js';
import { setQueryVariableTool } from '../../tools/set-query-variable.js';
import { getCurrentQueryTool } from '../../tools/get-current-query.js';
import { endQuerySessionTool } from '../../tools/end-query-session.js';
import { setInputObjectArgumentTool } from '../../tools/set-input-object-argument.js';

vi.mock('../../tools/shared-utils', async () => {
    const { createSharedUtilsMock } = await import('../setup');
    const { buildSchema } = await import('graphql');
    const actualUtils = await vi.importActual('../../tools/shared-utils') as any;

    const testSchema = buildSchema(`
        type Character {
            id: ID!
            name: String
        }
        
        type Query {
            characters(page: Int): [Character]
        }
    `);

    // Initialize shared state inside the mock
    const mockQueryState = {
        headers: {},
        operationType: 'query',
        operationTypeName: 'Query',
        operationName: 'IntegrationTest',
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

    const mock = createSharedUtilsMock({
        fetchAndCacheSchema: vi.fn().mockResolvedValue(testSchema),
        loadQueryState: vi.fn().mockImplementation(() => {
            return Promise.resolve({ ...mockQueryState });
        }),
        saveQueryState: vi.fn().mockImplementation(async (sessionId, newState) => {
            Object.assign(mockQueryState, newState);
            return undefined;
        }),
    });

    (mock.GraphQLValidationUtils as any).getArgumentType = actualUtils.GraphQLValidationUtils.getArgumentType;
    return mock;
});

describe('GraphQL API Integration Tests', () => {
    let sessionId: string;

    beforeEach(async () => {
        const result = await startQuerySessionTool.handler({
            operationType: 'query',
            operationName: 'IntegrationTest',
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

    describe('Basic GraphQL API Integration', () => {
        it('should successfully create a session and build a basic query', async () => {
            await selectFieldTool.handler({
                sessionId,
                fieldName: 'characters',

            });

            const queryResult = await getCurrentQueryTool.handler({ sessionId });
            const queryResponse = JSON.parse(queryResult.content[0].text);

            expect(queryResponse.queryString).toContain('characters');
            expect(queryResponse.queryString).toContain('query IntegrationTest');
        });

        it('should handle arguments correctly', async () => {
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
}); 