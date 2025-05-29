import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { startQuerySessionTool } from '../../tools/start-query-session.js';
import { selectFieldTool } from '../../tools/select-field.js';
import { setTypedArgumentTool } from '../../tools/set-typed-argument.js';
import { setStringArgumentTool } from '../../tools/set-string-argument.js';
import { setFieldDirectiveTool } from '../../tools/set-field-directive.js';
import { setQueryVariableTool } from '../../tools/set-query-variable.js';
import { setVariableValueTool } from '../../tools/set-variable-value.js';
import { getCurrentQueryTool } from '../../tools/get-current-query.js';
import { endQuerySessionTool } from '../../tools/end-query-session.js';
import { GraphQLValidationUtils } from '../../tools/shared-utils.js';

vi.mock('../../tools/shared-utils', async () => {
    const { createSharedUtilsMock } = await import('../setup');
    const { buildSchema } = await import('graphql');
    const originalSharedUtils = await vi.importActual('../../tools/shared-utils') as any;

    const testSchema = buildSchema(`
        type Character {
            id: ID!
            name: String
        }
        
        type Query {
            characters(page: Int, active: Boolean, score: Float): [Character]
        }
    `);

    // Initialize shared state inside the mock
    const mockQueryState = {
        headers: {},
        operationType: 'query',
        operationTypeName: 'Query',
        operationName: 'TestQuery',
        queryStructure: {
            fields: {},
            fragmentSpreads: [],
            inlineFragments: []
        },
        fragments: {},
        variablesSchema: {},
        variablesDefaults: {},
        variablesValues: {},
        operationDirectives: [],
        createdAt: new Date().toISOString()
    };

    return {
        ...createSharedUtilsMock({
            fetchAndCacheSchema: vi.fn().mockResolvedValue(testSchema),
            loadQueryState: vi.fn().mockImplementation(() => {
                return Promise.resolve({ ...mockQueryState });
            }),
            saveQueryState: vi.fn().mockImplementation(async (sessionId, newState) => {
                Object.assign(mockQueryState, newState);
                return undefined;
            }),
        }),
        // Keep the real GraphQLValidationUtils for testing
        GraphQLValidationUtils: originalSharedUtils.GraphQLValidationUtils,
    };
});

describe('Type Coercion Fix - Resolving Tester-Reported Issues', () => {
    let sessionId: string;

    beforeEach(async () => {
        const result = await startQuerySessionTool.handler({
            operationType: 'query',
            operationName: 'CoercionTestQuery',
        });

        const parsed = JSON.parse(result.content[0].text);
        sessionId = parsed.sessionId;
        expect(sessionId).toBeDefined();
    });

    describe('🔧 Type Coercion Unit Tests', () => {
        describe('Integer coercion', () => {
            it('should coerce JavaScript number to integer', () => {
                expect(GraphQLValidationUtils.coerceToInteger(1)).toBe(1);
                expect(GraphQLValidationUtils.coerceToInteger(0)).toBe(0);
                expect(GraphQLValidationUtils.coerceToInteger(-5)).toBe(-5);
            });

            it('should coerce string numbers to integer (protocol conversion case)', () => {
                expect(GraphQLValidationUtils.coerceToInteger("1")).toBe(1);
                expect(GraphQLValidationUtils.coerceToInteger("0")).toBe(0);
                expect(GraphQLValidationUtils.coerceToInteger("-5")).toBe(-5);
            });

            it('should reject float as integer', () => {
                expect(GraphQLValidationUtils.coerceToInteger(1.5)).toBeNull();
                expect(GraphQLValidationUtils.coerceToInteger("1.5")).toBeNull();
            });

            it('should reject invalid strings', () => {
                expect(GraphQLValidationUtils.coerceToInteger("abc")).toBeNull();
                expect(GraphQLValidationUtils.coerceToInteger("1abc")).toBeNull();
                expect(GraphQLValidationUtils.coerceToInteger("")).toBeNull();
            });

            it('should reject booleans', () => {
                expect(GraphQLValidationUtils.coerceToInteger(true)).toBeNull();
                expect(GraphQLValidationUtils.coerceToInteger(false)).toBeNull();
            });
        });

        describe('Boolean coercion', () => {
            it('should coerce JavaScript boolean', () => {
                expect(GraphQLValidationUtils.coerceToBoolean(true)).toBe(true);
                expect(GraphQLValidationUtils.coerceToBoolean(false)).toBe(false);
            });

            it('should coerce string booleans (protocol conversion case)', () => {
                expect(GraphQLValidationUtils.coerceToBoolean("true")).toBe(true);
                expect(GraphQLValidationUtils.coerceToBoolean("false")).toBe(false);
                expect(GraphQLValidationUtils.coerceToBoolean("TRUE")).toBe(true);
                expect(GraphQLValidationUtils.coerceToBoolean("FALSE")).toBe(false);
            });

            it('should reject invalid strings', () => {
                expect(GraphQLValidationUtils.coerceToBoolean("yes")).toBeNull();
                expect(GraphQLValidationUtils.coerceToBoolean("no")).toBeNull();
                expect(GraphQLValidationUtils.coerceToBoolean("1")).toBeNull();
                expect(GraphQLValidationUtils.coerceToBoolean("0")).toBeNull();
            });

            it('should reject numbers', () => {
                expect(GraphQLValidationUtils.coerceToBoolean(1)).toBeNull();
                expect(GraphQLValidationUtils.coerceToBoolean(0)).toBeNull();
            });
        });

        describe('Float coercion', () => {
            it('should coerce JavaScript numbers', () => {
                expect(GraphQLValidationUtils.coerceToFloat(1.5)).toBe(1.5);
                expect(GraphQLValidationUtils.coerceToFloat(1)).toBe(1);
                expect(GraphQLValidationUtils.coerceToFloat(0)).toBe(0);
            });

            it('should coerce string numbers (protocol conversion case)', () => {
                expect(GraphQLValidationUtils.coerceToFloat("1.5")).toBe(1.5);
                expect(GraphQLValidationUtils.coerceToFloat("1")).toBe(1);
                expect(GraphQLValidationUtils.coerceToFloat("-3.14")).toBe(-3.14);
            });

            it('should reject invalid strings', () => {
                expect(GraphQLValidationUtils.coerceToFloat("abc")).toBeNull();
                expect(GraphQLValidationUtils.coerceToFloat("")).toBeNull();
                expect(GraphQLValidationUtils.coerceToFloat("Infinity")).toBeNull();
            });
        });
    });

    describe('🚨 Fixing Tester-Reported Failures', () => {
        it('should now PASS: set-typed-argument with JavaScript number 1', async () => {
            await selectFieldTool.handler({
                sessionId,
                fieldName: 'characters',

            });

            const result = await setTypedArgumentTool.handler({
                sessionId,
                fieldPath: 'characters',
                argumentName: 'page',
                value: 1,

            });

            const response = JSON.parse(result.content[0].text);

            expect(response.success).toBe(true);
            expect(response.error).toBeUndefined();
        });

        it('should now PASS: set-typed-argument with STRING "1" (protocol conversion case)', async () => {
            await selectFieldTool.handler({
                sessionId,
                fieldName: 'characters',

            });

            // Simulate what happens when MCP protocol converts number to string
            const result = await setTypedArgumentTool.handler({
                sessionId,
                fieldPath: 'characters',
                argumentName: 'page',
                value: "1", // String instead of number

            });

            const response = JSON.parse(result.content[0].text);

            // This should now succeed with our enhanced string-to-number coercion
            expect(response.success).toBe(true);
            expect(response.error).toBeUndefined();
        });

        it('should now PASS: set-field-directive with JavaScript boolean true', async () => {
            await selectFieldTool.handler({
                sessionId,
                fieldName: 'characters',

            });

            const result = await setFieldDirectiveTool.handler({
                sessionId,
                fieldPath: 'characters',
                directiveName: 'include',
                argumentName: 'if',
                argumentValue: true,

            });

            const response = JSON.parse(result.content[0].text);

            expect(response.success).toBe(true);
            expect(response.error).toBeUndefined();
        });

        it('should now PASS: set-field-directive with STRING "true" (protocol conversion case)', async () => {
            await selectFieldTool.handler({
                sessionId,
                fieldName: 'characters',

            });

            const result = await setFieldDirectiveTool.handler({
                sessionId,
                fieldPath: 'characters',
                directiveName: 'include',
                argumentName: 'if',
                argumentValue: "true", // String instead of boolean

            });

            const response = JSON.parse(result.content[0].text);

            // This should now work with type coercion
            expect(response.success).toBe(true);
            expect(response.error).toBeUndefined();
        });

        it('should now PASS: set-query-variable with default value 1', async () => {
            const result = await setQueryVariableTool.handler({
                sessionId,
                variableName: '$page',
                variableType: 'Int',
                defaultValue: 1,

            });

            const response = JSON.parse(result.content[0].text);

            expect(response.success).toBe(true);
            expect(response.error).toBeUndefined();
        });

        it('should now PASS: set-query-variable with STRING "1" default value (protocol conversion case)', async () => {
            const result = await setQueryVariableTool.handler({
                sessionId,
                variableName: '$count',
                variableType: 'Int',
                defaultValue: "1", // String instead of number

            });

            const response = JSON.parse(result.content[0].text);

            // This should now work with type coercion
            expect(response.success).toBe(true);
            expect(response.error).toBeUndefined();
        });

        it('should now PASS: set-variable-value with runtime value 1', async () => {
            await setQueryVariableTool.handler({
                sessionId,
                variableName: '$page',
                variableType: 'Int',

            });

            const result = await setVariableValueTool.handler({
                sessionId,
                variableName: '$page',
                value: 1,

            });

            const response = JSON.parse(result.content[0].text);

            expect(response.success).toBe(true);
            expect(response.error).toBeUndefined();
        });

        it('should now PASS: set-variable-value with STRING "1" (protocol conversion case)', async () => {
            await setQueryVariableTool.handler({
                sessionId,
                variableName: '$offset',
                variableType: 'Int',

            });

            const result = await setVariableValueTool.handler({
                sessionId,
                variableName: '$offset',
                value: "1", // String instead of number

            });

            const response = JSON.parse(result.content[0].text);

            // This should now work with type coercion
            expect(response.success).toBe(true);
            expect(response.error).toBeUndefined();
        });
    });

    describe('🔒 Proper Error Handling', () => {
        it('should still reject invalid string for Int', async () => {
            await selectFieldTool.handler({ sessionId, fieldName: 'characters' });
            const result = await setTypedArgumentTool.handler({
                sessionId,
                fieldPath: 'characters',
                argumentName: 'page',
                value: "not_a_number",
            });
            const response = JSON.parse(result.content[0].text);
            expect(response.error).toBeDefined();
            expect(response.error).toContain("Invalid value");
        });

        it('should still reject invalid string for Boolean', async () => {
            await selectFieldTool.handler({
                sessionId,
                fieldName: 'characters',

            });

            const result = await setFieldDirectiveTool.handler({
                sessionId,
                fieldPath: 'characters',
                directiveName: 'include',
                argumentName: 'if',
                argumentValue: "not_a_boolean",

            });

            const response = JSON.parse(result.content[0].text);
            expect(response.error).toBeDefined();
            expect(response.error).toContain('Boolean expects a boolean');
        });
    });

    afterEach(async () => {
        if (sessionId) {
            await endQuerySessionTool.handler({ sessionId });
        }
    });
}); 