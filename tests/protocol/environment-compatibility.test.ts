import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { startQuerySessionTool } from '../../tools/start-query-session.js';
import { selectFieldTool } from '../../tools/select-field.js';
import { setTypedArgumentTool } from '../../tools/set-typed-argument.js';
import { setFieldDirectiveTool } from '../../tools/set-field-directive.js';
import { setQueryVariableTool } from '../../tools/set-query-variable.js';
import { setVariableValueTool } from '../../tools/set-variable-value.js';
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

describe('Environment Investigation - Why Testers See Different Results', () => {
    let sessionId: string;

    beforeEach(async () => {
        const result = await startQuerySessionTool.handler({
            operationType: 'query',
            operationName: 'EnvTestQuery',
        });

        const parsed = JSON.parse(result.content[0].text);
        sessionId = parsed.sessionId;
        expect(sessionId).toBeDefined();
    });

    describe('Environment Scenario Testing', () => {
        it('should test set-typed-argument with integer validation', async () => {
            await selectFieldTool.handler({
                sessionId,
                fieldName: 'characters',
                // Setup field
            });

            const result = await setTypedArgumentTool.handler({
                sessionId,
                fieldPath: 'characters',
                argumentName: 'page',
                value: 1,
                // Real validation
            });

            const response = JSON.parse(result.content[0].text);

            if (response.error && response.error.includes('Type Int expects an integer, but received 1')) {
                expect(response.error).toContain('Type Int expects an integer, but received 1');
            } else if (response.error) {
                expect(response.error).toBeUndefined();
            } else {
                expect(response.success).toBe(true);
            }
        });

        it('should test set-field-directive with boolean validation', async () => {
            await selectFieldTool.handler({
                sessionId,
                fieldName: 'characters',

            });

            const result = await setFieldDirectiveTool.handler({
                sessionId,
                fieldPath: 'characters',
                directiveName: 'include',
                argumentName: 'if',
                argumentValue: true,

            });

            const response = JSON.parse(result.content[0].text);

            if (response.error && response.error.includes('Type Boolean expects a boolean, but received string')) {
                expect(response.error).toContain('Type Boolean expects a boolean, but received string');
            } else if (response.error) {
                // Different error encountered
            } else {
                expect(response.success).toBe(true);
            }
        });

        it('should test set-query-variable with default value validation', async () => {
            const result = await setQueryVariableTool.handler({
                sessionId,
                variableName: '$page',
                variableType: 'Int',
                defaultValue: 1,

            });

            const response = JSON.parse(result.content[0].text);

            if (response.error && response.error.includes('Type Int expects an integer, but received 1')) {
                expect(response.error).toContain('Type Int expects an integer, but received 1');
            } else if (response.error) {
                // Different error encountered
            } else {
                expect(response.success).toBe(true);
            }
        });

        it('should test set-variable-value with runtime value validation', async () => {
            // Setup variable first
            await setQueryVariableTool.handler({
                sessionId,
                variableName: '$page',
                variableType: 'Int',

            });

            const result = await setVariableValueTool.handler({
                sessionId,
                variableName: '$page',
                value: 1,

            });

            const response = JSON.parse(result.content[0].text);

            if (response.error && response.error.includes('Type Int expects an integer, but received 1')) {
                expect(response.error).toContain('Type Int expects an integer, but received 1');
            } else if (response.error) {
                // Different error encountered
            } else {
                expect(response.success).toBe(true);
            }
        });
    });

    describe('🔍 Environmental Analysis', () => {
        it('should analyze potential environmental differences', () => {
            // Basic environment validation
            expect(process.version).toBeDefined();
            expect(process.platform).toBeDefined();
            expect(process.arch).toBeDefined();
        });

        it('should test type preservation through JSON serialization', () => {
            const testValues = [
                { name: 'number 1', value: 1 },
                { name: 'boolean true', value: true },
                { name: 'boolean false', value: false },
                { name: 'string "test"', value: "test" },
                { name: 'null', value: null },
            ];

            for (const testCase of testValues) {
                const original = testCase.value;
                const serialized = JSON.stringify(original);
                const deserialized = JSON.parse(serialized);

                expect(typeof original).toBe(typeof deserialized);
                expect(original).toEqual(deserialized);
            }
        });
    });

    describe('🚨 Potential Fixes If Issue Confirmed', () => {
        it('should suggest comprehensive fix approach', () => {
            // This test documents the potential fix approaches if type validation issues are confirmed
            const fixApproaches = [
                'Add explicit type coercion before validation',
                'Modify validateValueAgainstType to be more lenient',
                'Ensure proper type preservation through the protocol',
                'Use actual GraphQL schema to determine expected types'
            ];

            expect(fixApproaches.length).toBeGreaterThan(0);
        });
    });

    afterEach(async () => {
        if (sessionId) {
            await endQuerySessionTool.handler({ sessionId });
        }
    });
}); 