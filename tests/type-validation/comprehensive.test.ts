import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { startQuerySessionTool } from '../../tools/start-query-session.js';
import { selectFieldTool } from '../../tools/select-field.js';
import { setTypedArgumentTool } from '../../tools/set-typed-argument.js';
import { setStringArgumentTool } from '../../tools/set-string-argument.js';
import { setVariableArgumentTool } from '../../tools/set-variable-argument.js';
import { setVariableValueTool } from '../../tools/set-variable-value.js';
import { setFieldDirectiveTool } from '../../tools/set-field-directive.js';
import { setQueryVariableTool } from '../../tools/set-query-variable.js';
import { getCurrentQueryTool } from '../../tools/get-current-query.js';
import { endQuerySessionTool } from '../../tools/end-query-session.js';

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
            characters(page: Int, active: Boolean, score: Float): [Character]
        }
    `);

    // Initialize shared state inside the mock
    const mockQueryState = {
        headers: {},
        operationType: 'query',
        operationTypeName: 'Query',
        operationName: 'TestQuery',
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

describe('Comprehensive Type Validation Tests', () => {
    let sessionId: string;

    beforeEach(async () => {
        const result = await startQuerySessionTool.handler({
            operationType: 'query',
            operationName: 'ComprehensiveTest',
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

    describe('Comprehensive Type Validation Coverage', () => {
        it('should handle all JavaScript primitive types correctly', async () => {
            await selectFieldTool.handler({
                sessionId,
                fieldName: 'characters',

            });

            // Test integer
            const intResult = await setTypedArgumentTool.handler({
                sessionId,
                fieldPath: 'characters',
                argumentName: 'page',
                value: 1,

            });

            expect(JSON.parse(intResult.content[0].text).success).toBe(true);
        });

        it('should handle directive validation correctly', async () => {
            await selectFieldTool.handler({
                sessionId,
                fieldName: 'characters',

            });

            const directiveResult = await setFieldDirectiveTool.handler({
                sessionId,
                fieldPath: 'characters',
                directiveName: 'include',
                argumentName: 'if',
                argumentValue: true,

            });

            expect(JSON.parse(directiveResult.content[0].text).success).toBe(true);
        });

        it('should handle variable validation correctly', async () => {
            const variableResult = await setQueryVariableTool.handler({
                sessionId,
                variableName: '$page',
                variableType: 'Int',
                defaultValue: 1,

            });

            expect(JSON.parse(variableResult.content[0].text).success).toBe(true);
        });
    });
}); 