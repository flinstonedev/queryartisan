import { describe, it, expect } from 'vitest';
import { GraphQLValidationUtils } from '../../tools/shared-utils.js';
import { GraphQLInt, GraphQLBoolean, GraphQLString, GraphQLFloat, GraphQLID, GraphQLNonNull } from 'graphql';

describe('Core Type Validation Unit Tests', () => {
    describe('GraphQLValidationUtils.validateValueAgainstType', () => {
        describe('Int type validation', () => {
            it('should accept JavaScript number 1 as GraphQL Int', () => {
                const result = GraphQLValidationUtils.validateValueAgainstType(1, GraphQLInt);
                expect(result).toBeNull(); // null means no error
            });

            it('should accept JavaScript number 0 as GraphQL Int', () => {
                const result = GraphQLValidationUtils.validateValueAgainstType(0, GraphQLInt);
                expect(result).toBeNull();
            });

            it('should accept negative numbers as GraphQL Int', () => {
                const result = GraphQLValidationUtils.validateValueAgainstType(-5, GraphQLInt);
                expect(result).toBeNull();
            });

            it('should reject JavaScript float as GraphQL Int', () => {
                const result = GraphQLValidationUtils.validateValueAgainstType(1.5, GraphQLInt);
                expect(result).toContain('Int expects an integer');
            });

            it('should accept valid string numbers as GraphQL Int (type coercion)', () => {
                const result = GraphQLValidationUtils.validateValueAgainstType("1", GraphQLInt);
                expect(result).toBeNull(); // Now accepts due to type coercion
            });

            it('should reject invalid string as GraphQL Int', () => {
                const result = GraphQLValidationUtils.validateValueAgainstType("not_a_number", GraphQLInt);
                expect(result).toContain('Int expects an integer');
            });

            it('should reject null for NonNull Int', () => {
                const nonNullInt = new GraphQLNonNull(GraphQLInt);
                const result = GraphQLValidationUtils.validateValueAgainstType(null, nonNullInt);
                expect(result).toContain('non-nullable');
            });
        });

        describe('Boolean type validation', () => {
            it('should accept JavaScript boolean true as GraphQL Boolean', () => {
                const result = GraphQLValidationUtils.validateValueAgainstType(true, GraphQLBoolean);
                expect(result).toBeNull();
            });

            it('should accept JavaScript boolean false as GraphQL Boolean', () => {
                const result = GraphQLValidationUtils.validateValueAgainstType(false, GraphQLBoolean);
                expect(result).toBeNull();
            });

            it('should accept valid string booleans as GraphQL Boolean (type coercion)', () => {
                const result = GraphQLValidationUtils.validateValueAgainstType("true", GraphQLBoolean);
                expect(result).toBeNull(); // Now accepts due to type coercion
            });

            it('should reject invalid string as GraphQL Boolean', () => {
                const result = GraphQLValidationUtils.validateValueAgainstType("not_a_boolean", GraphQLBoolean);
                expect(result).toContain('Boolean expects a boolean');
            });

            it('should reject number as GraphQL Boolean', () => {
                const result = GraphQLValidationUtils.validateValueAgainstType(1, GraphQLBoolean);
                expect(result).toContain('Boolean expects a boolean');
            });
        });

        describe('String type validation', () => {
            it('should accept JavaScript string as GraphQL String', () => {
                const result = GraphQLValidationUtils.validateValueAgainstType("hello", GraphQLString);
                expect(result).toBeNull();
            });

            it('should reject number as GraphQL String', () => {
                const result = GraphQLValidationUtils.validateValueAgainstType(123, GraphQLString);
                expect(result).toContain('String expects a string');
            });
        });

        describe('ID type validation', () => {
            it('should accept JavaScript string as GraphQL ID', () => {
                const result = GraphQLValidationUtils.validateValueAgainstType("123", GraphQLID);
                expect(result).toBeNull();
            });

            it('should accept JavaScript number as GraphQL ID', () => {
                const result = GraphQLValidationUtils.validateValueAgainstType(123, GraphQLID);
                expect(result).toBeNull();
            });

            it('should reject boolean as GraphQL ID', () => {
                const result = GraphQLValidationUtils.validateValueAgainstType(true, GraphQLID);
                expect(result).toContain('ID expects a string or number');
            });
        });

        describe('Float type validation', () => {
            it('should accept JavaScript number as GraphQL Float', () => {
                const result = GraphQLValidationUtils.validateValueAgainstType(3.14, GraphQLFloat);
                expect(result).toBeNull();
            });

            it('should accept JavaScript integer as GraphQL Float', () => {
                const result = GraphQLValidationUtils.validateValueAgainstType(42, GraphQLFloat);
                expect(result).toBeNull();
            });

            it('should accept valid string numbers as GraphQL Float (type coercion)', () => {
                const result = GraphQLValidationUtils.validateValueAgainstType("3.14", GraphQLFloat);
                expect(result).toBeNull(); // Now accepts due to type coercion
            });

            it('should reject invalid string as GraphQL Float', () => {
                const result = GraphQLValidationUtils.validateValueAgainstType("not_a_number", GraphQLFloat);
                expect(result).toContain('Float expects a number');
            });
        });

        describe('Type validation edge cases', () => {
            it('should validate Int and Boolean types correctly', () => {
                const intResult = GraphQLValidationUtils.validateValueAgainstType(1, GraphQLInt);
                expect(intResult).toBeNull();

                const boolResult = GraphQLValidationUtils.validateValueAgainstType(true, GraphQLBoolean);
                expect(boolResult).toBeNull();
            });

            it('should show proper error messages for type mismatches', () => {
                const intError = GraphQLValidationUtils.validateValueAgainstType("not_a_number", GraphQLInt);
                expect(intError).toContain('Int expects an integer');
                expect(intError).toContain('not_a_number');

                const boolError = GraphQLValidationUtils.validateValueAgainstType("not_a_boolean", GraphQLBoolean);
                expect(boolError).toContain('Boolean expects a boolean');
                expect(boolError).toContain('string');
            });
        });
    });
}); 