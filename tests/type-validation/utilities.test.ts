import { describe, it, expect } from 'vitest';
import { buildQueryFromStructure, GraphQLValidationUtils } from '../../tools/shared-utils';

describe('buildQueryFromStructure', () => {
    it('should build a simple query correctly', () => {
        const queryStructure = {
            fields: {
                user: {
                    fieldName: 'user',
                    args: { id: '123' },
                    fields: {
                        id: { fieldName: 'id' },
                        name: { fieldName: 'name' },
                    },
                },
            },
        };
        const operationType = 'query';
        const variablesSchema = {};
        const queryString = buildQueryFromStructure(queryStructure, operationType, variablesSchema);

        const expectedQuery = `query {
  user(id: "123") {
    id
    name
  }
}`;
        expect(queryString.replace(/\s+/g, ' ').trim()).toBe(expectedQuery.replace(/\s+/g, ' ').trim());
    });

    it('should handle variables and operation name', () => {
        const queryStructure = {
            fields: {
                user: {
                    fieldName: 'user',
                    args: { id: '$userId' },
                    fields: {
                        id: { fieldName: 'id' },
                    },
                },
            },
        };
        const operationType = 'query';
        const variablesSchema = { '$userId': 'ID!' };
        const operationName = 'GetUser';
        const queryString = buildQueryFromStructure(queryStructure, operationType, variablesSchema, operationName);

        const expectedQuery = `query GetUser($userId: ID!) {
            user(id: $userId) {
              id
            }
          }`;
        expect(queryString.replace(/\s+/g, ' ').trim()).toBe(expectedQuery.replace(/\s+/g, ' ').trim());
    });

    it('should handle directives', () => {
        const queryStructure = {
            fields: {
                user: {
                    fieldName: 'user',
                    args: { id: '123' },
                    fields: {
                        id: { fieldName: 'id' },
                        name: { fieldName: 'name' },
                    },
                    directives: [{ name: 'include', arguments: [{ name: 'if', value: true }] }],
                },
            },
        };
        const operationType = 'query';
        const variablesSchema = {};
        const queryString = buildQueryFromStructure(queryStructure, operationType, variablesSchema);
        const expectedQuery = `query {
            user(id: "123") @include(if: true) {
              id
              name
            }
          }`;
        expect(queryString.replace(/\s+/g, ' ').trim()).toBe(expectedQuery.replace(/\s+/g, ' ').trim());
    });

    it('should handle fragments', () => {
        const queryStructure = {
            fields: {
                user: {
                    fieldName: 'user',
                    args: { id: '123' },
                    fragmentSpreads: ['userFields'],
                },
            },
        };
        const fragments = {
            userFields: {
                onType: 'User',
                fields: {
                    id: { fieldName: 'id' },
                    name: { fieldName: 'name' }
                }
            }
        };
        const operationType = 'query';
        const variablesSchema = {};
        const queryString = buildQueryFromStructure(queryStructure, operationType, variablesSchema, null, fragments);
        const expectedQuery = `query {
            user(id: "123") {
              ...userFields
            }
          }
          fragment userFields on User {
            id
            name
          }`;
        expect(queryString.replace(/\s+/g, ' ').trim()).toBe(expectedQuery.replace(/\s+/g, ' ').trim());
    });
});

describe('GraphQLValidationUtils', () => {
    it('should validate GraphQL names correctly', () => {
        expect(GraphQLValidationUtils.isValidGraphQLName('validName')).toBe(true);
        expect(GraphQLValidationUtils.isValidGraphQLName('_validName')).toBe(true);
        expect(GraphQLValidationUtils.isValidGraphQLName('invalid-name')).toBe(false);
        expect(GraphQLValidationUtils.isValidGraphQLName('1invalid')).toBe(false);
    });

    it('should validate variable names correctly', () => {
        expect(GraphQLValidationUtils.validateVariableName('$validVar').valid).toBe(true);
        expect(GraphQLValidationUtils.validateVariableName('invalidVar').valid).toBe(false);
    });

    it('should validate directive names correctly', () => {
        expect(GraphQLValidationUtils.isValidGraphQLName('validDirective')).toBe(true);
        expect(GraphQLValidationUtils.isValidGraphQLName('invalid-directive')).toBe(false);
    });

    it('should serialize GraphQL values correctly', () => {
        expect(GraphQLValidationUtils.serializeGraphQLValue("hello")).toBe('"hello"');
        expect(GraphQLValidationUtils.serializeGraphQLValue(123)).toBe('123');
        expect(GraphQLValidationUtils.serializeGraphQLValue(true)).toBe('true');
        expect(GraphQLValidationUtils.serializeGraphQLValue(null)).toBe('null');
        expect(GraphQLValidationUtils.serializeGraphQLValue({ a: 1, b: "test" })).toBe('{a: 1, b: "test"}');
        expect(GraphQLValidationUtils.serializeGraphQLValue([1, "test"])).toBe('[1, "test"]');
    });
}); 