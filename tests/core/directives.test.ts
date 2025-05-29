import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as sharedUtils from '../../tools/shared-utils';

vi.mock('../../tools/shared-utils', async () => {
    const { createSharedUtilsMock } = await import('../setup');
    const { buildSchema } = await import('graphql');

    const mockQueryState = {
        headers: {},
        operationType: 'query',
        queryStructure: {
            fields: {
                user: {
                    fieldName: 'user',
                    alias: null,
                    args: {},
                    fields: {},
                    directives: [],
                    fragmentSpreads: [],
                    inlineFragments: []
                },
            },
            fragmentSpreads: [],
            inlineFragments: []
        },
        variablesSchema: {
            '$myVar': 'Boolean!',
            '$skipStatus': 'Boolean!',
            '$includeStatus': 'Boolean!'
        }
    };

    const testSchema = buildSchema(`
        directive @include(if: Boolean!) on FIELD | FRAGMENT_SPREAD | INLINE_FRAGMENT
        directive @skip(if: Boolean!) on FIELD | FRAGMENT_SPREAD | INLINE_FRAGMENT  
        directive @deprecated(reason: String = "No longer supported") on FIELD_DEFINITION | ENUM_VALUE
        directive @live on QUERY | MUTATION | SUBSCRIPTION
        directive @myDirective(arg1: String, arg2: Int) on FIELD
        directive @anotherDirective(argA: Boolean) on FIELD
        
        type Query {
            user: String
            status: String
        }
    `);

    return createSharedUtilsMock({
        loadQueryState: vi.fn().mockResolvedValue(mockQueryState),
        fetchAndCacheSchema: vi.fn().mockResolvedValue(testSchema),
        saveQueryState: vi.fn().mockImplementation(async (sid, qs) => {
            Object.assign(mockQueryState, qs);
        }),
    });
});

describe('Directive Handling', () => {
    beforeEach(() => {
        // Reset mock query state before each test
        vi.mocked(sharedUtils.loadQueryState).mockResolvedValue({
            sessionId: 'test-session',
            headers: {},
            operationType: 'query',
            operationTypeName: 'Query',
            operationName: 'TestQuery',
            queryStructure: {
                fields: {
                    user: {
                        fieldName: 'user',
                        alias: null,
                        args: {},
                        fields: {},
                        directives: [],
                        fragmentSpreads: [],
                        inlineFragments: []
                    },
                },
                fragmentSpreads: [],
                inlineFragments: []
            },
            variablesSchema: {
                '$myVar': 'Boolean!',
                '$skipStatus': 'Boolean!',
                '$includeStatus': 'Boolean!'
            },
            fragments: {},
            variablesValues: {},
            variablesDefaults: {},
            operationDirectives: [],
            createdAt: new Date().toISOString()
        } as any);
    });

    it('should set a directive on a field', async () => {
        const { setFieldDirective } = await import('../../tools/set-field-directive');
        const result = await setFieldDirective('test-session', 'user', 'include', 'if', '$myVar');
        expect(result.success).toBe(true);
        expect(result.message).toContain("Directive '@include' applied to field at path 'user'");
    });

    it('should set a directive on the operation', async () => {
        const { setOperationDirective } = await import('../../tools/set-operation-directive');
        const result = await setOperationDirective('test-session', 'live');
        expect(result.success).toBe(true);
        expect(result.message).toContain("Operation directive '@live' applied to query.");
    });

    it('should generate directive with arguments when argument provided', async () => {
        const { setFieldDirective } = await import('../../tools/set-field-directive');
        const { buildQueryFromStructure } = await import('../../tools/shared-utils');

        let queryState: any = {
            operationType: 'query',
            headers: {},
            queryStructure: {
                fields: {
                    status: {
                        fieldName: 'status',
                        directives: []
                    }
                }
            },
            variablesSchema: {
                '$includeStatus': 'Boolean!'
            }
        };

        vi.mocked(sharedUtils.loadQueryState).mockResolvedValue(queryState);
        vi.mocked(sharedUtils.saveQueryState).mockImplementation(async (sid, qs) => {
            queryState = qs;
        });

        // Test with argument
        const result = await setFieldDirective('test-session', 'status', 'include', 'if', '$includeStatus');
        expect(result.success).toBe(true);

        const query = buildQueryFromStructure(queryState.queryStructure, 'query', {});
        expect(query).toContain('@include(if: $includeStatus)');
        expect(query).not.toContain('@include @include');
    });

    it('should generate directive without parentheses when no arguments provided', async () => {
        const { setFieldDirective } = await import('../../tools/set-field-directive');
        const { buildQueryFromStructure } = await import('../../tools/shared-utils');

        let queryState: any = {
            operationType: 'query',
            headers: {},
            queryStructure: {
                fields: {
                    status: {
                        fieldName: 'status',
                        directives: []
                    }
                }
            }
        };

        vi.mocked(sharedUtils.loadQueryState).mockResolvedValue(queryState);
        vi.mocked(sharedUtils.saveQueryState).mockImplementation(async (sid, qs) => {
            queryState = qs;
        });

        // Test without argument
        const result = await setFieldDirective('test-session', 'status', 'deprecated');
        expect(result.success).toBe(true);

        const query = buildQueryFromStructure(queryState.queryStructure, 'query', {});
        expect(query).toContain('@deprecated');
        expect(query).not.toContain('@deprecated()');
    });

    it('should handle multiple arguments on a field directive', async () => {
        const { setFieldDirective } = await import('../../tools/set-field-directive');
        const { buildQueryFromStructure } = await import('../../tools/shared-utils');

        let queryState: any = {
            operationType: 'query',
            headers: {},
            queryStructure: {
                fields: {
                    user: {
                        fieldName: 'user',
                        directives: []
                    }
                }
            }
        };

        vi.mocked(sharedUtils.loadQueryState).mockResolvedValue(queryState);
        vi.mocked(sharedUtils.saveQueryState).mockImplementation(async (sid, qs) => {
            queryState = qs;
        });

        const result1 = await setFieldDirective('test-session', 'user', 'myDirective', 'arg1', 'value1');
        const result2 = await setFieldDirective('test-session', 'user', 'myDirective', 'arg2', 123);
        const result3 = await setFieldDirective('test-session', 'user', 'anotherDirective', 'argA', true);

        expect(result1.success).toBe(true);
        expect(result2.success).toBe(true);
        expect(result3.success).toBe(true);

        const queryString = buildQueryFromStructure(queryState.queryStructure, 'query', {});
        const cleanedQuery = queryString.replace(/\s+/g, ' ');

        expect(cleanedQuery).toContain('@myDirective(arg1: "value1", arg2: 123)');
        expect(cleanedQuery).toContain('@anotherDirective(argA: true)');
    });

    describe('Critical Directive Argument Validation', () => {
        it('should support directive arguments for @include directive', async () => {
            const { setFieldDirective } = await import('../../tools/set-field-directive');
            const result = await setFieldDirective(
                'test-session',
                'user',
                'include',
                'if',
                '$myVar'
            );

            expect(result.success).toBe(true);
            expect(result.error).toBeUndefined();
            expect(result.message).toContain("Directive '@include' applied to field at path 'user'");
            expect(result.argumentName).toBe('if');
            expect(result.argumentValue).toBe('$myVar');
        });

        it('should support directive arguments for @skip directive', async () => {
            const { setFieldDirective } = await import('../../tools/set-field-directive');
            const result = await setFieldDirective(
                'test-session',
                'user',
                'skip',
                'if',
                '$skipStatus'
            );

            expect(result.success).toBe(true);
            expect(result.error).toBeUndefined();
            expect(result.argumentName).toBe('if');
            expect(result.argumentValue).toBe('$skipStatus');
        });

        it('should support boolean literal values for directive arguments', async () => {
            const { setFieldDirective } = await import('../../tools/set-field-directive');
            const result = await setFieldDirective(
                'test-session',
                'user',
                'include',
                'if',
                true
            );

            expect(result.success).toBe(true);
            expect(result.error).toBeUndefined();
            expect(result.argumentName).toBe('if');
            expect(result.argumentValue).toBe(true);
        });

        it('should support string literal values for directive arguments', async () => {
            const { setFieldDirective } = await import('../../tools/set-field-directive');
            const result = await setFieldDirective(
                'test-session',
                'user',
                'deprecated',
                'reason',
                'Use newField instead'
            );

            expect(result.success).toBe(true);
            expect(result.error).toBeUndefined();
            expect(result.argumentName).toBe('reason');
            expect(result.argumentValue).toBe('Use newField instead');
        });
    });
});

describe('Directives - Error Handling', () => {
    it('should return an error for a non-existent field path', async () => {
        const { setFieldDirective } = await import('../../tools/set-field-directive');
        const result = await setFieldDirective('test-session', 'non.existent', 'include', 'if', true);
        expect(result.error).toContain("Field at path 'non.existent' not found.");
    });

    it('should return an error for an invalid directive name', async () => {
        const { setFieldDirective } = await import('../../tools/set-field-directive');
        const result = await setFieldDirective('test-session', 'user', 'invalid-directive!', 'if', true);
        expect(result.error).toContain('Invalid directive name "invalid-directive!".');
    });
}); 
