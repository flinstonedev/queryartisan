import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setStringArgument } from '../../tools/set-string-argument';
import * as sharedUtils from '../../tools/shared-utils';

// Mock shared-utils
vi.mock('../../tools/shared-utils', () => ({
    loadQueryState: vi.fn(),
    saveQueryState: vi.fn(),
    GraphQLValidationUtils: {
        isValidGraphQLName: vi.fn().mockReturnValue(true),
        coerceStringValue: vi.fn((v) => ({ coerced: false, value: v })),
        generatePerformanceWarning: vi.fn().mockReturnValue(null),
        validateStringLength: vi.fn().mockImplementation((value: string, name: string) => {
            const MAX_STRING_LENGTH = 8192;
            if (value.length > MAX_STRING_LENGTH) {
                return {
                    valid: false,
                    error: `Input for "${name}" exceeds maximum allowed length of ${MAX_STRING_LENGTH} characters.`
                };
            }
            return { valid: true };
        }),
        validateNoControlCharacters: vi.fn().mockImplementation((value: string, name: string) => {
            // eslint-disable-next-line no-control-regex
            const controlCharRegex = /[\u0000-\u001F\u007F-\u009F]/;
            if (controlCharRegex.test(value)) {
                return {
                    valid: false,
                    error: `Input for "${name}" contains disallowed control characters.`
                };
            }
            return { valid: true };
        }),
        validatePaginationValue: vi.fn().mockImplementation((argumentName: string, value: string) => {
            const paginationArgs = ['first', 'last', 'limit', 'top', 'count'];
            const MAX_PAGINATION_VALUE = 500;
            if (paginationArgs.includes(argumentName.toLowerCase())) {
                const numericValue = parseInt(value, 10);
                if (!isNaN(numericValue) && numericValue > MAX_PAGINATION_VALUE) {
                    return {
                        valid: false,
                        error: `Pagination value for '${argumentName}' (${numericValue}) exceeds maximum of ${MAX_PAGINATION_VALUE}.`
                    };
                }
            }
            return { valid: true };
        }),
    },
}));

const mockedLoadQueryState = vi.mocked(sharedUtils.loadQueryState);
const mockedSaveQueryState = vi.mocked(sharedUtils.saveQueryState);

describe('setStringArgument', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Mock a basic query structure
        mockedLoadQueryState.mockResolvedValue({
            headers: {},
            operationType: 'query',
            operationTypeName: 'Query',
            operationName: null,
            queryStructure: { fields: {}, fragmentSpreads: [], inlineFragments: [] },
            fragments: {},
            variablesSchema: {},
            variablesDefaults: {},
            variablesValues: {},
            operationDirectives: [],
            createdAt: new Date().toISOString(),
        });
    });

    it('should reject a string that exceeds the maximum length', async () => {
        const longString = 'a'.repeat(8193);
        const result = await setStringArgument('test-session', '', 'argName', longString);

        expect(result.error).toBeDefined();
        expect(result.error).toContain('exceeds maximum allowed length');
        expect(mockedSaveQueryState).not.toHaveBeenCalled();
    });

    it('should reject a string containing control characters', async () => {
        const stringWithControlChar = 'hello\u0000world';
        const result = await setStringArgument('test-session', '', 'argName', stringWithControlChar);

        expect(result.error).toBeDefined();
        expect(result.error).toContain('disallowed control characters');
        expect(mockedSaveQueryState).not.toHaveBeenCalled();
    });

    it('should not perform validation for enum types', async () => {
        const longString = 'a'.repeat(8193);
        const stringWithControlChar = 'hello\u0000world';

        // Should not throw for long strings if it's an enum
        const resultLong = await setStringArgument('test-session', '', 'argName', longString, true);
        expect(resultLong.error).toBeUndefined();
        expect(resultLong.success).toBe(true);

        // Should not throw for control characters if it's an enum
        const resultControl = await setStringArgument('test-session', '', 'argName', stringWithControlChar, true);
        expect(resultControl.error).toBeUndefined();
        expect(resultControl.success).toBe(true);
    });

    it('should accept a valid string argument', async () => {
        const validString = 'hello world';
        const result = await setStringArgument('test-session', '', 'argName', validString);

        expect(result.success).toBe(true);
        expect(result.error).toBeUndefined();
        expect(mockedSaveQueryState).toHaveBeenCalled();
    });
}); 