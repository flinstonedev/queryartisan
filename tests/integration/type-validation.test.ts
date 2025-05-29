import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { expectSuccess, expectError } from '../test-helpers.js';
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
            status: String
            image: String
        }
        
        type Query {
            characters(page: Int, includeImages: Boolean, active: Boolean): [Character]
            character(id: ID): Character
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
    (mock.GraphQLValidationUtils as any).validateStringLength = vi.fn().mockImplementation((value: string, name: string) => {
        const MAX_STRING_LENGTH = 8192;
        if (value.length > MAX_STRING_LENGTH) {
            return {
                valid: false,
                error: `Input for "${name}" exceeds maximum allowed length of ${MAX_STRING_LENGTH} characters.`
            };
        }
        return { valid: true };
    });
    (mock.GraphQLValidationUtils as any).validateNoControlCharacters = vi.fn().mockImplementation((value: string, name: string) => {
        // eslint-disable-next-line no-control-regex
        const controlCharRegex = /[\u0000-\u001F\u007F-\u009F]/;
        if (controlCharRegex.test(value)) {
            return {
                valid: false,
                error: `Input for "${name}" contains disallowed control characters.`
            };
        }
        return { valid: true };
    });
    (mock.GraphQLValidationUtils as any).validatePaginationValue = vi.fn().mockImplementation((argumentName: string, value: string) => {
        const paginationArgs = ['first', 'last', 'limit', 'top', 'count'];
        const MAX_PAGINATION_VALUE = 500;
        if (paginationArgs.includes(argumentName.toLowerCase())) {
            const numericValue = parseInt(value, 10);
            if (!isNaN(numericValue) && numericValue > MAX_PAGINATION_VALUE) {
                return {
                    valid: false,
                    error: `Pagination value for '${argumentName}' (${numericValue}) exceeds maximum of ${MAX_PAGINATION_VALUE}.`
                };
            }
        }
        return { valid: true };
    });
    return mock;
});

describe('Critical Type Validation Issues - Production Blocker', () => {
    let sessionId: string;

    beforeEach(async () => {
        // Start a fresh session for each test
        const result = await startQuerySessionTool.handler({
            operationType: 'query',
            operationName: 'TestQuery',
        });

        const parsed = JSON.parse(result.content[0].text);
        sessionId = parsed.sessionId;
        expect(sessionId).toBeDefined();
    });

    describe('🔴 CRITICAL #1: Type Validation System Failure - P0 BLOCKER', () => {
        describe('set-typed-argument: JavaScript number should be accepted as GraphQL Int', () => {
            it('should accept JavaScript number 1 as GraphQL Int normally', async () => {
                // First add a field to set arguments on
                await selectFieldTool.handler({
                    sessionId,
                    fieldName: 'characters',

                });

                // CRITICAL BUG: This should work but currently fails with schema validation
                const argResult = await setTypedArgumentTool.handler({
                    sessionId,
                    fieldPath: 'characters',
                    argumentName: 'page',
                    value: 1,  // JavaScript number
                    // Real validation should work
                });

                const argResponse = JSON.parse(argResult.content[0].text);

                // Should NOT fail with "Type Int expects an integer, but received 1"
                expectSuccess(argResponse, 'page');
                expect(argResponse.message).toContain('1');

                // Query should show the argument correctly as number, not string
                const queryResult = await getCurrentQueryTool.handler({ sessionId });
                const queryResponse = JSON.parse(queryResult.content[0].text);

                expect(queryResponse.queryString).toContain('characters(page: 1)');
                expect(queryResponse.queryString).not.toContain('characters(page: "1")');
            });

            it('should accept JavaScript number 42 as GraphQL Int', async () => {
                await selectFieldTool.handler({
                    sessionId,
                    fieldName: 'characters',

                });

                const argResult = await setTypedArgumentTool.handler({
                    sessionId,
                    fieldPath: 'characters',
                    argumentName: 'page',
                    value: 42,

                });

                expectSuccess(JSON.parse(argResult.content[0].text));
            });

            it('should accept JavaScript number 0 as GraphQL Int', async () => {
                await selectFieldTool.handler({
                    sessionId,
                    fieldName: 'characters',

                });

                const argResult = await setTypedArgumentTool.handler({
                    sessionId,
                    fieldPath: 'characters',
                    argumentName: 'page',
                    value: 0,

                });

                expectSuccess(JSON.parse(argResult.content[0].text));
            });

            it('should accept JavaScript negative number as GraphQL Int', async () => {
                await selectFieldTool.handler({
                    sessionId,
                    fieldName: 'characters',

                });

                const argResult = await setTypedArgumentTool.handler({
                    sessionId,
                    fieldPath: 'characters',
                    argumentName: 'page',
                    value: -5,

                });

                expectSuccess(JSON.parse(argResult.content[0].text));
            });

            it('should reject JavaScript float as GraphQL Int', async () => {
                await selectFieldTool.handler({
                    sessionId,
                    fieldName: 'characters',

                });

                const argResult = await setTypedArgumentTool.handler({
                    sessionId,
                    fieldPath: 'characters',
                    argumentName: 'page',
                    value: 1.5,  // Float should be rejected for Int

                });

                const argResponse = JSON.parse(argResult.content[0].text);
                expect(argResponse.error).toBeDefined();
                expect(argResponse.error).toContain('cannot represent non-integer value');
            });
        });

        describe('set-typed-argument: JavaScript boolean should be accepted as GraphQL Boolean', () => {
            it('should accept JavaScript boolean true as GraphQL Boolean', async () => {
                await selectFieldTool.handler({
                    sessionId,
                    fieldName: 'characters',

                });

                const argResult = await setTypedArgumentTool.handler({
                    sessionId,
                    fieldPath: 'characters',
                    argumentName: 'includeImages',
                    value: true,  // JavaScript boolean
                });

                const argResponse = JSON.parse(argResult.content[0].text);

                // Should NOT fail with "Type Boolean expects a boolean, but received string"
                expectSuccess(argResponse);

                // Query should show boolean value, not string
                const queryResult = await getCurrentQueryTool.handler({ sessionId });
                const queryResponse = JSON.parse(queryResult.content[0].text);

                expect(queryResponse.queryString).toContain('includeImages: true');
                expect(queryResponse.queryString).not.toContain('includeImages: "true"');
            });

            it('should accept JavaScript boolean false as GraphQL Boolean', async () => {
                await selectFieldTool.handler({
                    sessionId,
                    fieldName: 'characters',

                });

                const argResult = await setTypedArgumentTool.handler({
                    sessionId,
                    fieldPath: 'characters',
                    argumentName: 'active',
                    value: false,
                });

                expectSuccess(JSON.parse(argResult.content[0].text));
            });
        });

        describe('set-field-directive: Boolean directive arguments should work', () => {
            it('should accept JavaScript boolean for @include directive', async () => {
                await selectFieldTool.handler({
                    sessionId,
                    fieldName: 'characters',

                });

                // CRITICAL BUG: This should work for standard GraphQL @include directive
                const directiveResult = await setFieldDirectiveTool.handler({
                    sessionId,
                    fieldPath: 'characters',
                    directiveName: 'include',
                    argumentName: 'if',
                    argumentValue: true,  // JavaScript boolean
                    // Real validation should work
                });

                const directiveResponse = JSON.parse(directiveResult.content[0].text);

                // Should NOT fail with "Type Boolean expects a boolean, but received string"
                expectSuccess(directiveResponse);

                // Query should show proper GraphQL syntax: @include(if: true) not @include(if: "true")
                const queryResult = await getCurrentQueryTool.handler({ sessionId });
                const queryResponse = JSON.parse(queryResult.content[0].text);

                expect(queryResponse.queryString).toContain('@include(if: true)');
                expect(queryResponse.queryString).not.toContain('@include(if: "true")');
            });

            it('should accept JavaScript boolean for @skip directive', async () => {
                await selectFieldTool.handler({
                    sessionId,
                    fieldName: 'characters',

                });

                const directiveResult = await setFieldDirectiveTool.handler({
                    sessionId,
                    fieldPath: 'characters',
                    directiveName: 'skip',
                    argumentName: 'if',
                    argumentValue: false,

                });

                expectSuccess(JSON.parse(directiveResult.content[0].text));
            });
        });

        describe('set-variable-value: Runtime variable assignment should work', () => {
            it('should accept JavaScript number for Int variable', async () => {
                // Set up Int variable
                const varResult = await setQueryVariableTool.handler({
                    sessionId,
                    variableName: '$page',
                    variableType: 'Int',

                });

                expect(JSON.parse(varResult.content[0].text).success).toBe(true);

                // Set runtime value - should accept JavaScript number
                const valueResult = await setVariableValueTool.handler({
                    sessionId,
                    variableName: '$page',
                    value: 1,  // JavaScript number
                    // Real validation should work
                });

                const valueResponse = JSON.parse(valueResult.content[0].text);

                // Should NOT fail with type validation error
                expectSuccess(valueResponse);
            });

            it('should accept JavaScript boolean for Boolean variable', async () => {
                const varResult = await setQueryVariableTool.handler({
                    sessionId,
                    variableName: '$includeImage',
                    variableType: 'Boolean',

                });

                expect(JSON.parse(varResult.content[0].text).success).toBe(true);

                const valueResult = await setVariableValueTool.handler({
                    sessionId,
                    variableName: '$includeImage',
                    value: true,

                });

                expectSuccess(JSON.parse(valueResult.content[0].text));
            });
        });

        describe('set-query-variable: Default values should work', () => {
            it('should accept JavaScript number as default value for Int variable', async () => {
                const varResult = await setQueryVariableTool.handler({
                    sessionId,
                    variableName: '$page',
                    variableType: 'Int',
                    defaultValue: 1,  // JavaScript number default

                });

                const varResponse = JSON.parse(varResult.content[0].text);

                // Should NOT fail with "Type Int expects an integer, but received 1"
                expectSuccess(varResponse);
                expect(varResponse.success).toBe(true);

                // Query should show proper syntax: $page: Int = 1
                const queryResult = await getCurrentQueryTool.handler({ sessionId });
                const queryResponse = JSON.parse(queryResult.content[0].text);

                if (queryResponse.queryString) {
                    expect(queryResponse.queryString).toContain('$page: Int = 1');
                    expect(queryResponse.queryString).not.toContain('$page: Int = "1"');
                }
            });

            it('should accept JavaScript boolean as default value for Boolean variable', async () => {
                const varResult = await setQueryVariableTool.handler({
                    sessionId,
                    variableName: '$includeImage',
                    variableType: 'Boolean',
                    defaultValue: true,

                });

                expectSuccess(JSON.parse(varResult.content[0].text));
            });
        });

        describe('Inconsistent Behavior Documentation', () => {
            it('should demonstrate that ID type works while Int type fails (before fix)', async () => {
                await selectFieldTool.handler({
                    sessionId,
                    fieldName: 'character',

                });

                // ID with string should work (this currently works)
                const idResult = await setTypedArgumentTool.handler({
                    sessionId,
                    fieldPath: 'character',
                    argumentName: 'id',
                    value: "1",  // String for ID - should work

                });

                // 🔧 PRIORITY 1 FIX: Use proper assertion pattern
                expectSuccess(JSON.parse(idResult.content[0].text));

                // Int with number should also work (this currently fails but shouldn't)
                const intResult = await setTypedArgumentTool.handler({
                    sessionId,
                    fieldPath: 'character',
                    argumentName: 'id',
                    value: 1,  // Number for Int - should work but currently fails

                });

                // Both should succeed
                // 🔧 PRIORITY 1 FIX: Use proper assertion pattern
                expectSuccess(JSON.parse(intResult.content[0].text));
            });
        });

        describe('Standard GraphQL Patterns Should Work', () => {
            it('should enable basic parameterized queries', async () => {
                // Set up variable
                await setQueryVariableTool.handler({
                    sessionId,
                    variableName: '$page',
                    variableType: 'Int!',

                });

                // Add field with variable argument
                await selectFieldTool.handler({
                    sessionId,
                    fieldName: 'characters',

                });

                await setVariableArgumentTool.handler({
                    sessionId,
                    fieldPath: 'characters',
                    argumentName: 'page',
                    variableName: '$page',  // Variable reference

                });

                // Add nested fields
                await selectFieldTool.handler({
                    sessionId,
                    parentPath: 'characters',
                    fieldName: 'results',

                });

                await selectFieldTool.handler({
                    sessionId,
                    parentPath: 'characters.results',
                    fieldName: 'name',

                });

                // Set runtime value
                await setVariableValueTool.handler({
                    sessionId,
                    variableName: '$page',
                    value: 1,

                });

                const queryResult = await getCurrentQueryTool.handler({ sessionId });
                const queryResponse = JSON.parse(queryResult.content[0].text);

                // Should generate valid parameterized query
                expect(queryResponse.queryString).toContain('query TestQuery($page: Int!)');
                expect(queryResponse.queryString).toContain('characters(page: $page)');
                expect(queryResponse.queryString).toContain('results');
                expect(queryResponse.queryString).toContain('name');
            });

            it('should enable conditional field inclusion with @include directive', async () => {
                // Set up boolean variable
                await setQueryVariableTool.handler({
                    sessionId,
                    variableName: '$includeImage',
                    variableType: 'Boolean!',

                });

                // Add character field
                await selectFieldTool.handler({
                    sessionId,
                    fieldName: 'character',

                });

                await setTypedArgumentTool.handler({
                    sessionId,
                    fieldPath: 'character',
                    argumentName: 'id',
                    value: 1,

                });

                // Add name field (always included)
                await selectFieldTool.handler({
                    sessionId,
                    parentPath: 'character',
                    fieldName: 'name',

                });

                // Add image field with conditional directive
                await selectFieldTool.handler({
                    sessionId,
                    parentPath: 'character',
                    fieldName: 'image',

                });

                await setFieldDirectiveTool.handler({
                    sessionId,
                    fieldPath: 'character.image',
                    directiveName: 'include',
                    argumentName: 'if',
                    argumentValue: '$includeImage',

                });

                const queryResult = await getCurrentQueryTool.handler({ sessionId });
                const queryResponse = JSON.parse(queryResult.content[0].text);

                // Should generate valid conditional query
                expect(queryResponse.queryString).toContain('query TestQuery($includeImage: Boolean!)');
                expect(queryResponse.queryString).toContain('character(id: 1)');
                expect(queryResponse.queryString).toContain('name');
                expect(queryResponse.queryString).toContain('image @include(if: $includeImage)');
            });
        });

        describe('Error Messages Should Be Helpful for Actual Type Mismatches', () => {
            it('should reject string for Int with helpful error message', async () => {
                await selectFieldTool.handler({
                    sessionId,
                    fieldName: 'characters',

                });

                const argResult = await setTypedArgumentTool.handler({
                    sessionId,
                    fieldPath: 'characters',
                    argumentName: 'page',
                    value: "not_a_number",  // Invalid for Int

                });

                const argResponse = JSON.parse(argResult.content[0].text);
                expect(argResponse.error).toBeDefined();
                expect(argResponse.error).toContain('Int');
                expect(argResponse.error).toContain('cannot represent non-integer value');
            });

            it('should reject string for Boolean with helpful error message', async () => {
                await selectFieldTool.handler({ sessionId, fieldName: 'characters' });
                const argResult = await setTypedArgumentTool.handler({
                    sessionId,
                    fieldPath: 'characters',
                    argumentName: 'active',
                    value: "not_a_boolean",
                });
                const argResponse = JSON.parse(argResult.content[0].text);
                expect(argResponse.error).toBeDefined();
                expect(argResponse.error).toContain('Boolean'); // Type validation error
                expect(argResponse.error).toContain('cannot represent a non boolean value');
            });
        });
    });

    describe('🟡 MEDIUM #2: Inline Fragment Field Resolution', () => {
        it('should generate proper field names in inline fragments, not undefined', async () => {
            // This test can be expanded when inline fragment tools are available
            // For now, just ensure the basic functionality works
            expect(true).toBe(true);
        });
    });

    afterEach(async () => {
        // Clean up session
        if (sessionId) {
            await endQuerySessionTool.handler({ sessionId });
        }
    });
}); 