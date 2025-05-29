import { describe, it, expect, vi, beforeEach } from 'vitest';
import { introspectGraphQLSchema } from '../../tools/introspect-schema';
import * as sharedUtils from '../../tools/shared-utils';
import { buildSchema, getIntrospectionQuery, printSchema } from 'graphql';

vi.mock('../../tools/shared-utils', async () => {
    const { createSharedUtilsMock } = await import('../setup');

    return createSharedUtilsMock({
        resolveEndpointAndHeaders: vi.fn(() => ({ url: 'http://localhost:4000/graphql', headers: {} })),
        fetchAndCacheSchema: vi.fn(),
        rawSchemaJsonCache: { get: vi.fn(() => ({})) },
    });
});

vi.mock('graphql', async (importOriginal) => {
    const actual = await importOriginal() as any;
    return {
        ...actual,
        printSchema: () => 'type Query { hello: String }',
    };
});

describe('Introspect Schema', () => {

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should introspect a GraphQL schema', async () => {
        const mockSchema = buildSchema(`type Query { hello: String }`);
        vi.mocked(sharedUtils.fetchAndCacheSchema).mockResolvedValue(mockSchema);

        const result = await introspectGraphQLSchema();
        expect(result.schemaSdl).toContain('type Query');
    });

    it('should return an error if schema fetching fails', async () => {
        vi.mocked(sharedUtils.fetchAndCacheSchema).mockRejectedValue(new Error('Network Error'));
        const result = await introspectGraphQLSchema();
        expect(result.error).toContain('Failed to introspect schema: Network Error');
    });
}); 