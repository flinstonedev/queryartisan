import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setInputObjectArgument } from '../../tools/set-input-object-argument';
import * as sharedUtils from '../../tools/shared-utils';

vi.mock('../../tools/shared-utils', async () => {
    const { createSharedUtilsMock } = await import('../core/setup');
    const { buildSchema } = await import('graphql');
    const actualUtils = await vi.importActual('../../tools/shared-utils');

    const testSchema = buildSchema(`
        input UserInput {
            name: String
            age: Int
            active: Boolean
            profile: ProfileInput
        }
        
        input ProfileInput {
            name: String
            age: Int
        }
        
        input FilterInput {
            name: String
            status: String
            species: String
            origin: OriginInput
        }
        
        input OriginInput {
            name: String
        }
        
        type User {
            id: ID!
            name: String
        }
        
        type Mutation {
            updateUser(input: UserInput, filter: FilterInput): User
        }
        
        type Query {
            user: User
        }
    `);

    return {
        ...createSharedUtilsMock({
            fetchAndCacheSchema: vi.fn().mockResolvedValue(testSchema),
            loadQueryState: vi.fn(),
            saveQueryState: vi.fn(),
        }),
        buildQueryFromStructure: actualUtils.buildQueryFromStructure,
        validateInputComplexity: vi.fn().mockReturnValue(null),
    };
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
            const nameResult = await setInputObjectArgument('test-session', 'updateUser', 'filter', 'name', 'Rick');
            expect(nameResult.success).toBe(true);

            const statusResult = await setInputObjectArgument('test-session', 'updateUser', 'filter', 'status', 'Alive');
            expect(statusResult.success).toBe(true);

            const speciesResult = await setInputObjectArgument('test-session', 'updateUser', 'filter', 'species', 'Human');
            expect(speciesResult.success).toBe(true);
        });

        it('should handle nested input objects correctly', async () => {
            const result = await setInputObjectArgument('test-session', 'updateUser', 'filter', 'origin.name', 'Earth');
            expect(result.success).toBe(true);
            expect(result.message).toContain("Set 'origin.name' to '\"Earth\"' in input object 'filter'");
        });

        it('should set simple field values correctly', async () => {
            const result = await setInputObjectArgument('test-session', 'updateUser', 'input', 'name', 'John Doe');
            expect(result.success).toBe(true);
            expect(result.message).toContain("Set 'name' to '\"John Doe\"' in input object 'input'");
        });

        it('should set numeric field values correctly', async () => {
            const result = await setInputObjectArgument('test-session', 'updateUser', 'input', 'age', 25);
            expect(result.success).toBe(true);
            expect(result.message).toContain("Set 'age' to '25' in input object 'input'");
        });

        it('should set boolean field values correctly', async () => {
            const result = await setInputObjectArgument('test-session', 'updateUser', 'input', 'active', true);
            expect(result.success).toBe(true);
            expect(result.message).toContain("Set 'active' to 'true' in input object 'input'");
        });
    });
}); 