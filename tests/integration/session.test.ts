import { describe, it, expect, vi } from 'vitest';
import { createQuerySession } from '../../tools/start-query-session';
import { endQuerySession } from '../../tools/end-query-session';
import { getCurrentQuery } from '../../tools/get-current-query';
import * as sharedUtils from '../../tools/shared-utils';

vi.mock('../../tools/shared-utils', async () => {
    const { createSharedUtilsMock } = await import('../setup');
    return createSharedUtilsMock({
        fetchAndCacheSchema: vi.fn().mockResolvedValue({
            getQueryType: () => ({ name: 'Query' }),
            getMutationType: () => ({ name: 'Mutation' }),
            getSubscriptionType: () => null,
        }),
    });
});

describe('Session Management', () => {

    it('should create a query session', async () => {
        const result = await createQuerySession('query', 'TestQuery');
        expect(result.sessionId).toBe('test-session-id');
        expect(result.operationType).toBe('query');
        expect(result.operationName).toBe('TestQuery');
        expect(sharedUtils.saveQueryState).toHaveBeenCalled();
    });

    it('should end a query session', async () => {
        const mockSessionId = 'test-session-id';
        vi.mocked(sharedUtils.loadQueryState).mockResolvedValue({
            sessionId: mockSessionId,
            operationType: 'query',
            operationName: 'TestQuery',
            createdAt: new Date().toISOString(),
        } as any);
        vi.mocked(sharedUtils.deleteQueryState).mockResolvedValue(true);

        const result = await endQuerySession(mockSessionId);

        expect(result.sessionInfo?.sessionId).toBe(mockSessionId);
        expect(result.message).toContain('ended successfully');
        expect(sharedUtils.deleteQueryState).toHaveBeenCalledWith(mockSessionId);
    });

});

describe('Get Current Query', () => {
    const mockQueryState = {
        sessionId: 'test-session-id',
        operationType: 'query',
        operationName: 'GetUser',
        queryStructure: {
            fields: {
                user: {
                    args: { id: '$userId' },
                    fields: {
                        id: {},
                        name: {},
                        email: {}
                    }
                }
            }
        },
        variablesSchema: { '$userId': 'ID!' },
        fragments: {},
        operationDirectives: [],
        variablesDefaults: {},
        createdAt: new Date().toISOString(),
    };

    it('should get the current query string and variables schema', async () => {
        vi.mocked(sharedUtils.loadQueryState).mockResolvedValue(mockQueryState as any);
        vi.mocked(sharedUtils.buildQueryFromStructure).mockReturnValue(
            'query GetUser($userId: ID!) {\n  user(id: $userId) {\n    id\n    name\n    email\n  }\n}'
        );

        const result = await getCurrentQuery('test-session-id');

        expect(result.queryString).toBeDefined();
        expect(result.queryString).toContain('query GetUser($userId: ID!)');
        expect(result.queryString).toContain('user(id: $userId)');
        expect(result.variables_schema).toEqual({ '$userId': 'ID!' });
        expect(result.error).toBeUndefined();
        expect(sharedUtils.buildQueryFromStructure).toHaveBeenCalledWith(
            mockQueryState.queryStructure,
            mockQueryState.operationType,
            mockQueryState.variablesSchema,
            mockQueryState.operationName,
            mockQueryState.fragments,
            mockQueryState.operationDirectives,
            mockQueryState.variablesDefaults
        );
    });

    it('should handle query without variables', async () => {
        const simpleQueryState = {
            ...mockQueryState,
            variablesSchema: {},
            queryStructure: {
                fields: {
                    users: {
                        fields: {
                            id: {},
                            name: {}
                        }
                    }
                }
            }
        };

        vi.mocked(sharedUtils.loadQueryState).mockResolvedValue(simpleQueryState as any);
        vi.mocked(sharedUtils.buildQueryFromStructure).mockReturnValue(
            'query GetUser {\n  users {\n    id\n    name\n  }\n}'
        );

        const result = await getCurrentQuery('test-session-id');

        expect(result.queryString).toBeDefined();
        expect(result.queryString).toContain('users');
        expect(result.variables_schema).toEqual({});
        expect(result.error).toBeUndefined();
    });

    it('should handle query with fragments', async () => {
        const queryStateWithFragments = {
            ...mockQueryState,
            fragments: {
                userFields: 'fragment userFields on User { id name email }'
            },
            queryStructure: {
                fields: {
                    user: {
                        args: { id: '$userId' },
                        fragmentSpreads: ['userFields']
                    }
                }
            }
        };

        vi.mocked(sharedUtils.loadQueryState).mockResolvedValue(queryStateWithFragments as any);
        vi.mocked(sharedUtils.buildQueryFromStructure).mockReturnValue(
            'query GetUser($userId: ID!) {\n  user(id: $userId) {\n    ...userFields\n  }\n}\nfragment userFields on User { id name email }'
        );

        const result = await getCurrentQuery('test-session-id');

        expect(result.queryString).toBeDefined();
        expect(result.queryString).toContain('...userFields');
        expect(result.queryString).toContain('fragment userFields');
        expect(result.error).toBeUndefined();
    });

    it('should handle query with operation directives', async () => {
        const queryStateWithDirectives = {
            ...mockQueryState,
            operationDirectives: [{ name: 'live', arguments: [] }]
        };

        vi.mocked(sharedUtils.loadQueryState).mockResolvedValue(queryStateWithDirectives as any);
        vi.mocked(sharedUtils.buildQueryFromStructure).mockReturnValue(
            'query GetUser($userId: ID!) @live {\n  user(id: $userId) {\n    id\n    name\n  }\n}'
        );

        const result = await getCurrentQuery('test-session-id');

        expect(result.queryString).toBeDefined();
        expect(result.queryString).toContain('@live');
        expect(result.error).toBeUndefined();
    });

    it('should return an error for non-existent session', async () => {
        vi.mocked(sharedUtils.loadQueryState).mockResolvedValue(null);

        const result = await getCurrentQuery('non-existent-session');

        expect(result.error).toBe('Session not found.');
        expect(result.queryString).toBeUndefined();
        expect(result.variables_schema).toBeUndefined();
    });

    it('should handle errors from buildQueryFromStructure', async () => {
        vi.mocked(sharedUtils.loadQueryState).mockResolvedValue(mockQueryState as any);
        vi.mocked(sharedUtils.buildQueryFromStructure).mockImplementation(() => {
            throw new Error('Failed to build query');
        });

        const result = await getCurrentQuery('test-session-id');

        expect(result.error).toBe('Failed to build query');
        expect(result.queryString).toBeUndefined();
        expect(result.variables_schema).toBeUndefined();
    });
});

describe('Session Management - Error Handling', () => {
    it('should return an error for an invalid operation type', async () => {
        const { createQuerySession } = await import('../../tools/start-query-session');
        const result = await createQuerySession('invalid_op');
        expect(result.error).toBeDefined();
        expect(result.error).toContain("Operation type 'invalid_op' not supported by schema or invalid");
    });

    it('should return an error when ending a non-existent session', async () => {
        vi.mocked(sharedUtils.loadQueryState).mockResolvedValue(null);
        const { endQuerySession } = await import('../../tools/end-query-session');
        const result = await endQuerySession('non-existent-session');
        expect(result.error).toBe('Session not found.');
    });
}); 