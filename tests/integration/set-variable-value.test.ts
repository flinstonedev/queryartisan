import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setVariableValue } from '../../tools/set-variable-value';
import * as sharedUtils from '../../tools/shared-utils';
import { buildSchema, GraphQLString } from 'graphql';

// Mock shared-utils
vi.mock('../../tools/shared-utils', async (importOriginal) => {
    const original: any = await importOriginal();
    return {
        ...original,
        loadQueryState: vi.fn(),
        saveQueryState: vi.fn(),
        fetchAndCacheSchema: vi.fn(),
    };
});

const mockedLoadQueryState = vi.mocked(sharedUtils.loadQueryState);
const mockedSaveQueryState = vi.mocked(sharedUtils.saveQueryState);
const mockedFetchAndCacheSchema = vi.mocked(sharedUtils.fetchAndCacheSchema);

describe('setVariableValue', () => {
    beforeEach(() => {
        vi.clearAllMocks();

        // Mock a basic query state
        mockedLoadQueryState.mockResolvedValue({
            headers: {},
            operationType: 'query',
            operationTypeName: 'Query',
            operationName: null,
            queryStructure: { fields: {}, fragmentSpreads: [], inlineFragments: [] },
            fragments: {},
            variablesSchema: { '$myVar': 'String' },
            variablesDefaults: {},
            variablesValues: {},
            operationDirectives: [],
            createdAt: new Date().toISOString(),
        });

        // Mock schema
        const schema = buildSchema(`
            type Query {
                test(arg: String): String
            }
        `);
        mockedFetchAndCacheSchema.mockResolvedValue(schema);

        // Mock validateValueAgainstType to be permissive for most tests
        vi.spyOn(sharedUtils.GraphQLValidationUtils, 'validateValueAgainstType').mockReturnValue(null);
    });

    it('should reject a string value that exceeds the maximum length', async () => {
        const longString = 'a'.repeat(8193);
        const result = await setVariableValue('test-session', '$myVar', longString);

        expect(result.error).toBeDefined();
        expect(result.error).toContain('exceeds maximum allowed length');
        expect(mockedSaveQueryState).not.toHaveBeenCalled();
    });

    it('should reject a string value containing control characters', async () => {
        const stringWithControlChar = 'hello\u0000world';
        const result = await setVariableValue('test-session', '$myVar', stringWithControlChar);

        expect(result.error).toBeDefined();
        expect(result.error).toContain('disallowed control characters');
        expect(mockedSaveQueryState).not.toHaveBeenCalled();
    });

    it('should accept a valid string value', async () => {
        const validString = 'hello world';
        const result = await setVariableValue('test-session', '$myVar', validString);

        expect(result.success).toBe(true);
        expect(result.error).toBeUndefined();
        expect(mockedSaveQueryState).toHaveBeenCalled();
    });

    it('should accept non-string values without validation errors', async () => {
        const numberValue = 123;
        const booleanValue = true;
        const nullValue = null;

        const resultNum = await setVariableValue('test-session', '$myVar', numberValue);
        expect(resultNum.success).toBe(true);

        const resultBool = await setVariableValue('test-session', '$myVar', booleanValue);
        expect(resultBool.success).toBe(true);

        const resultNull = await setVariableValue('test-session', '$myVar', nullValue);
        expect(resultNull.success).toBe(true);
    });
}); 