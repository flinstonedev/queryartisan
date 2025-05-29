import { describe, it, expect, vi, beforeEach } from 'vitest';
import { removeQueryVariable } from '../../tools/remove-query-variable.js';

vi.mock('../../tools/shared-utils', async () => {
    const { createSharedUtilsMock } = await import('../setup');
    return createSharedUtilsMock({
        loadQueryState: vi.fn(),
        saveQueryState: vi.fn(),
        GraphQLValidationUtils: {
            validateVariableName: vi.fn().mockReturnValue({ valid: true })
        }
    });
});

describe('Variable Argument Cleanup Bug Fix', () => {
    let mockQueryState: any;

    beforeEach(async () => {
        // Create a mock query state with field arguments that reference variables
        mockQueryState = {
            variablesSchema: {
                '$size1': 'Int!',
                '$userId': 'ID!',
                '$includeImages': 'Boolean!'
            },
            variablesDefaults: {},
            variablesValues: {},
            queryStructure: {
                fields: {
                    user: {
                        fieldName: 'user',
                        args: {
                            id: '$userId'  // Simple variable reference
                        },
                        fields: {
                            avatarUrl: {
                                fieldName: 'avatarUrl',
                                args: {
                                    size: '$size1'  // This should be cleaned up when $size1 is removed
                                },
                                fields: {}
                            },
                            profile: {
                                fieldName: 'profile',
                                args: {
                                    includeImages: {
                                        value: '$includeImages',  // Object format variable reference
                                        is_variable: true
                                    }
                                },
                                fields: {}
                            }
                        }
                    }
                }
            },
            operationDirectives: []
        };

        const sharedUtils = await import('../../tools/shared-utils.js');
        vi.mocked(sharedUtils.loadQueryState).mockResolvedValue(mockQueryState);
        vi.mocked(sharedUtils.saveQueryState).mockImplementation(async (sessionId, state) => {
            mockQueryState = state; // Update our mock state
        });
    });

    it('should remove field arguments that reference the deleted variable (simple format)', async () => {
        // Remove $size1 variable
        const result = await removeQueryVariable('test-session', '$size1');

        expect(result.success).toBe(true);
        expect(result.message).toContain("Variable '$size1' removed from query");
        expect(result.message).toContain("Removed field argument 'size' from 'user.avatarUrl'");

        // Verify the variable was removed from schema
        expect(mockQueryState.variablesSchema['$size1']).toBeUndefined();

        // Verify the field argument was cleaned up
        expect(mockQueryState.queryStructure.fields.user.fields.avatarUrl.args.size).toBeUndefined();

        // Verify other arguments are not affected
        expect(mockQueryState.queryStructure.fields.user.args.id).toBe('$userId');
        expect(mockQueryState.queryStructure.fields.user.fields.profile.args.includeImages.value).toBe('$includeImages');
    });

    it('should remove field arguments that reference the deleted variable (object format)', async () => {
        // Remove $includeImages variable
        const result = await removeQueryVariable('test-session', '$includeImages');

        expect(result.success).toBe(true);
        expect(result.message).toContain("Variable '$includeImages' removed from query");
        expect(result.message).toContain("Removed field argument 'includeImages' from 'user.profile'");

        // Verify the variable was removed from schema
        expect(mockQueryState.variablesSchema['$includeImages']).toBeUndefined();

        // Verify the field argument was cleaned up
        expect(mockQueryState.queryStructure.fields.user.fields.profile.args.includeImages).toBeUndefined();

        // Verify other arguments are not affected
        expect(mockQueryState.queryStructure.fields.user.args.id).toBe('$userId');
        expect(mockQueryState.queryStructure.fields.user.fields.avatarUrl.args.size).toBe('$size1');
    });

    it('should handle nested field arguments correctly', async () => {
        // Add a deeper nested structure
        mockQueryState.queryStructure.fields.user.fields.posts = {
            fieldName: 'posts',
            args: {
                limit: '$size1'  // Nested field argument
            },
            fields: {
                comments: {
                    fieldName: 'comments',
                    args: {
                        first: '$size1'  // Even deeper nested argument
                    },
                    fields: {}
                }
            }
        };

        // Remove $size1 variable
        const result = await removeQueryVariable('test-session', '$size1');

        expect(result.success).toBe(true);
        expect(result.message).toContain("Variable '$size1' removed from query");

        // Should clean up all references at all levels
        expect(result.message).toContain("Removed field argument 'size' from 'user.avatarUrl'");
        expect(result.message).toContain("Removed field argument 'limit' from 'user.posts'");
        expect(result.message).toContain("Removed field argument 'first' from 'user.posts.comments'");

        // Verify all arguments were cleaned up
        expect(mockQueryState.queryStructure.fields.user.fields.avatarUrl.args.size).toBeUndefined();
        expect(mockQueryState.queryStructure.fields.user.fields.posts.args.limit).toBeUndefined();
        expect(mockQueryState.queryStructure.fields.user.fields.posts.fields.comments.args.first).toBeUndefined();
    });

    it('should not affect arguments that reference other variables', async () => {
        // Remove only $size1, should not affect $userId or $includeImages
        const result = await removeQueryVariable('test-session', '$size1');

        expect(result.success).toBe(true);

        // These should remain unchanged
        expect(mockQueryState.variablesSchema['$userId']).toBe('ID!');
        expect(mockQueryState.variablesSchema['$includeImages']).toBe('Boolean!');
        expect(mockQueryState.queryStructure.fields.user.args.id).toBe('$userId');
        expect(mockQueryState.queryStructure.fields.user.fields.profile.args.includeImages.value).toBe('$includeImages');

        // Only $size1 references should be removed
        expect(mockQueryState.variablesSchema['$size1']).toBeUndefined();
        expect(mockQueryState.queryStructure.fields.user.fields.avatarUrl.args.size).toBeUndefined();
    });

    it('should handle the case when no field arguments reference the deleted variable', async () => {
        // Remove a variable that's not referenced in any field arguments
        mockQueryState.variablesSchema['$unusedVar'] = 'String';

        const result = await removeQueryVariable('test-session', '$unusedVar');

        expect(result.success).toBe(true);
        expect(result.message).toBe("Variable '$unusedVar' removed from query.");
        expect(result.message).not.toContain("Removed field argument");

        // All existing arguments should remain
        expect(mockQueryState.queryStructure.fields.user.args.id).toBe('$userId');
        expect(mockQueryState.queryStructure.fields.user.fields.avatarUrl.args.size).toBe('$size1');
        expect(mockQueryState.queryStructure.fields.user.fields.profile.args.includeImages.value).toBe('$includeImages');
    });
}); 