import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setInputObjectArgument } from '../../tools/set-input-object-argument';
import * as sharedUtils from '../../tools/shared-utils';

vi.mock('../../tools/shared-utils', async () => {
    const { createSharedUtilsMock } = await import('../setup');

    return createSharedUtilsMock({
        loadQueryState: vi.fn(),
        saveQueryState: vi.fn(),
    });
});

describe('setInputObjectArgument', () => {
    let queryState: any;

    beforeEach(() => {
        vi.clearAllMocks();
        queryState = {
            operationType: 'mutation',
            queryStructure: {
                fields: {
                    updateUser: {
                        fieldName: 'updateUser',
                        args: {},
                    },
                },
            },
            variablesSchema: {},
        };

        vi.mocked(sharedUtils.loadQueryState).mockResolvedValue(queryState);
        vi.mocked(sharedUtils.saveQueryState).mockImplementation(async (sid, qs) => {
            queryState = qs;
        });
    });

    it('should set a nested value in an input object argument', async () => {
        await setInputObjectArgument('test-session', 'updateUser', 'input', 'profile.name', 'John Doe');
        await setInputObjectArgument('test-session', 'updateUser', 'input', 'profile.age', 30);

        const queryString = sharedUtils.buildQueryFromStructure(
            queryState.queryStructure,
            queryState.operationType,
            queryState.variablesSchema
        );

        const cleanedQuery = queryString.replace(/\s+/g, '');
        expect(cleanedQuery).toContain('updateUser(input:{profile:{name:"JohnDoe",age:30}}');
    });

    describe('Critical Input Object Validation', () => {
        it('should handle complex input objects correctly', async () => {
            // Set multiple fields in input object
            const nameResult = await setInputObjectArgument('test-session', 'updateUser', 'filter', 'name', 'Rick', true);
            expect(nameResult.success).toBe(true);

            const statusResult = await setInputObjectArgument('test-session', 'updateUser', 'filter', 'status', 'Alive', true);
            expect(statusResult.success).toBe(true);

            const speciesResult = await setInputObjectArgument('test-session', 'updateUser', 'filter', 'species', 'Human', true);
            expect(speciesResult.success).toBe(true);
        });

        it('should handle nested input objects correctly', async () => {
            const result = await setInputObjectArgument('test-session', 'updateUser', 'filter', 'origin.name', 'Earth', true);
            expect(result.success).toBe(true);
            expect(result.message).toContain("Set 'origin.name' to '\"Earth\"' in input object 'filter'");
        });

        it('should set simple field values correctly', async () => {
            const result = await setInputObjectArgument('test-session', 'updateUser', 'input', 'name', 'John Doe', true);
            expect(result.success).toBe(true);
            expect(result.message).toContain("Set 'name' to '\"John Doe\"' in input object 'input'");
        });

        it('should set numeric field values correctly', async () => {
            const result = await setInputObjectArgument('test-session', 'updateUser', 'input', 'age', 25, true);
            expect(result.success).toBe(true);
            expect(result.message).toContain("Set 'age' to '25' in input object 'input'");
        });

        it('should set boolean field values correctly', async () => {
            const result = await setInputObjectArgument('test-session', 'updateUser', 'input', 'active', true, true);
            expect(result.success).toBe(true);
            expect(result.message).toContain("Set 'active' to 'true' in input object 'input'");
        });
    });
}); 