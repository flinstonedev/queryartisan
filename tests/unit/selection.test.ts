import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as graphql from 'graphql';
import * as sharedUtils from '../../tools/shared-utils';
import { selectGraphQLField } from '../../tools/select-field';
import { buildQueryFromStructure } from '../../tools/shared-utils';

const mockQueryState = {
    queryStructure: {
        fields: {
            user: {
                fields: {
                    posts: {
                        fields: {}
                    }
                },
            },
        },
    },
    operationTypeName: 'Query',
    headers: {}
};

const mockUserType: any = {
    name: 'User',
    description: 'A user object',
};
const mockPostType: any = {
    name: 'Post',
};

mockUserType.getFields = () => ({
    id: {
        name: 'id',
        type: { name: 'ID' },
        args: [],
        description: 'User ID'
    },
    name: {
        name: 'name',
        type: { name: 'String' },
        args: [],
        description: 'User name'
    },
    posts: {
        name: 'posts',
        type: mockPostType,
        args: [
            { name: 'limit', type: { name: 'Int' }, defaultValue: undefined },
            { name: 'offset', type: { name: 'Int' }, defaultValue: 0 }
        ],
        description: 'User posts'
    }
});

mockPostType.getFields = () => ({
    id: { name: 'id', type: { name: 'ID' }, args: [] },
    title: { name: 'title', type: { name: 'String' }, args: [] },
    author: { name: 'author', type: mockUserType, args: [] }
});


const mockNodeInterface = {
    name: 'Node',
    getFields: () => ({
        id: { name: 'id', type: { name: 'ID' }, args: [] }
    }),
};

const mockQueryType = {
    name: 'Query',
    getFields: () => ({
        user: { name: 'user', type: mockUserType, args: [] },
        node: { name: 'node', type: mockNodeInterface, args: [] }
    })
};

const mockSchema = {
    getType: (name: string) => {
        switch (name) {
            case 'Query': return mockQueryType;
            case 'User': return mockUserType;
            case 'Post': return mockPostType;
            case 'Node': return mockNodeInterface;
            default: return null;
        }
    },
    getPossibleTypes: (type: any) => {
        if (type.name === 'Node') {
            return [mockUserType, mockPostType];
        }
        return [];
    }
};

vi.mock('../../tools/shared-utils', async (importOriginal) => {
    const actual = await importOriginal() as typeof sharedUtils;
    return {
        ...actual,
        loadQueryState: vi.fn(),
        saveQueryState: vi.fn().mockResolvedValue(undefined),
        fetchAndCacheSchema: vi.fn(),
        GraphQLValidationUtils: {
            isValidGraphQLName: (name) => /^[_A-Za-z][_0-9A-Za-z]*$/.test(name),
            validateFieldAlias: (alias) => {
                if (alias && !/^[_A-Za-z][_0-9A-Za-z]*$/.test(alias)) {
                    return { valid: false, error: `Invalid field alias "${alias}".` };
                }
                return { valid: true };
            },
            validateFieldName: () => ({ valid: true }),
            validateVariableName: () => ({ valid: true }),
            serializeGraphQLValue: (v) => {
                if (typeof v === 'string') return `"${v}"`;
                return String(v);
            },
            validateFieldInSchema: () => ({ valid: true, field: { type: {}, args: [] } }),
        },
        getTypeNameStr: (type) => type.name || 'Unknown'
    };
});

vi.mock('graphql', async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...actual as typeof graphql,
        getNamedType: (type) => type,
        isObjectType: (type) => ['User', 'Post', 'Query'].includes(type?.name),
        isInterfaceType: (type) => type?.name === 'Node',
        isUnionType: (type) => false,
        isNonNullType: (type) => false,
        isListType: (type) => false,
    };
});

describe('Field Selection', () => {
    beforeEach(() => {
        vi.mocked(sharedUtils.loadQueryState).mockResolvedValue(mockQueryState as any);
        vi.mocked(sharedUtils.fetchAndCacheSchema).mockResolvedValue(mockSchema as any);
    });

    it('should select a field to add to the query', async () => {
        const { selectGraphQLField } = await import('../../tools/select-field');
        const result = await selectGraphQLField('test-session', 'user', 'id');
        expect(result.message).toContain("Field 'id' selected successfully at path 'user'");
    });

    it('should select multiple fields to add to the query', async () => {
        const { selectMultipleFields } = await import('../../tools/select-multiple-fields');
        const result = await selectMultipleFields('test-session', 'user', ['id', 'name']);
        expect(result.success).toBe(true);
        expect(result.message).toContain("Successfully selected 2 fields at path 'user'");
    });

    it('should get available selections', async () => {
        const { getAvailableSelections } = await import('../../tools/get-selections');
        const result = await getAvailableSelections('test-session', 'user');
        expect(result.error).toBeUndefined();
        expect(result.selections).toBeDefined();
    });

    it('should correctly build a query with an aliased field', async () => {
        const { selectGraphQLField } = await import('../../tools/select-field');
        const { buildQueryFromStructure } = await import('../../tools/shared-utils');

        // 1. Initial state
        let queryState: any = {
            operationType: 'query',
            operationTypeName: 'Query',
            headers: {},
            queryStructure: {
                fields: {},
                fragmentSpreads: [],
                inlineFragments: []
            },
            variablesSchema: {},
            fragments: {}
        };

        // Mock load/save to simulate state changes
        vi.mocked(sharedUtils.loadQueryState).mockResolvedValue(queryState);
        vi.mocked(sharedUtils.saveQueryState).mockImplementation(async (sessionId, newState) => {
            queryState = newState;
        });

        // 2. Select 'user' with alias 'firstUser'
        await selectGraphQLField('test-session', '', 'user', 'firstUser');

        // 3. Select 'id' under the aliased field
        await selectGraphQLField('test-session', 'firstUser', 'id');

        // 4. Build the query from the final state
        const queryString = buildQueryFromStructure(
            queryState.queryStructure,
            queryState.operationType,
            queryState.variablesSchema
        );

        // 5. Assert the query string is correct
        const expectedQuery = `
            query {
                firstUser: user {
                    id
                }
            }
        `;

        expect(queryString.replace(/\s+/g, ' ').trim()).toBe(expectedQuery.replace(/\s+/g, ' ').trim());
    });
});

describe('Get Selections - Enhanced Coverage', () => {
    beforeEach(() => {
        vi.mocked(sharedUtils.loadQueryState).mockResolvedValue(mockQueryState as any);
        vi.mocked(sharedUtils.fetchAndCacheSchema).mockResolvedValue(mockSchema as any);
    });

    it('should get selections for root level (empty path)', async () => {
        const { getAvailableSelections } = await import('../../tools/get-selections');
        const result = await getAvailableSelections('test-session', '');

        expect(result.error).toBeUndefined();
        expect(result.selections).toBeDefined();
    });

    it('should get selections for nested field paths', async () => {
        const nestedQueryState = {
            ...mockQueryState,
            queryStructure: {
                fields: {
                    user: {
                        fields: {
                            posts: {
                                fields: {}
                            }
                        }
                    }
                }
            },
            sessionId: 'test-session',
            operationType: 'query' as const,
            operationName: 'TestQuery',
            fragments: {},
            variablesSchema: {},
            variablesValues: {},
            variablesDefaults: {},
            operationDirectives: [],
            createdAt: new Date().toISOString()
        };

        vi.mocked(sharedUtils.loadQueryState).mockResolvedValueOnce(nestedQueryState as any);

        const { getAvailableSelections } = await import('../../tools/get-selections');
        const result = await getAvailableSelections('test-session', 'user.posts');

        expect(result.error).toBeUndefined();
        expect(result.selections).toBeDefined();
    });

    it('should return selections with field arguments information', async () => {
        const queryStateForUser = {
            ...mockQueryState,
            queryStructure: {
                fields: {
                    user: {
                        fields: {}
                    }
                }
            },
            sessionId: 'test-session',
            operationType: 'query' as const,
            operationName: 'TestQuery',
            fragments: {},
            variablesSchema: {},
            variablesValues: {},
            variablesDefaults: {},
            operationDirectives: [],
            createdAt: new Date().toISOString()
        };

        vi.mocked(sharedUtils.loadQueryState).mockResolvedValueOnce(queryStateForUser as any);

        const { getAvailableSelections } = await import('../../tools/get-selections');
        const result = await getAvailableSelections('test-session', 'user');

        expect(result.error).toBeUndefined();
        expect(result.selections).toBeDefined();

        const postsSelection = result.selections?.find(s => s.name === 'posts');
        if (postsSelection) {
            expect(postsSelection.description).toContain('Args:');
            expect(postsSelection.description).toContain('limit');
            expect(postsSelection.description).toContain('offset');
        }
    });

    it('should handle interface types with possible types', async () => {
        const interfaceQueryState = {
            ...mockQueryState,
            queryStructure: {
                fields: {
                    node: {
                        fields: {}
                    }
                }
            },
            operationTypeName: 'Query'
        };

        const interfaceSchema = {
            ...mockSchema,
            getType: (name: string) => {
                if (name === 'Query') {
                    return mockQueryType;
                }
                return mockSchema.getType(name);
            }
        };

        vi.mocked(sharedUtils.loadQueryState).mockResolvedValueOnce(interfaceQueryState as any);
        vi.mocked(sharedUtils.fetchAndCacheSchema).mockResolvedValueOnce(interfaceSchema as any);

        const { getAvailableSelections } = await import('../../tools/get-selections');
        const result = await getAvailableSelections('test-session', 'node');

        expect(result.error).toBeUndefined();
        expect(result.selections).toBeDefined();

        const inlineFragments = result.selections?.filter(s => s.name.startsWith('... on'));
        expect(inlineFragments?.length).toBeGreaterThan(0);
    });

    it('should return error for non-existent path', async () => {
        const { getAvailableSelections } = await import('../../tools/get-selections');
        const result = await getAvailableSelections('test-session', 'nonexistent.path');

        expect(result.error).toContain("Path 'nonexistent.path' not found in query structure");
        expect(result.selections).toBeUndefined();
    });

    it('should return error for non-existent field in path', async () => {
        const queryStateWithInvalidField = {
            ...mockQueryState,
            queryStructure: {
                fields: {
                    user: {
                        fields: {}
                    }
                }
            }
        };

        vi.mocked(sharedUtils.loadQueryState).mockResolvedValueOnce(queryStateWithInvalidField as any);

        const { getAvailableSelections } = await import('../../tools/get-selections');
        const result = await getAvailableSelections('test-session', 'user.invalidField');

        expect(result.error).toContain("Path 'user.invalidField' not found in query structure");
        expect(result.selections).toBeUndefined();
    });

    it('should return error for non-existent session', async () => {
        vi.mocked(sharedUtils.loadQueryState).mockResolvedValueOnce(null);

        const { getAvailableSelections } = await import('../../tools/get-selections');
        const result = await getAvailableSelections('non-existent-session', '');

        expect(result.error).toBe('Session not found.');
        expect(result.selections).toBeUndefined();
    });

    it('should handle complex nested paths with multiple levels', async () => {
        const deeplyNestedQueryState = {
            ...mockQueryState,
            queryStructure: {
                fields: {
                    user: {
                        fields: {
                            posts: {
                                fields: {
                                    author: {
                                        fields: {}
                                    }
                                }
                            }
                        }
                    }
                }
            }
        };

        vi.mocked(sharedUtils.loadQueryState).mockResolvedValueOnce(deeplyNestedQueryState as any);

        const { getAvailableSelections } = await import('../../tools/get-selections');
        const result = await getAvailableSelections('test-session', 'user.posts.author');

        expect(result.error).toBeUndefined();
        expect(result.selections).toBeDefined();
    });

    it('should include field descriptions and return types in selections', async () => {
        const queryStateForUser = {
            ...mockQueryState,
            queryStructure: {
                fields: {
                    user: {
                        fields: {}
                    }
                }
            }
        };

        vi.mocked(sharedUtils.loadQueryState).mockResolvedValueOnce(queryStateForUser as any);

        const { getAvailableSelections } = await import('../../tools/get-selections');
        const result = await getAvailableSelections('test-session', 'user');

        expect(result.error).toBeUndefined();
        expect(result.selections).toBeDefined();

        const idSelection = result.selections?.find(s => s.name === 'id');
        if (idSelection) {
            expect(idSelection.type).toBe('ID');
            expect(idSelection.description).toContain('Returns ID');
        }
    });
});

describe('Field Selection - Error Handling', () => {
    beforeEach(() => {
        vi.mocked(sharedUtils.loadQueryState).mockResolvedValue(mockQueryState as any);
        vi.mocked(sharedUtils.fetchAndCacheSchema).mockResolvedValue(mockSchema as any);
    });

    it('should return an error for an invalid parent path', async () => {
        const { selectGraphQLField } = await import('../../tools/select-field');
        const result = await selectGraphQLField('test-session', 'invalid.path', 'id');
        expect(result.error).toContain("Parent path 'invalid.path' not found in query structure.");
    });

    it('should return an error for an invalid field name', async () => {
        const { selectGraphQLField } = await import('../../tools/select-field');
        const result = await selectGraphQLField('test-session', 'user', 'invalid-name!', undefined);
        expect(result.error).toContain('Invalid field name "invalid-name!". Must match /^[_A-Za-z][_0-9A-Za-z]*$/');
    });
}); 