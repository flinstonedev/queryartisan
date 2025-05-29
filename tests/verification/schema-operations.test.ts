import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildSchema } from 'graphql';
import * as sharedUtils from '../../tools/shared-utils';
import * as graphql from 'graphql';
import { createSharedUtilsMock } from '../setup';

// Import the global TEST_SCHEMA from setup that includes Mutation
import { TEST_SCHEMA } from '../setup';

vi.mock('../../tools/shared-utils', () => createSharedUtilsMock({
    fetchAndCacheSchema: vi.fn().mockResolvedValue(TEST_SCHEMA),
    getTypeNameStr: vi.fn((type: any) => {
        // Use the actual getTypeNameStr implementation behavior
        if (!type) return 'Unknown';
        if (type.name) return type.name;
        if (type.ofType) return type.ofType.name + '!';
        return type.toString();
    }),
}));

vi.mock('graphql', async (importOriginal) => {
    const actual = await importOriginal() as typeof graphql;
    return {
        ...actual,
        printSchema: () => 'type Query { version: String }',
        isObjectType: (type: any) => type.name === 'User' || type.name === 'Query',
        isInterfaceType: () => false,
        isInputObjectType: () => false,
        isNonNullType: (type: any) => false,
        getNamedType: (type: any) => type,
    };
});

describe('Schema Tools', () => {
    it('should get root operation types', async () => {
        const { getRootOperationTypes } = await import('../../tools/get-root-operation-types');
        const result = await getRootOperationTypes();
        expect(result.query_type).toBe('Query');
        expect(result.mutation_type).toBe('Mutation'); // The global test schema has mutations
        expect(result.subscription_type).toBeNull();
    });

    it('should get type info for a specific type', async () => {
        const { getTypeInfo } = await import('../../tools/get-type-info.js');
        const result = await getTypeInfo('User');
        expect(result.name).toBe('User');
        expect(result.description).toBe(null); // Built schema doesn't have descriptions
        expect(result.fields).toHaveLength(5); // id, name, email, active, metadata
    });

    it('should get field info for a specific field', async () => {
        const { getFieldInfo } = await import('../../tools/get-field-info');
        const result = await getFieldInfo('User', 'id');
        expect(result.name).toBe('id');
        expect(result.type).toBe('ID!'); // Non-null ID type
    });
});

describe('Schema Tools - Error Handling', () => {
    it('should return an error when a type is not found', async () => {
        const { getTypeInfo } = await import('../../tools/get-type-info');
        const result = await getTypeInfo('NonExistentType');
        expect(result.error).toContain("Type 'NonExistentType' not found in schema");
    });

    it('should return an error when a field is not found', async () => {
        const { getFieldInfo } = await import('../../tools/get-field-info');
        const result = await getFieldInfo('User', 'nonExistentField');
        expect(result.error).toContain("Field 'nonExistentField' not found on type 'User'");
    });
}); 