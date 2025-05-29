import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as sharedUtils from '../../tools/shared-utils';
import { buildSchema } from 'graphql';

// Mock schema that includes standard and custom directives
const mockSchema = buildSchema(`
    directive @include(if: Boolean!) on FIELD | FRAGMENT_SPREAD | INLINE_FRAGMENT
    directive @skip(if: Boolean!) on FIELD | FRAGMENT_SPREAD | INLINE_FRAGMENT
    directive @deprecated(reason: String) on FIELD_DEFINITION | ENUM_VALUE
    directive @myDirective(arg1: String, arg2: Int) on FIELD
    directive @anotherDirective(argA: Boolean) on FIELD
    directive @live on QUERY

    type Query {
        user: User
        status: String
    }

    type User {
        id: ID
        name: String
    }
`);

vi.mock('../../tools/shared-utils', async () => {
    const { createSharedUtilsMock } = await import('../setup');

    return createSharedUtilsMock({
        loadQueryState: vi.fn(),
        saveQueryState: vi.fn(),
        fetchAndCacheSchema: vi.fn(),
    });
});

describe('Directive Handling', () => {
    beforeEach(() => {
        vi.mocked(sharedUtils.loadQueryState).mockImplementation(async () => ({
            headers: {},
            queryStructure: {
                fields: {
                    user: {
                        directives: [],
                    },
                    status: {
                        directives: []
                    }
                },
            },
            variablesSchema: {
                '$myVar': 'Boolean!',
                '$includeStatus': 'Boolean!',
                '$skipStatus': 'Boolean!'
            },
            operationDirectives: [],
        } as any));
        vi.mocked(sharedUtils.saveQueryState).mockClear();
        vi.mocked(sharedUtils.fetchAndCacheSchema).mockImplementation(async () => mockSchema);
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

        vi.mocked(sharedUtils.loadQueryState).mockImplementation(async () => queryState);
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

        vi.mocked(sharedUtils.loadQueryState).mockImplementation(async () => queryState);
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

        vi.mocked(sharedUtils.loadQueryState).mockImplementation(async () => queryState);
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
    beforeEach(() => {
        // Reset mocks for error handling tests
        vi.mocked(sharedUtils.loadQueryState).mockImplementation(async () => null);
        vi.mocked(sharedUtils.saveQueryState).mockClear();
        vi.mocked(sharedUtils.fetchAndCacheSchema).mockImplementation(async () => mockSchema);
    });

    it('should return an error for a non-existent field path', async () => {
        const { setFieldDirective } = await import('../../tools/set-field-directive');
        const result = await setFieldDirective('test-session', 'non.existent', 'include', 'if', true);
        expect(result.error).toContain("Session not found");
    });

    it('should return an error for an invalid directive name', async () => {
        // Set up a valid session for this test
        vi.mocked(sharedUtils.loadQueryState).mockImplementation(async () => ({
            headers: {},
            queryStructure: {
                fields: {
                    user: {
                        directives: [],
                    }
                },
            },
            variablesSchema: {},
            operationDirectives: [],
        } as any));

        const { setFieldDirective } = await import('../../tools/set-field-directive');
        const result = await setFieldDirective('test-session', 'user', 'invalid-directive!', 'if', true);
        expect(result.error).toContain('Invalid directive name "invalid-directive!".');
    });
});
