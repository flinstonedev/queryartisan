import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setTypedArgumentTool } from '../../tools/set-typed-argument.js';
import { TEST_SCHEMA } from '../setup.js';

// Mock the shared-utils module
vi.mock('../../tools/shared-utils.js', async () => {
    const { createSharedUtilsMock } = await import('../setup');
    const actualUtils = await vi.importActual('../../tools/shared-utils.js') as any;
    const mock = createSharedUtilsMock({
        fetchAndCacheSchema: () => Promise.resolve(TEST_SCHEMA),
    });

    // Add the missing mock from the central setup and assign the real implementation
    (mock.GraphQLValidationUtils as any).getArgumentType = actualUtils.GraphQLValidationUtils.getArgumentType;
    return mock;
});

describe('Issue #2: Argument Type Coercion Problems', () => {
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
                    'characters': {
                        fieldName: 'characters',
                        alias: null,
                        args: {},
                        fields: {},
                        directives: [],
                        fragmentSpreads: [],
                        inlineFragments: []
                    },
                    'user': {
                        fieldName: 'user',
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

    it('should store numeric arguments as actual numbers, not strings', async () => {
        const result = await setTypedArgumentTool.handler({
            sessionId: testSessionId,
            fieldPath: 'characters',
            argumentName: 'limit',
            value: 100
        });

        const response = JSON.parse(result.content[0].text);
        expect(response.success).toBe(true);
        expect(response.error).toBeUndefined();

        // Verify the argument is stored with proper type information
        const sharedUtils = await import('../../tools/shared-utils.js');
        const saveCall = vi.mocked(sharedUtils.saveQueryState).mock.calls[0];
        const savedState = saveCall[1];

        const limitArg = savedState.queryStructure.fields.characters.args.limit;
        expect(limitArg).toBeDefined();
        expect(limitArg.value).toBe(100);
        expect(limitArg.is_typed).toBe(true);
        expect(typeof limitArg.value).toBe('number');
    });

    it('should store boolean arguments as actual booleans, not strings', async () => {
        const result = await setTypedArgumentTool.handler({
            sessionId: testSessionId,
            fieldPath: 'characters',
            argumentName: 'active',
            value: true
        });

        const response = JSON.parse(result.content[0].text);
        expect(response.success).toBe(true);
        expect(response.error).toBeUndefined();

        const sharedUtils = await import('../../tools/shared-utils.js');
        const saveCalls = vi.mocked(sharedUtils.saveQueryState).mock.calls;

        const saveCall = saveCalls[saveCalls.length - 1]; // Get the last call
        const savedState = saveCall[1];

        const activeArg = savedState.queryStructure.fields.characters.args.active;
        expect(activeArg).toBeDefined();
        expect(activeArg.value).toBe(true);
        expect(activeArg.is_typed).toBe(true);
        expect(typeof activeArg.value).toBe('boolean');
    });
}); 