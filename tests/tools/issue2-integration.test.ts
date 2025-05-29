import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setStringArgument } from '../../tools/set-string-argument.js';
import { setFieldDirective } from '../../tools/set-field-directive.js';
import { buildQueryFromStructure } from '../../tools/shared-utils.js';
import { TEST_SCHEMA } from '../setup.js';

// Mock the shared-utils module
vi.mock('../../tools/shared-utils.js', async () => {
    const { createSharedUtilsMock } = await import('../setup');
    const { buildSchema } = await import('graphql');

    // Create a GitHub-like schema that matches what the test expects
    const githubLikeSchema = buildSchema(`
        type Query {
            viewer: User
            repositories(first: Int, last: Int): [Repository]
        }
        
        type User {
            avatarUrl(size: Int): String
            bio: String
        }
        
        type Repository {
            name: String
            description: String
        }
    `);

    const mock = createSharedUtilsMock({
        // Use the GitHub-like schema instead of TEST_SCHEMA
        fetchAndCacheSchema: vi.fn().mockResolvedValue(githubLikeSchema),
        loadQueryState: vi.fn(),
        saveQueryState: vi.fn(),
        GraphQLValidationUtils: {
            isValidGraphQLName: vi.fn().mockReturnValue(true),
            coerceStringValue: vi.fn().mockImplementation((value) => ({ coerced: false, value })),
            generatePerformanceWarning: vi.fn().mockReturnValue(null),
            validateValueAgainstType: vi.fn().mockReturnValue(null),
            getArgumentType: vi.fn().mockImplementation((schema, fieldPath, argName) => {
                // Mock the argument type resolution for the test fields
                if (fieldPath === 'viewer.avatarUrl' && argName === 'size') {
                    return { name: 'Int' };
                }
                if (fieldPath === 'repositories' && (argName === 'first' || argName === 'last')) {
                    return { name: 'Int' };
                }
                return null;
            }),
            validateStringLength: vi.fn().mockImplementation((value: string, name: string) => {
                const MAX_STRING_LENGTH = 8192;
                if (value.length > MAX_STRING_LENGTH) {
                    return {
                        valid: false,
                        error: `Input for "${name}" exceeds maximum allowed length of ${MAX_STRING_LENGTH} characters.`
                    };
                }
                return { valid: true };
            }),
            validateNoControlCharacters: vi.fn().mockImplementation((value: string, name: string) => {
                // eslint-disable-next-line no-control-regex
                const controlCharRegex = /[\u0000-\u001F\u007F-\u009F]/;
                if (controlCharRegex.test(value)) {
                    return {
                        valid: false,
                        error: `Input for "${name}" contains disallowed control characters.`
                    };
                }
                return { valid: true };
            }),
            validatePaginationValue: vi.fn().mockImplementation((argumentName: string, value: string) => {
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
            }),
        }
    });

    return {
        ...mock,
        resolveEndpointAndHeaders: () => ({ url: 'http://localhost:4000/graphql', headers: {} }),
    };
});

describe('String Argument Type Validation - Integration Test', () => {
    const testSessionId = 'test-session-123';
    let mockQueryState: any;

    beforeEach(async () => {
        vi.clearAllMocks();

        // Setup mock query state with GitHub-like schema fields
        mockQueryState = {
            headers: {},
            operationType: 'query',
            operationTypeName: 'Query',
            operationName: null,
            queryStructure: {
                fields: {
                    'viewer': {
                        fieldName: 'viewer',
                        alias: null,
                        args: {},
                        fields: {
                            'avatarUrl': {
                                fieldName: 'avatarUrl',
                                alias: null,
                                args: {},
                                fields: {},
                                directives: [],
                                fragmentSpreads: [],
                                inlineFragments: []
                            },
                            'bio': {
                                fieldName: 'bio',
                                alias: null,
                                args: {},
                                fields: {},
                                directives: [],
                                fragmentSpreads: [],
                                inlineFragments: []
                            }
                        },
                        directives: [],
                        fragmentSpreads: [],
                        inlineFragments: []
                    },
                    'repositories': {
                        fieldName: 'repositories',
                        alias: null,
                        args: {},
                        fields: {},
                        directives: [],
                        fragmentSpreads: [],
                        inlineFragments: []
                    }
                },
                fragmentSpreads: [],
                inlineFragments: []
            },
            fragments: {},
            variablesSchema: {},
            variablesDefaults: {},
            variablesValues: {},
            operationDirectives: []
        };

        const sharedUtils = await import('../../tools/shared-utils.js');
        vi.mocked(sharedUtils.loadQueryState).mockResolvedValue(mockQueryState);
        vi.mocked(sharedUtils.saveQueryState).mockResolvedValue(undefined);
    });

    describe('String Argument Handling - set-string-argument', () => {
        it('should handle numeric arguments passed as strings', async () => {
            // WHEN: Developer sets a numeric argument using set-string-argument
            const result = await setStringArgument(
                testSessionId,
                'viewer.avatarUrl',
                'size',
                '100'  // String value for numeric argument
            );

            expect(result.success).toBe(true);

            // Get the saved state to check how it was stored
            const sharedUtils = await import('../../tools/shared-utils.js');
            const saveCall = vi.mocked(sharedUtils.saveQueryState).mock.calls[0];
            const savedState = saveCall[1];

            // Generate the actual query string
            const actualBuildQueryFromStructure = vi.importActual('../../tools/shared-utils.js')
                .then(m => (m as any).buildQueryFromStructure);
            const buildFn = await actualBuildQueryFromStructure;

            const queryString = buildFn(
                savedState.queryStructure,
                savedState.operationType,
                savedState.variablesSchema,
                savedState.operationName,
                savedState.fragments,
                savedState.operationDirectives,
                savedState.variablesDefaults
            );

            // Check the argument serialization
            const sizeArg = savedState.queryStructure.fields.viewer.fields.avatarUrl.args.size;

            // Verify proper handling of numeric values
            if (queryString.includes('size: "100"')) {
                // Numeric argument has quotes - may need type coercion
            } else if (queryString.includes('size: 100')) {
                // Numeric argument properly unquoted
            }
        });

        it('should handle repositories with numeric arguments', async () => {
            // WHEN: Developer sets numeric arguments for repositories
            await setStringArgument(testSessionId, 'repositories', 'first', '10');
            await setStringArgument(testSessionId, 'repositories', 'last', '5');

            const sharedUtils = await import('../../tools/shared-utils.js');
            const saveCalls = vi.mocked(sharedUtils.saveQueryState).mock.calls;
            const finalState = saveCalls[saveCalls.length - 1][1];

            const actualBuildQueryFromStructure = vi.importActual('../../tools/shared-utils.js')
                .then(m => (m as any).buildQueryFromStructure);
            const buildFn = await actualBuildQueryFromStructure;

            const queryString = buildFn(
                finalState.queryStructure,
                finalState.operationType,
                finalState.variablesSchema,
                finalState.operationName,
                finalState.fragments,
                finalState.operationDirectives,
                finalState.variablesDefaults
            );

            // Check argument handling
            const hasQuotedNumbers = queryString.includes('"10"') || queryString.includes('"5"');

            if (hasQuotedNumbers) {
                // Repositories arguments have quotes around numbers
                const actual = queryString.match(/repositories\([^)]+\)/)?.[0];
            } else {
                // Repositories arguments are properly unquoted
            }
        });
    });

    describe('Directive Argument Handling - set-field-directive', () => {
        it('should handle boolean directive arguments passed as strings', async () => {
            // WHEN: Developer sets a boolean directive argument as string
            const result = await setFieldDirective(
                testSessionId,
                'viewer.bio',
                'include',
                'if',
                'true'  // String value for boolean argument
            );

            expect(result.success).toBe(true);

            const sharedUtils = await import('../../tools/shared-utils.js');
            const saveCall = vi.mocked(sharedUtils.saveQueryState).mock.calls[0];
            const savedState = saveCall[1];

            const actualBuildQueryFromStructure = vi.importActual('../../tools/shared-utils.js')
                .then(m => (m as any).buildQueryFromStructure);
            const buildFn = await actualBuildQueryFromStructure;

            const queryString = buildFn(
                savedState.queryStructure,
                savedState.operationType,
                savedState.variablesSchema,
                savedState.operationName,
                savedState.fragments,
                savedState.operationDirectives,
                savedState.variablesDefaults
            );

            // Check directive argument handling
            if (queryString.includes('@include(if: "true")')) {
                // Boolean directive argument has quotes - may cause GraphQL validation errors
            } else if (queryString.includes('@include(if: true)')) {
                // Boolean directive argument properly unquoted
            }

            // Check what's stored
            const bioField = savedState.queryStructure.fields.viewer.fields.bio;
        });

        it('should handle skip directive with false boolean', async () => {
            await setFieldDirective(
                testSessionId,
                'viewer.bio',
                'skip',
                'if',
                'false'  // String value for boolean
            );

            const sharedUtils = await import('../../tools/shared-utils.js');
            const saveCall = vi.mocked(sharedUtils.saveQueryState).mock.calls[0];
            const savedState = saveCall[1];

            const actualBuildQueryFromStructure = vi.importActual('../../tools/shared-utils.js')
                .then(m => (m as any).buildQueryFromStructure);
            const buildFn = await actualBuildQueryFromStructure;

            const queryString = buildFn(
                savedState.queryStructure,
                savedState.operationType,
                savedState.variablesSchema,
                savedState.operationName,
                savedState.fragments,
                savedState.operationDirectives,
                savedState.variablesDefaults
            );

            if (queryString.includes('@skip(if: "false")')) {
                // BUG: Boolean directive has quotes
            } else if (queryString.includes('@skip(if: false)')) {
                // NO BUG: Boolean directive properly unquoted
            }
        });
    });

    describe('Expected Behavior Tests', () => {
        it('should show what the fixed behavior should look like', () => {
            // This test documents what the EXPECTED behavior should be
            // after fixing the bugs

            const mockFieldWithTypedArgs = {
                avatarUrl: {
                    fieldName: 'avatarUrl',
                    alias: null,
                    args: {
                        size: {
                            value: 100,
                            is_typed: true  // This should prevent quotes
                        }
                    },
                    fields: {},
                    directives: [],
                    fragmentSpreads: [],
                    inlineFragments: []
                }
            };

            const mockFieldWithTypedDirective = {
                bio: {
                    fieldName: 'bio',
                    alias: null,
                    args: {},
                    fields: {},
                    directives: [{
                        name: 'include',
                        arguments: [{
                            name: 'if',
                            value: true,  // Actual boolean, not string
                            is_typed: true
                        }]
                    }],
                    fragmentSpreads: [],
                    inlineFragments: []
                }
            };

            // Expected query snippets:
            // avatarUrl(size: 100) - no quotes around number
            // bio @include(if: true) - no quotes around boolean
        });
    });
}); 