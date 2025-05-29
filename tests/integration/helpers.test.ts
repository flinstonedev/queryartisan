import { describe, it, expect, vi } from 'vitest';
import * as graphql from 'graphql';
import { createSharedUtilsMock } from '../setup';

const mockInputType = {
    name: 'UserInput',
    description: 'Input for user creation',
    getFields: () => ({
        name: { name: 'name', type: { name: 'String' }, description: 'User name' },
        email: { name: 'email', type: { name: 'String' }, description: 'User email' },
    }),
};

const mockSchema = {
    getType: (name: string) => (name === 'UserInput' ? mockInputType : null),
};

vi.mock('../../tools/shared-utils', () => createSharedUtilsMock({
    fetchAndCacheSchema: vi.fn().mockResolvedValue(mockSchema),
}));

vi.mock('graphql', async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...actual as typeof graphql,
        isInputObjectType: (type: any) => type.name === 'UserInput',
        isNonNullType: (type: any) => false,
        getNamedType: (type: any) => type,
    };
});

describe('Helper Tools', () => {
    it('should get help for an input object', async () => {
        const { getInputObjectHelp } = await import('../../tools/get-input-object-help');
        const result = await getInputObjectHelp('UserInput');
        expect(result.inputTypeName).toBe('UserInput');
        expect(result.fields).toHaveLength(2);
        expect(result.description).toContain('Input for user creation');
    });
});

describe('Helpers - Error Handling', () => {
    it('should return an error if the type is not an input object', async () => {
        const { getInputObjectHelp } = await import('../../tools/get-input-object-help');
        const result = await getInputObjectHelp('User');
        expect(result.error).toContain("not an input object type");
    });
}); 