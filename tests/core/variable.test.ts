import { describe, it, expect, vi } from 'vitest';
import { expectSuccess } from '../test-helpers.js';

const mockQueryState = {
    variablesSchema: {
        '$characterId': 'ID!',
        '$includeStatus': 'Boolean!',
        '$page': 'Int',
        '$userId': 'String!'
    },
    variablesValues: {},
    variablesDefaults: {},
    queryStructure: {
        fields: {}
    },
    operationDirectives: []
};

vi.mock('../../tools/shared-utils', async () => {
    const { createSharedUtilsMock } = await import('../setup');

    return createSharedUtilsMock({
        loadQueryState: vi.fn().mockResolvedValue(mockQueryState),
    });
});

describe('Variable Management', () => {
    it('should set a query variable', async () => {
        const { setQueryVariable } = await import('../../tools/set-query-variable');
        const result = await setQueryVariable('test-session', '$userId', 'String!');
        expect(result.success).toBe(true);
        expect(result.message).toContain("Variable '$userId' set to type 'String!'");
    });

    it('should set a variable value', async () => {
        const { setVariableValue } = await import('../../tools/set-variable-value');
        const result = await setVariableValue('test-session', '$userId', '123');
        expect(result.success).toBe(true);
        expect(result.message).toContain("Variable '$userId' value set to \"123\".");
    });

    describe('Variable Value Type Validation', () => {
        it('should accept string values for ID! variables', async () => {
            const { setVariableValue } = await import('../../tools/set-variable-value');
            const result = await setVariableValue('test-session', '$characterId', '1');

            expectSuccess(result, "Variable '$characterId' value set to \"1\"");
        });

        it('should accept number values for ID! variables', async () => {
            const { setVariableValue } = await import('../../tools/set-variable-value');
            const result = await setVariableValue('test-session', '$characterId', 1);

            expectSuccess(result, "Variable '$characterId' value set to 1");
        });

        it('should accept boolean values for Boolean! variables', async () => {
            const { setVariableValue } = await import('../../tools/set-variable-value');
            const result = await setVariableValue('test-session', '$includeStatus', true);

            expectSuccess(result, "Variable '$includeStatus' value set to true");
        });

        it('should accept null values for nullable variables', async () => {
            const { setVariableValue } = await import('../../tools/set-variable-value');
            const result = await setVariableValue('test-session', '$page', null);

            expectSuccess(result, "Variable '$page' value set to null");
        });
    });

    describe('Default Value Type Validation', () => {
        it('should accept boolean defaultValue for Boolean! variables', async () => {
            const { setQueryVariable } = await import('../../tools/set-query-variable');
            const result = await setQueryVariable('test-session', '$includeStatus', 'Boolean!', true);

            expectSuccess(result, "Variable '$includeStatus' set to type 'Boolean!' with default value true");
        });

        it('should accept number defaultValue for Int variables', async () => {
            const { setQueryVariable } = await import('../../tools/set-query-variable');
            const result = await setQueryVariable('test-session', '$page', 'Int', 1);

            expectSuccess(result, "Variable '$page' set to type 'Int' with default value 1");
        });

        it('should accept string defaultValue for String variables', async () => {
            const { setQueryVariable } = await import('../../tools/set-query-variable');
            const result = await setQueryVariable('test-session', '$name', 'String', 'Rick');

            expectSuccess(result, "Variable '$name' set to type 'String' with default value \"Rick\"");
        });
    });

    // Keep legacy tests for backwards compatibility
    it('should accept string value for ID! variable', async () => {
        const { setVariableValue } = await import('../../tools/set-variable-value');
        const result = await setVariableValue('test-session', '$characterId', '1');

        expectSuccess(result);
    });

    it('should accept number value for ID! variable', async () => {
        const { setVariableValue } = await import('../../tools/set-variable-value');
        const result = await setVariableValue('test-session', '$characterId', 1);

        expectSuccess(result);
    });

    it('should accept boolean value for Boolean! variable', async () => {
        const { setVariableValue } = await import('../../tools/set-variable-value');
        const result = await setVariableValue('test-session', '$includeStatus', true);

        expectSuccess(result);
    });

    it('should accept boolean default value for Boolean! variable', async () => {
        const { setQueryVariable } = await import('../../tools/set-query-variable');
        const result = await setQueryVariable('test-session', '$newBoolVar', 'Boolean!', true);

        expectSuccess(result);
    });

    it('should remove a query variable', async () => {
        const { removeQueryVariable } = await import('../../tools/remove-query-variable');
        const result = await removeQueryVariable('test-session', '$userId');
        expect(result.success).toBe(true);
        expect(result.message).toContain("Variable '$userId' removed from query.");
    });
});

describe('Query Variables - Error Handling', () => {
    it('should return an error when setting value for a non-existent variable', async () => {
        const { setVariableValue } = await import('../../tools/set-variable-value');
        const result = await setVariableValue('test-session', '$nonExistent', 'some-value');
        expect(result.error).toContain("Variable '$nonExistent' is not defined in the query schema. Use set-query-variable first.");
    });

    it('should return an error when removing a non-existent variable', async () => {
        const { removeQueryVariable } = await import('../../tools/remove-query-variable');
        const result = await removeQueryVariable('test-session', '$nonExistent');
        expect(result.error).toContain("Variable '$nonExistent' not defined.");
    });
}); 