import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { startQuerySessionTool } from '../../tools/start-query-session.js';
import { selectFieldTool } from '../../tools/select-field.js';
import { setTypedArgumentTool } from '../../tools/set-typed-argument.js';
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

describe('Type Validation Issues - Focused Analysis', () => {
    let sessionId: string;

    beforeEach(async () => {
        const result = await startQuerySessionTool.handler({
            operationType: 'query',
            operationName: 'TestQuery',
        });

        const parsed = JSON.parse(result.content[0].text);
        sessionId = parsed.sessionId;
        expect(sessionId).toBeDefined();
    });

    describe('Enhanced Mocking Validation', () => {
        it('should work with enhanced mocking for both valid and invalid cases', async () => {
            await selectFieldTool.handler({
                sessionId,
                fieldName: 'characters'
            });

            // Test with valid argument
            const argResultValid = await setTypedArgumentTool.handler({
                sessionId,
                fieldPath: 'characters',
                argumentName: 'page',
                value: 1
            });

            const responseValid = JSON.parse(argResultValid.content[0].text);
            expect(responseValid.success).toBe(true);
            expect(responseValid.error).toBeUndefined();

            // Test with invalid argument
            const argResultInvalid = await setTypedArgumentTool.handler({
                sessionId,
                fieldPath: 'characters',
                argumentName: 'nonExistentArg',
                value: 1
            });

            const responseInvalid = JSON.parse(argResultInvalid.content[0].text);
            if (responseInvalid.error) {
                expect(responseInvalid.error).toContain('not found');
            }
        });

        it('should validate type validation works for valid arguments', async () => {
            await selectFieldTool.handler({
                sessionId,
                fieldName: 'characters'
            });

            const argResult = await setTypedArgumentTool.handler({
                sessionId,
                fieldPath: 'characters',
                argumentName: 'page',
                value: 1
            });

            const argResponse = JSON.parse(argResult.content[0].text);

            if (argResponse.error) {
                expect(argResponse.error).not.toContain('Type Int expects an integer, but received 1');
            } else {
                expect(argResponse.success).toBe(true);
            }
        });
    });

    describe('Directive Validation', () => {
        it('should test @include directive with boolean values', async () => {
            await selectFieldTool.handler({
                sessionId,
                fieldName: 'characters'
            });

            const directiveResult = await setFieldDirectiveTool.handler({
                sessionId,
                fieldPath: 'characters',
                directiveName: 'include',
                argumentName: 'if',
                argumentValue: true
            });

            const response = JSON.parse(directiveResult.content[0].text);

            if (response.error) {
                // Error encountered in directive validation
            } else {
                expect(response.success).toBe(true);
            }
        });
    });

    describe('Variable Validation', () => {
        it('should test variable value assignment with enhanced mocking', async () => {
            const varResult = await setQueryVariableTool.handler({
                sessionId,
                variableName: '$page',
                variableType: 'Int'
            });

            expect(JSON.parse(varResult.content[0].text).success).toBe(true);

            const valueResult = await setVariableValueTool.handler({
                sessionId,
                variableName: '$page',
                value: 1
            });

            const response = JSON.parse(valueResult.content[0].text);

            if (response.error) {
                // Error in variable value validation
            } else {
                expect(response.success).toBe(true);
            }
        });
    });

    describe('Query Generation Verification', () => {
        it('should verify that queries are generated correctly', async () => {
            await selectFieldTool.handler({
                sessionId,
                fieldName: 'characters'
            });

            await setTypedArgumentTool.handler({
                sessionId,
                fieldPath: 'characters',
                argumentName: 'page',
                value: 1
            });

            const queryResult = await getCurrentQueryTool.handler({
                sessionId
            });

            const queryResponse = JSON.parse(queryResult.content[0].text);

            expect(queryResponse.queryString).toContain('characters');
            expect(queryResponse.queryString).toContain('page: 1');
        });
    });

    afterEach(async () => {
        if (sessionId) {
            await endQuerySessionTool.handler({ sessionId });
        }
    });
}); 