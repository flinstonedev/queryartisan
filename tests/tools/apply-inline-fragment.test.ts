import { describe, it, expect, vi, beforeEach } from 'vitest';
import { applyInlineFragment } from '../../tools/apply-inline-fragment.js';
import { buildSelectionSet } from '../../tools/shared-utils.js';
import { TEST_SCHEMA } from '../setup.js';

// Mock the shared-utils module
vi.mock('../../tools/shared-utils.js', async () => {
    const actual = await vi.importActual('../../tools/shared-utils.js');
    return {
        ...actual,
        loadQueryState: vi.fn(),
        saveQueryState: vi.fn(),
    };
});

describe('Issue #3: Inline Fragment Field Rendering Bug', () => {
    const testSessionId = 'test-session-123';
    let mockQueryState: any;

    beforeEach(async () => {
        // Reset all mocks
        vi.clearAllMocks();

        // Setup mock query state
        mockQueryState = {
            headers: {},
            operationType: 'query',
            queryStructure: {
                fields: {
                    'search': {
                        fieldName: 'search',
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
            }
        };

        // Mock the functions
        const sharedUtils = await import('../../tools/shared-utils.js');
        vi.mocked(sharedUtils.loadQueryState).mockResolvedValue(mockQueryState);
        vi.mocked(sharedUtils.saveQueryState).mockResolvedValue(undefined);
    });

    describe('Field Name Rendering Bug', () => {
        it('should apply inline fragment with proper field names, not "undefined"', async () => {
            const result = await applyInlineFragment(
                testSessionId,
                'search',
                'Repository',
                ['name', 'description', 'stargazerCount']
            );

            expect(result.success).toBe(true);
            expect(result.error).toBeUndefined();

            const sharedUtils = await import('../../tools/shared-utils.js');
            const saveCall = vi.mocked(sharedUtils.saveQueryState).mock.calls[0];
            const savedState = saveCall[1];

            // Verify inline fragment was added to search field
            const searchField = savedState.queryStructure.fields.search;
            expect(searchField.inlineFragments).toBeDefined();
            expect(searchField.inlineFragments.length).toBe(1);

            const inlineFragment = searchField.inlineFragments[0];
            expect(inlineFragment.on_type).toBe('Repository');
            expect(inlineFragment.selections).toBeDefined();

            // Verify all field names are properly set
            const fieldNames = Object.keys(inlineFragment.selections);
            expect(fieldNames).toContain('name');
            expect(fieldNames).toContain('description');
            expect(fieldNames).toContain('stargazerCount');

            // Verify each field has the correct fieldName property
            expect(inlineFragment.selections.name.fieldName).toBe('name');
            expect(inlineFragment.selections.description.fieldName).toBe('description');
            expect(inlineFragment.selections.stargazerCount.fieldName).toBe('stargazerCount');
        });

        it('should render inline fragment with actual field names in buildSelectionSet', async () => {
            // Apply the inline fragment
            await applyInlineFragment(
                testSessionId,
                'search',
                'Repository',
                ['name', 'url', 'stargazerCount']
            );

            const sharedUtils = await import('../../tools/shared-utils.js');
            const saveCall = vi.mocked(sharedUtils.saveQueryState).mock.calls[0];
            const savedState = saveCall[1];

            // Use the actual buildSelectionSet function to test rendering
            const actualBuildSelectionSet = vi.importActual('../../tools/shared-utils.js').then(m => (m as any).buildSelectionSet);
            const buildFn = await actualBuildSelectionSet;

            const queryString = buildFn(savedState.queryStructure.fields);

            // Should contain actual field names, not "undefined"
            expect(queryString).toContain('name');
            expect(queryString).toContain('url');
            expect(queryString).toContain('stargazerCount');
            expect(queryString).toContain('... on Repository');

            // Should NOT contain "undefined"
            expect(queryString).not.toContain('undefined');
        });

        it('should handle multiple inline fragments correctly', async () => {
            // Apply first inline fragment
            await applyInlineFragment(
                testSessionId,
                'search',
                'Repository',
                ['name', 'stargazerCount']
            );

            // Apply second inline fragment
            await applyInlineFragment(
                testSessionId,
                'search',
                'User',
                ['login', 'avatarUrl', 'bio']
            );

            const sharedUtils = await import('../../tools/shared-utils.js');
            const saveCalls = vi.mocked(sharedUtils.saveQueryState).mock.calls;
            const lastSavedState = saveCalls[saveCalls.length - 1][1];

            const searchField = lastSavedState.queryStructure.fields.search;
            expect(searchField.inlineFragments.length).toBe(2);

            // Check Repository fragment
            const repoFragment = searchField.inlineFragments.find((f: any) => f.on_type === 'Repository');
            expect(repoFragment).toBeDefined();
            expect(Object.keys(repoFragment.selections)).toEqual(['name', 'stargazerCount']);

            // Check User fragment
            const userFragment = searchField.inlineFragments.find((f: any) => f.on_type === 'User');
            expect(userFragment).toBeDefined();
            expect(Object.keys(userFragment.selections)).toEqual(['login', 'avatarUrl', 'bio']);
        });

        it('should handle empty field list gracefully', async () => {
            const result = await applyInlineFragment(
                testSessionId,
                'search',
                'Repository',
                []
            );

            expect(result.success).toBe(true);

            const sharedUtils = await import('../../tools/shared-utils.js');
            const saveCall = vi.mocked(sharedUtils.saveQueryState).mock.calls[0];
            const savedState = saveCall[1];

            const searchField = savedState.queryStructure.fields.search;
            const inlineFragment = searchField.inlineFragments[0];

            expect(Object.keys(inlineFragment.selections)).toHaveLength(0);
        });
    });

    describe('Error Handling', () => {
        it('should handle session not found', async () => {
            const sharedUtils = await import('../../tools/shared-utils.js');
            vi.mocked(sharedUtils.loadQueryState).mockResolvedValueOnce(null);

            const result = await applyInlineFragment(
                'nonexistent-session',
                'search',
                'Repository',
                ['name']
            );

            expect(result.success).toBe(undefined);
            expect(result.error).toBe('Session not found.');
        });

        it('should handle invalid parent path', async () => {
            const result = await applyInlineFragment(
                testSessionId,
                'nonexistent.path',
                'Repository',
                ['name']
            );

            expect(result.success).toBe(undefined);
            expect(result.error).toContain('Parent path');
            expect(result.error).toContain('not found');
        });
    });

    describe('Expected Behavior Validation', () => {
        it('should match the expected inline fragment structure', async () => {
            await applyInlineFragment(
                testSessionId,
                'search',
                'Repository',
                ['name', 'description', 'stargazerCount']
            );

            const sharedUtils = await import('../../tools/shared-utils.js');
            const saveCall = vi.mocked(sharedUtils.saveQueryState).mock.calls[0];
            const savedState = saveCall[1];

            const inlineFragment = savedState.queryStructure.fields.search.inlineFragments[0];

            // Should match expected structure
            expect(inlineFragment).toMatchObject({
                on_type: 'Repository',
                selections: {
                    name: expect.objectContaining({
                        alias: null,
                        args: {},
                        fields: {},
                        directives: [],
                        fragmentSpreads: [],
                        inlineFragments: []
                    }),
                    description: expect.objectContaining({
                        alias: null,
                        args: {},
                        fields: {},
                        directives: [],
                        fragmentSpreads: [],
                        inlineFragments: []
                    }),
                    stargazerCount: expect.objectContaining({
                        alias: null,
                        args: {},
                        fields: {},
                        directives: [],
                        fragmentSpreads: [],
                        inlineFragments: []
                    })
                }
            });

            // Most importantly: fieldName should be set correctly for each selection
            expect(inlineFragment.selections.name.fieldName).toBe('name');
            expect(inlineFragment.selections.description.fieldName).toBe('description');
            expect(inlineFragment.selections.stargazerCount.fieldName).toBe('stargazerCount');
        });
    });
}); 