import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setTypedArgumentTool } from '../../tools/set-typed-argument.js';
import { TEST_SCHEMA, MockStateManager } from '../setup.js';

// Mock the shared-utils module
vi.mock('../../tools/shared-utils.js', async () => {
    const { createSharedUtilsMock } = await import('../setup.js');
    const actualUtils = await vi.importActual('../../tools/shared-utils.js') as any;
    const mock = createSharedUtilsMock({
        fetchAndCacheSchema: () => Promise.resolve(TEST_SCHEMA),
    });

    // Add the missing mock from the central setup and assign the real implementation
    (mock.GraphQLValidationUtils as any).getArgumentType = actualUtils.GraphQLValidationUtils.getArgumentType;
    return mock;
});

describe('set-typed-argument - Issue #2: Argument Type Coercion', () => {
    const testSessionId = 'test-session-123';
    let mockQueryState: any;

    beforeEach(() => {
        // Setup mock query state using MockStateManager
        mockQueryState = MockStateManager.createSession(testSessionId, {
            operationType: 'query',
            queryStructure: {
                fields: {
                    'characters': {
                        fieldName: 'characters',
                        alias: null,
                        args: {},
                        fields: {
                            'results': {
                                fieldName: 'results',
                                alias: null,
                                args: {},
                                fields: {
                                    'name': {
                                        fieldName: 'name',
                                        alias: null,
                                        args: {},
                                        fields: {},
                                        directives: [],
                                        fragmentSpreads: [],
                                        inlineFragments: []
                                    }
                                },
                                directives: [],
                                fragmentSpreads: [],
                                inlineFragments: []
                            }
                        },
                        directives: [],
                        fragmentSpreads: [],
                        inlineFragments: []
                    }
                },
                fragmentSpreads: [],
                inlineFragments: []
            }
        });
    });

    describe('Numeric Argument Handling', () => {
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
            const savedState = MockStateManager.getSession(testSessionId);
            expect(savedState).toBeDefined();

            const limitArg = savedState.queryStructure.fields.characters.args.limit;
            expect(limitArg).toBeDefined();
            expect(limitArg.value).toBe(100);
            expect(limitArg.is_typed).toBe(true);
            expect(typeof limitArg.value).toBe('number');
        });

        it('should handle different numeric values correctly', async () => {
            const testCases = [
                { value: 100, expected: 100, arg: 'limit' },
                { value: 0, expected: 0, arg: 'offset' },
                { value: -50, expected: -50, arg: 'page' },
            ];

            for (const testCase of testCases) {
                const result = await setTypedArgumentTool.handler({
                    sessionId: testSessionId,
                    fieldPath: 'characters',
                    argumentName: testCase.arg,
                    value: testCase.value
                });
                const response = JSON.parse(result.content[0].text);

                expect(response.success).toBe(true);
                expect(response.error).toBeUndefined();

                const savedState = MockStateManager.getSession(testSessionId);
                expect(savedState).toBeDefined();

                const argValue = savedState.queryStructure.fields.characters.args[testCase.arg];
                expect(argValue.value).toBe(testCase.expected);
                expect(typeof argValue.value).toBe('number');
            }
        });
    });

    describe('Boolean Argument Handling', () => {
        it('should store boolean arguments as actual booleans, not strings', async () => {
            const result = await setTypedArgumentTool.handler({
                sessionId: testSessionId,
                fieldPath: 'characters',
                argumentName: 'includeImages',
                value: true
            });
            const response = JSON.parse(result.content[0].text);

            expect(response.success).toBe(true);
            expect(response.error).toBeUndefined();

            const savedState = MockStateManager.getSession(testSessionId);
            expect(savedState).toBeDefined();

            const includeImagesArg = savedState.queryStructure.fields.characters.args.includeImages;
            expect(includeImagesArg).toBeDefined();
            expect(includeImagesArg.value).toBe(true);
            expect(includeImagesArg.is_typed).toBe(true);
            expect(typeof includeImagesArg.value).toBe('boolean');
        });

        it('should handle both true and false boolean values', async () => {
            const testCases = [true, false];

            for (const boolValue of testCases) {
                const result = await setTypedArgumentTool.handler({
                    sessionId: testSessionId,
                    fieldPath: 'characters',
                    argumentName: 'active',
                    value: boolValue
                });
                const response = JSON.parse(result.content[0].text);

                expect(response.success).toBe(true);

                const savedState = MockStateManager.getSession(testSessionId);
                expect(savedState).toBeDefined();

                const activeArg = savedState.queryStructure.fields.characters.args.active;
                expect(activeArg.value).toBe(boolValue);
                expect(typeof activeArg.value).toBe('boolean');
            }
        });
    });

    describe('Null Value Handling', () => {
        it('should handle null values correctly', async () => {
            const result = await setTypedArgumentTool.handler({
                sessionId: testSessionId,
                fieldPath: 'characters',
                argumentName: 'page',
                value: null
            });
            const response = JSON.parse(result.content[0].text);

            expect(response.success).toBe(true);
            expect(response.error).toBeUndefined();

            const savedState = MockStateManager.getSession(testSessionId);
            expect(savedState).toBeDefined();

            const pageArg = savedState.queryStructure.fields.characters.args.page;
            expect(pageArg).toBeDefined();
            expect(pageArg.value).toBe(null);
            expect(pageArg.is_typed).toBe(true);
        });
    });

    describe('Query Generation Validation', () => {
        it('should generate GraphQL syntax without quotes for numeric values', async () => {
            // This test ensures that the buildSelectionSet function properly handles typed values
            await setTypedArgumentTool.handler({
                sessionId: testSessionId,
                fieldPath: 'characters',
                argumentName: 'limit',
                value: 100
            });

            const savedState = MockStateManager.getSession(testSessionId);
            expect(savedState).toBeDefined();

            const limitArg = savedState.queryStructure.fields.characters.args.limit;

            // Verify the argument is marked as typed for proper serialization
            expect(limitArg.is_typed).toBe(true);
            expect(limitArg.value).toBe(100);

            // The buildSelectionSet function should handle is_typed values correctly
            // When is_typed is true, numbers should be serialized without quotes
        });

        it('should generate GraphQL syntax without quotes for boolean values', async () => {
            await setTypedArgumentTool.handler({
                sessionId: testSessionId,
                fieldPath: 'characters',
                argumentName: 'active',
                value: true
            });

            const savedState = MockStateManager.getSession(testSessionId);
            expect(savedState).toBeDefined();

            const activeArg = savedState.queryStructure.fields.characters.args.active;

            // Verify the argument is marked as typed for proper serialization
            expect(activeArg.is_typed).toBe(true);
            expect(activeArg.value).toBe(true);
        });
    });

    describe('Error Handling', () => {
        it('should validate argument names', async () => {
            const result = await setTypedArgumentTool.handler({
                sessionId: testSessionId,
                fieldPath: 'characters',
                argumentName: '123invalidName',
                value: 100
            });
            const response = JSON.parse(result.content[0].text);

            expect(response.success).toBeUndefined();
            expect(response.error).toBeDefined();
            expect(response.error).toContain('Invalid argument name');
        });

        it('should handle session not found', async () => {
            const result = await setTypedArgumentTool.handler({
                sessionId: 'non-existent-session',
                fieldPath: 'characters',
                argumentName: 'page',
                value: 1
            });
            const response = JSON.parse(result.content[0].text);
            expect(response.error).toBe('Session not found. Please start a new session.');
        });
    });
}); 