import { describe, it, expect, vi } from 'vitest';

const mockQueryState = {
    fragments: {},
};

vi.mock('../../tools/shared-utils', async () => {
    const { createSharedUtilsMock, TEST_SCHEMA } = await import('../setup');

    return createSharedUtilsMock({
        loadQueryState: vi.fn().mockResolvedValue({
            ...mockQueryState,
            queryStructure: {
                fields: {
                    user: {
                        fragmentSpreads: [],
                        inlineFragments: [],
                    }
                }
            }
        }),
        saveQueryState: vi.fn().mockResolvedValue(undefined),
        fetchAndCacheSchema: vi.fn().mockResolvedValue(TEST_SCHEMA),
    });
});

describe('Fragment Handling', () => {
    it('should define a named fragment', async () => {
        const { defineNamedFragment } = await import('../../tools/define-named-fragment');
        const result = await defineNamedFragment('test-session', 'userFragment', 'User', ['id', 'name']);
        expect(result.success).toBe(true);
        expect(result.message).toContain("Fragment 'userFragment' defined on type 'User' with 2 fields.");
    });

    it('should apply a named fragment', async () => {
        const { applyNamedFragment } = await import('../../tools/apply-named-fragment');
        const result = await applyNamedFragment('test-session', 'user', 'userFragment');
        expect(result.success).toBe(true);
        expect(result.message).toContain("Fragment 'userFragment' applied at path 'user'.");
    });

    it('should apply an inline fragment', async () => {
        const { applyInlineFragment } = await import('../../tools/apply-inline-fragment');
        const result = await applyInlineFragment('test-session', 'user', 'User', ['email']);
        expect(result.success).toBe(true);
        expect(result.message).toContain("Inline fragment on type 'User' applied at path 'user' with 1 fields.");
    });
}); 