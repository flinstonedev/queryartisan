import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getInputObjectHelp } from '../../tools/get-input-object-help';
import * as sharedUtils from '../../tools/shared-utils';
import { buildSchema, GraphQLInputObjectType, GraphQLString, GraphQLNonNull, GraphQLID } from 'graphql';

// Mock the shared-utils module
vi.mock('../../tools/shared-utils', async () => {
    const originalModule = await vi.importActual('../../tools/shared-utils');
    return {
        ...originalModule,
        fetchAndCacheSchema: vi.fn(),
        resolveEndpointAndHeaders: vi.fn(),
        getTypeNameStr: vi.fn((type: any) => {
            if (!type) return 'Unknown';
            if (type.name) return type.name;
            if (type.ofType) return type.ofType.name + '!';
            return type.toString();
        }),
    };
});

const mockedFetchAndCacheSchema = vi.mocked(sharedUtils.fetchAndCacheSchema);
const mockedResolveEndpointAndHeaders = vi.mocked(sharedUtils.resolveEndpointAndHeaders);

describe('getInputObjectHelp', () => {
    beforeEach(() => {
        // Reset mocks before each test
        vi.clearAllMocks();

        // Mock the endpoint resolution
        mockedResolveEndpointAndHeaders.mockReturnValue({
            url: 'http://localhost:4000/graphql',
            headers: {}
        });

        // Provide a default schema mock to prevent crashes
        mockedFetchAndCacheSchema.mockResolvedValue(buildSchema(`type Query { dummy: String }`));
    });

    it('should return help for an input object with correct example values', async () => {
        // Mock specific schema for this test
        const schema = buildSchema(`
            """A test input object."""
            input TestInput {
                id: ID!
                name: String
            }
            type Query {
                test(input: TestInput): String
            }
        `);

        mockedFetchAndCacheSchema.mockResolvedValue(schema);

        const result = await getInputObjectHelp('TestInput');

        expect(result.error).toBeUndefined();
        expect(result.inputTypeName).toBe('TestInput');
        expect(result.description).toBe('A test input object.');
        expect(result.fields).toHaveLength(2);

        const nameField = result.fields?.find(f => f.name === 'name');
        expect(nameField).toBeDefined();
        expect(nameField?.type).toBe('String');
        expect(nameField?.required).toBe(false);
        expect(nameField?.exampleValue).toBe('example_string');

        const idField = result.fields?.find(f => f.name === 'id');
        expect(idField).toBeDefined();
        expect(idField?.type).toBe('ID!');
        expect(idField?.required).toBe(true);
        expect(idField?.exampleValue).toBe('example_id');

        expect(result.exampleUsage).toContain('testinput');
    });

    it('should handle non-existent input types', async () => {
        const schema = buildSchema(`
            type Query {
                test: String
            }
        `);
        mockedFetchAndCacheSchema.mockResolvedValue(schema);

        const result = await getInputObjectHelp('NonExistentInput');
        expect(result.error).toBe("Input type 'NonExistentInput' not found or not an input object type");
    });
}); 