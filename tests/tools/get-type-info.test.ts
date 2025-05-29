import { describe, it, expect, vi } from 'vitest';
import { getTypeInfo } from '../../tools/get-type-info.js';
import { TEST_SCHEMA } from '../setup.js';

// Mock the shared-utils module to provide controlled test environment
vi.mock('../../tools/shared-utils.js', () => ({
    resolveEndpointAndHeaders: () => ({
        url: 'http://localhost:4000/graphql',
        headers: {}
    }),
    fetchAndCacheSchema: () => Promise.resolve(TEST_SCHEMA),
    getTypeNameStr: (gqlType: any) => {
        if (gqlType && gqlType.name) return gqlType.name;
        return String(gqlType);
    }
}));

describe('get-type-info CRITICAL Bug Fix', () => {
    describe('Issue #1: Complete Function Failure', () => {
        it('should return type information for valid GraphQL types without serialization errors', async () => {
            // Test the critical bug - function should not return serialization errors
            const result = await getTypeInfo('User');

            // ASSERTION: Should not contain the reported error
            expect(result.error).toBeUndefined();
            expect(result.error).not.toBe('Cannot convert object to primitive value');

            // ASSERTION: Should return valid type information structure
            expect(result.name).toBe('User');
            expect(result.kind).toBeDefined();
            expect(result.description).toBeDefined();
            expect(result.fields).toBeDefined();
            expect(Array.isArray(result.fields)).toBe(true);
        });

        it('should return proper field information for object types', async () => {
            const result = await getTypeInfo('User');

            expect(result.fields).toBeDefined();
            const fields = result.fields!;

            // Should have expected User fields from TEST_SCHEMA
            const fieldNames = fields.map(f => f.name);
            expect(fieldNames).toContain('id');
            expect(fieldNames).toContain('name');
            expect(fieldNames).toContain('email');
            expect(fieldNames).toContain('active');

            // Each field should have proper structure
            fields.forEach(field => {
                expect(field.name).toBeDefined();
                expect(field.type).toBeDefined();
                expect(field.description).toBeDefined();
                expect(field.args).toBeDefined();
                expect(Array.isArray(field.args)).toBe(true);
            });
        });

        it('should handle multiple valid type names without errors', async () => {
            const typeNames = ['User', 'Character', 'Location', 'Episode'];

            for (const typeName of typeNames) {
                const result = await getTypeInfo(typeName);

                // Should not have serialization errors
                expect(result.error).toBeUndefined();
                expect(result.name).toBe(typeName);
                expect(result.fields).toBeDefined();
            }
        });

        it('should handle enum types correctly', async () => {
            const result = await getTypeInfo('TestEnum');

            expect(result.error).toBeUndefined();
            expect(result.name).toBe('TestEnum');
            expect(result.enum_values).toBeDefined();
            expect(Array.isArray(result.enum_values)).toBe(true);

            const enumValues = result.enum_values!;
            const valueNames = enumValues.map(v => v.name);
            expect(valueNames).toContain('OPTION_A');
            expect(valueNames).toContain('OPTION_B');
            expect(valueNames).toContain('OPTION_C');
        });

        it('should handle input object types correctly', async () => {
            const result = await getTypeInfo('UserInput');

            expect(result.error).toBeUndefined();
            expect(result.name).toBe('UserInput');
            expect(result.input_fields).toBeDefined();
            expect(Array.isArray(result.input_fields)).toBe(true);

            const inputFields = result.input_fields!;
            const fieldNames = inputFields.map(f => f.name);
            expect(fieldNames).toContain('name');
            expect(fieldNames).toContain('email');
            expect(fieldNames).toContain('active');
        });

        it('should return appropriate error for non-existent types', async () => {
            const result = await getTypeInfo('NonExistentType');

            expect(result.error).toBeDefined();
            expect(result.error).toContain('Type \'NonExistentType\' not found in schema');
            expect(result.name).toBeUndefined();
            expect(result.fields).toBeUndefined();
        });

        it('should handle complex field arguments correctly', async () => {
            const result = await getTypeInfo('Query');

            expect(result.error).toBeUndefined();
            expect(result.fields).toBeDefined();

            // Find the complexField to test argument handling
            const complexField = result.fields!.find(f => f.name === 'complexField');
            expect(complexField).toBeDefined();
            expect(complexField.args).toBeDefined();
            expect(Array.isArray(complexField.args)).toBe(true);

            // Should have all expected argument types
            const argNames = complexField.args.map((arg: any) => arg.name);
            expect(argNames).toContain('stringArg');
            expect(argNames).toContain('intArg');
            expect(argNames).toContain('floatArg');
            expect(argNames).toContain('boolArg');
            expect(argNames).toContain('enumArg');
            expect(argNames).toContain('inputArg');
        });

        // Test that our safe serialization functions work correctly
        it('should handle problematic description and defaultValue objects safely', async () => {
            const result = await getTypeInfo('User');

            expect(result.error).toBeUndefined();
            expect(result.name).toBe('User');

            // All field descriptions should be strings or null
            if (result.fields) {
                result.fields.forEach(field => {
                    expect(typeof field.description === 'string' || field.description === null).toBe(true);
                    field.args.forEach((arg: any) => {
                        expect(typeof arg.description === 'string' || arg.description === null).toBe(true);
                        if (arg.defaultValue !== null) {
                            // Default values can be various types, so we just check it's not undefined
                            expect(arg.defaultValue).toBeDefined();
                        }
                    });
                });
            }
        });
    });

    describe('Expected Behavior Validation', () => {
        it('should return JSON-serializable data without circular references', async () => {
            const result = await getTypeInfo('User');

            // Should be able to stringify without errors
            expect(() => JSON.stringify(result)).not.toThrow();

            // Should be able to parse back
            const serialized = JSON.stringify(result);
            expect(() => JSON.parse(serialized)).not.toThrow();
        });
    });
}); 