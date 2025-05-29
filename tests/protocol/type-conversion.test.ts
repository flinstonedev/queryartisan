import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { startQuerySessionTool } from '../../tools/start-query-session.js';
import { selectFieldTool } from '../../tools/select-field.js';
import { setTypedArgumentTool } from '../../tools/set-typed-argument.js';
import { setFieldDirectiveTool } from '../../tools/set-field-directive.js';
import { setQueryVariableTool } from '../../tools/set-query-variable.js';
import { setVariableValueTool } from '../../tools/set-variable-value.js';
import { getCurrentQueryTool } from '../../tools/get-current-query.js';
import { endQuerySessionTool } from '../../tools/end-query-session.js';

// Monkey patch the validation function to debug what types it receives
import { GraphQLValidationUtils } from '../../tools/shared-utils.js';

const originalValidateValueAgainstType = GraphQLValidationUtils.validateValueAgainstType.bind(GraphQLValidationUtils);

let debugLog: Array<{ value: any, type: string, jsType: string, isInteger: boolean, stringValue: string, actualValue: string }> = [];

GraphQLValidationUtils.validateValueAgainstType = function (value: any, type: any): string | null {
    const jsType = typeof value;
    const isInteger = typeof value === 'number' && Number.isInteger(value);
    const stringValue = String(value);
    const actualValue = JSON.stringify(value);

    debugLog.push({
        value,
        type: type.name || type.toString(),
        jsType,
        isInteger,
        stringValue,
        actualValue
    });

    const result = originalValidateValueAgainstType(value, type);
    if (result === null) {
        return result;
    } else {
        return result;
    }
};

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
            characters(page: Int, active: Boolean): [Character]
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

describe('Type Conversion Debug - Understanding the Real Issue', () => {
    let sessionId: string;

    beforeEach(async () => {
        debugLog = []; // Reset debug log for each test

        const result = await startQuerySessionTool.handler({
            operationType: 'query',
            operationName: 'DebugQuery',
        });

        const parsed = JSON.parse(result.content[0].text);
        sessionId = parsed.sessionId;
        expect(sessionId).toBeDefined();
    });

    afterEach(async () => {
        if (sessionId) {
            await endQuerySessionTool.handler({ sessionId });
        }
        // Restore original function
        GraphQLValidationUtils.validateValueAgainstType = originalValidateValueAgainstType;
    });

    describe('🔍 Type Debugging - What the validation function actually receives', () => {
        it('should debug what type set-typed-argument receives for JavaScript number 1', async () => {
            const testValue = 1;

            await selectFieldTool.handler({
                sessionId,
                fieldName: 'characters',

            });

            const result = await setTypedArgumentTool.handler({
                sessionId,
                fieldPath: 'characters',
                argumentName: 'page',
                value: testValue,

            });

            const response = JSON.parse(result.content[0].text);

            // Find the Int validation entry
            const intValidationEntry = debugLog.find(entry => entry.type === 'Int');
            if (intValidationEntry) {
                if (intValidationEntry.jsType !== 'number') {
                    return;
                }
            } else {
                return;
            }
        });

        it('should debug what type set-field-directive receives for JavaScript boolean true', async () => {
            const testValue = true;

            await selectFieldTool.handler({
                sessionId,
                fieldName: 'characters',

            });

            const result = await setFieldDirectiveTool.handler({
                sessionId,
                fieldPath: 'characters',
                directiveName: 'include',
                argumentName: 'if',
                argumentValue: testValue,

            });

            const response = JSON.parse(result.content[0].text);
        });

        it('should debug what type set-query-variable receives for default value', async () => {
            const testValue = 1;

            const result = await setQueryVariableTool.handler({
                sessionId,
                variableName: '$page',
                variableType: 'Int',
                defaultValue: testValue,

            });

            const response = JSON.parse(result.content[0].text);
        });

        it('should debug what type set-variable-value receives for runtime value', async () => {
            // Setup variable first
            await setQueryVariableTool.handler({
                sessionId,
                variableName: '$page',
                variableType: 'Int',

            });

            const testValue = 1;

            const result = await setVariableValueTool.handler({
                sessionId,
                variableName: '$page',
                value: testValue,

            });

            const response = JSON.parse(result.content[0].text);
        });
    });

    describe('🔍 Testing MCP Protocol Type Conversion', () => {
        it('should test if the MCP protocol is converting types', async () => {
            const testValues = [1, 1, 1, 1, 1]; // Test same value multiple times

            for (let i = 0; i < testValues.length; i++) {
                const value = testValues[i];

                await selectFieldTool.handler({
                    sessionId,
                    fieldName: 'characters',

                });

                const result = await setTypedArgumentTool.handler({
                    sessionId,
                    fieldPath: 'characters',
                    argumentName: 'page',
                    value: value,

                });

                const response = JSON.parse(result.content[0].text);

                if (response.success) {
                    continue;
                } else {
                    if (response.error && response.error.includes('Type Int expects an integer, but received')) {
                        return;
                    }
                }
            }
        });
    });
}); 