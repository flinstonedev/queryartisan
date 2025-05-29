import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { buildSchema } from 'graphql';
import * as sharedUtils from '../../tools/shared-utils';
import { MockStateManager } from '../setup';

// Import the core business logic functions for integration testing
import { createQuerySession } from '../../tools/start-query-session';
import { selectGraphQLField } from '../../tools/select-field';
import { setQueryVariable } from '../../tools/set-query-variable';
import { setVariableArgument } from '../../tools/set-variable-argument';
import { getCurrentQuery } from '../../tools/get-current-query';
import { validateGraphQLQuery } from '../../tools/validate-query';
import { executeGraphQLQuery } from '../../tools/execute-query';
import { endQuerySession } from '../../tools/end-query-session';

// Mock GraphQLValidationUtils comprehensively
vi.mock('../../tools/validation-utils', () => ({
    GraphQLValidationUtils: {
        validateFieldAlias: vi.fn().mockReturnValue({ valid: true }),
        validateVariableName: vi.fn().mockReturnValue({ valid: true }),
        validateVariableType: vi.fn().mockReturnValue({ valid: true }),
        validateFieldInSchema: vi.fn().mockReturnValue({ valid: true }),
        validateOperationName: vi.fn().mockReturnValue({ valid: true }),
        serializeGraphQLValue: vi.fn((value) => JSON.stringify(value)),
        coerceToInteger: vi.fn((value) => parseInt(value)),
        coerceToBoolean: vi.fn((value) => Boolean(value)),
        coerceToFloat: vi.fn((value) => parseFloat(value)),
    }
}));

const mockGraphQLSchema = buildSchema(`
    type Query {
        user(id: ID!): User
        users(limit: Int = 10, offset: Int = 0): [User!]!
        posts: [Post!]!
    }
    
    type User {
        id: ID!
        name: String!
        email: String
        posts(limit: Int): [Post!]!
        avatar: Avatar
    }
    
    type Post {
        id: ID!
        title: String!
        content: String
        author: User!
        tags: [String!]!
    }
    
    type Avatar {
        url: String!
        size: AvatarSize!
    }
    
    enum AvatarSize {
        SMALL
        MEDIUM
        LARGE
    }
`);

// Proper deep merge helper for tests
function deepMerge(target: any, source: any): any {
    if (source === null || typeof source !== 'object') {
        return source;
    }

    if (Array.isArray(source)) {
        return [...source];
    }

    const result = { ...target };

    for (const key in source) {
        if (source.hasOwnProperty(key)) {
            if (source[key] !== null && typeof source[key] === 'object' && !Array.isArray(source[key])) {
                result[key] = deepMerge(result[key] || {}, source[key]);
            } else {
                result[key] = source[key];
            }
        }
    }

    return result;
}

describe('Integration Tests - Complete Query Building Workflow', () => {
    let sessionState: any;

    beforeEach(() => {
        // Clear all mocks before setting up new ones
        vi.clearAllMocks();

        // Initialize fresh session state
        sessionState = {};

        // Set up all mocks with comprehensive shared-utils functions
        vi.spyOn(sharedUtils, 'generateSessionId').mockReturnValue('integration-test-session');
        vi.spyOn(sharedUtils, 'resolveEndpointAndHeaders').mockImplementation(() => ({
            url: 'http://localhost:4000/graphql',
            headers: {}
        }));
        vi.spyOn(sharedUtils, 'fetchAndCacheSchema').mockImplementation(async (headers) => mockGraphQLSchema);

        // Add missing functions that tests expect
        vi.spyOn(sharedUtils, 'getTypeNameStr').mockImplementation((type: any) => {
            if (!type) return 'Unknown';
            if (type.name) return type.name;
            if (type.ofType) return type.ofType.name + '!';
            return type.toString();
        });

        vi.spyOn(sharedUtils, 'saveQueryState').mockImplementation(async (sessionId, state) => {
            sessionState = deepMerge(sessionState, state);
            sessionState.sessionId = sessionId;
        });

        vi.spyOn(sharedUtils, 'loadQueryState').mockImplementation(async (sessionId) => {
            if (sessionState && sessionState.sessionId === sessionId) {
                return JSON.parse(JSON.stringify(sessionState));
            }
            return null;
        });

        vi.spyOn(sharedUtils, 'deleteQueryState').mockImplementation(async (sessionId) => {
            if (sessionState && sessionState.sessionId === sessionId) {
                sessionState = {};
                return true;
            }
            return false;
        });

        // Mock buildQueryFromStructure to properly handle variable declarations
        vi.spyOn(sharedUtils, 'buildQueryFromStructure').mockImplementation((
            queryStructure: any,
            operationType = 'query',
            variablesSchema = {},
            operationName?: string | null,
            fragments = {},
            operationDirectives = [],
            variablesDefaults = {}
        ) => {
            if (!queryStructure || !queryStructure.fields) {
                return `${operationType} { }`;
            }

            // Build variables declaration if present
            let variablesDeclaration = '';
            if (variablesSchema && Object.keys(variablesSchema).length > 0) {
                const variables = Object.entries(variablesSchema).map(([varName, varType]: [string, any]) => {
                    let typeStr = typeof varType === 'string' ? varType : String(varType);

                    // Add default value if present
                    const defaultValue = variablesDefaults[varName];
                    if (defaultValue !== undefined) {
                        if (typeof defaultValue === 'string' && !defaultValue.startsWith('$')) {
                            typeStr += ` = "${defaultValue}"`;
                        } else {
                            typeStr += ` = ${defaultValue}`;
                        }
                    }

                    return `${varName}: ${typeStr}`;
                }).join(', ');
                variablesDeclaration = `(${variables})`;
            }

            // Build operation header
            let operationHeader = operationType;
            if (operationName) {
                operationHeader += ` ${operationName}`;
            }
            operationHeader += variablesDeclaration;

            // Simple field building for the test
            const buildFields = (fields: any, depth = 1): string => {
                return Object.entries(fields).map(([fieldKey, field]: [string, any]) => {
                    const indent = '  '.repeat(depth);
                    let fieldStr = `${indent}${fieldKey}`;

                    // Handle arguments
                    if (field.args && Object.keys(field.args).length > 0) {
                        const args = Object.entries(field.args).map(([argName, argValue]: [string, any]) => {
                            return `${argName}: ${argValue}`;
                        }).join(', ');
                        fieldStr += `(${args})`;
                    }

                    // Handle directives
                    if (field.directives && field.directives.length > 0) {
                        const directives = field.directives.map((directive: any) => {
                            let directiveStr = `@${directive.name}`;
                            if (directive.arguments && directive.arguments.length > 0) {
                                const dirArgs = directive.arguments.map((arg: any) => `${arg.name}: ${arg.value}`).join(', ');
                                directiveStr += `(${dirArgs})`;
                            }
                            return directiveStr;
                        }).join(' ');
                        fieldStr += ` ${directives}`;
                    }

                    // Handle nested fields
                    if (field.fields && Object.keys(field.fields).length > 0) {
                        fieldStr += ` {\n${buildFields(field.fields, depth + 1)}\n${indent}}`;
                    }

                    return fieldStr;
                }).join('\n');
            };

            const selectionSetString = buildFields(queryStructure.fields);

            return `${operationHeader} {\n${selectionSetString}\n}`;
        });
    });

    afterEach(() => {
        // Only restore in afterEach to avoid conflicts
        vi.restoreAllMocks();
    });

    it('should complete a full query building workflow: session -> fields -> variables -> validation -> execution', async () => {
        // Step 1: Create a query session
        const sessionResult = await createQuerySession(
            'query',
            'GetUserWithPosts'
        );

        expect(sessionResult.sessionId).toBe('integration-test-session');
        expect(sessionResult.operationType).toBe('query');
        expect(sessionResult.operationName).toBe('GetUserWithPosts');

        // Step 2: Add a root field with selection
        let fieldResult = await selectGraphQLField('integration-test-session', '', 'user');
        expect(fieldResult.message).toContain("Field 'user' selected successfully");

        // Step 3: Add nested fields
        fieldResult = await selectGraphQLField('integration-test-session', 'user', 'id');
        expect(fieldResult.message).toContain("Field 'id' selected successfully at path 'user'");

        fieldResult = await selectGraphQLField('integration-test-session', 'user', 'name');
        expect(fieldResult.message).toContain("Field 'name' selected successfully at path 'user'");

        fieldResult = await selectGraphQLField('integration-test-session', 'user', 'posts');
        expect(fieldResult.message).toContain("Field 'posts' selected successfully at path 'user'");

        // Step 4: Add fields to the nested posts
        fieldResult = await selectGraphQLField('integration-test-session', 'user.posts', 'id');
        expect(fieldResult.message).toContain("Field 'id' selected successfully at path 'user.posts'");

        fieldResult = await selectGraphQLField('integration-test-session', 'user.posts', 'title');
        expect(fieldResult.message).toContain("Field 'title' selected successfully at path 'user.posts'");

        // Step 5: Add query variables
        const variableResult = await setQueryVariable(
            'integration-test-session',
            '$userId',
            'ID!',
            undefined
        );
        expect(variableResult.success).toBe(true);
        expect(variableResult.message).toContain("Variable '$userId' set to type 'ID!'");

        // Step 6: Set variable argument on the user field
        const argResult = await setVariableArgument(
            'integration-test-session',
            'user',
            'id',
            '$userId'
        );
        expect(argResult.success).toBe(true);
        expect(argResult.message).toContain("Variable argument 'id' set to $userId at path 'user'");

        // Step 7: Get current query to verify structure
        const currentQueryResult = await getCurrentQuery('integration-test-session');
        expect(currentQueryResult.queryString).toBeDefined();
        expect(currentQueryResult.queryString).toContain('query GetUserWithPosts($userId: ID!)');
        expect(currentQueryResult.queryString).toContain('user(id: $userId)');
        expect(currentQueryResult.queryString).toContain('posts');
        expect(currentQueryResult.variables_schema).toEqual({ '$userId': 'ID!' });

        // Step 8: Validate the query
        const validationResult = await validateGraphQLQuery('integration-test-session');
        expect(validationResult.valid).toBe(true);

        // Step 9: Mock successful execution
        vi.spyOn(global, 'fetch').mockResolvedValue({
            json: () => Promise.resolve({
                data: {
                    user: {
                        id: '1',
                        name: 'John Doe',
                        posts: [
                            { id: '1', title: 'First Post' },
                            { id: '2', title: 'Second Post' }
                        ]
                    }
                }
            }),
            ok: true,
        } as Response);

        const executionResult = await executeGraphQLQuery('integration-test-session');
        expect(executionResult.data).toBeDefined();
        expect((executionResult.data as any).user.name).toBe('John Doe');
        expect((executionResult.data as any).user.posts).toHaveLength(2);

        // Step 10: End the session
        const endResult = await endQuerySession('integration-test-session');
        expect(endResult.message).toContain('ended successfully');

        // Verify session is ended
        const afterEndResult = await getCurrentQuery('integration-test-session');
        expect(afterEndResult.error).toContain('Session not found');
    });

    it('should handle complex query with fragments and directives', async () => {
        // Create session using the same infrastructure as other working tests
        await createQuerySession('query', 'ComplexQuery');

        // Build a more complex query structure
        await selectGraphQLField('integration-test-session', '', 'users');
        await selectGraphQLField('integration-test-session', 'users', 'id');
        await selectGraphQLField('integration-test-session', 'users', 'name');
        await selectGraphQLField('integration-test-session', 'users', 'avatar');
        await selectGraphQLField('integration-test-session', 'users.avatar', 'url');
        await selectGraphQLField('integration-test-session', 'users.avatar', 'size');

        // Add variables for pagination
        await setQueryVariable('integration-test-session', '$limit', 'Int', 10);
        await setQueryVariable('integration-test-session', '$offset', 'Int', 0);

        // Set variable arguments
        await setVariableArgument('integration-test-session', 'users', 'limit', '$limit');
        await setVariableArgument('integration-test-session', 'users', 'offset', '$offset');

        // Verify the complex query
        const queryResult = await getCurrentQuery('integration-test-session');
        expect(queryResult.queryString).toContain('$limit: Int');
        expect(queryResult.queryString).toContain('$offset: Int');
        expect(queryResult.queryString).toContain('users(limit: $limit, offset: $offset)');
        expect(queryResult.queryString).toContain('avatar');
        expect(queryResult.variables_schema).toEqual({
            '$limit': 'Int',
            '$offset': 'Int'
        });

        // Validate complex query
        const validation = await validateGraphQLQuery('integration-test-session');
        expect(validation.valid).toBe(true);
    });

    it('should handle error scenarios gracefully in workflow', async () => {
        // Create session
        await createQuerySession('query', 'ErrorTestQuery');

        // Try to select non-existent field
        const invalidFieldResult = await selectGraphQLField('integration-test-session', '', 'nonExistentField');
        expect(invalidFieldResult.error).toBeDefined();

        // Try to set invalid variable
        const invalidVarResult = await setQueryVariable('integration-test-session', 'invalidVar', 'String!');
        expect(invalidVarResult.error).toContain('Variable name must start with "$"');

        // Build a minimal valid query
        await selectGraphQLField('integration-test-session', '', 'users');
        await selectGraphQLField('integration-test-session', 'users', 'id');

        // Mock a failed execution (e.g., network error)
        vi.spyOn(global, 'fetch').mockRejectedValue(new Error('Network Error'));

        const executionResult = await executeGraphQLQuery('integration-test-session');
        expect(executionResult.error).toContain('Network Error');
    });

    it('should handle mutation workflow', async () => {
        // Mock mutation schema
        const mutationSchema = buildSchema(`
            type Query {
                user(id: ID!): User
            }
            
            type Mutation {
                createUser(input: CreateUserInput!): User!
                updateUser(id: ID!, input: UpdateUserInput!): User!
            }
            
            type User {
                id: ID!
                name: String!
                email: String
            }
            
            input CreateUserInput {
                name: String!
                email: String
            }
            
            input UpdateUserInput {
                name: String
                email: String
            }
        `);

        vi.spyOn(sharedUtils, 'fetchAndCacheSchema').mockResolvedValue(mutationSchema);

        // Create mutation session
        const sessionResult = await createQuerySession(
            'mutation',
            'CreateNewUser'
        );
        expect(sessionResult.operationType).toBe('mutation');

        // Add mutation field
        await selectGraphQLField('integration-test-session', '', 'createUser');
        await selectGraphQLField('integration-test-session', 'createUser', 'id');
        await selectGraphQLField('integration-test-session', 'createUser', 'name');
        await selectGraphQLField('integration-test-session', 'createUser', 'email');

        // Add input variable
        await setQueryVariable('integration-test-session', '$input', 'CreateUserInput!', undefined);
        await setVariableArgument('integration-test-session', 'createUser', 'input', '$input');

        // Verify mutation query
        const queryResult = await getCurrentQuery('integration-test-session');
        expect(queryResult.queryString).toContain('mutation CreateNewUser($input: CreateUserInput!)');
        expect(queryResult.queryString).toContain('createUser(input: $input)');

        // Validate mutation
        const validation = await validateGraphQLQuery('integration-test-session');
        expect(validation.valid).toBe(true);
    });

    it('should handle session lifecycle properly', async () => {
        // Create a session
        await createQuerySession('query', 'LifecycleTest');

        // Add a field
        await selectGraphQLField('integration-test-session', '', 'user');

        // Get current state
        const currentQuery = await getCurrentQuery('integration-test-session');
        expect(currentQuery.queryString).toContain('user');

        // End session
        const endResult = await endQuerySession('integration-test-session');
        expect(endResult.message).toContain('ended successfully');

        // Verify session is ended
        const afterEndResult = await getCurrentQuery('integration-test-session');
        expect(afterEndResult.error).toContain('Session not found');
    });

    it('should build comprehensive query with critical fixes validation (formerly remaining-critical-fixes)', async () => {
        // This integration test verifies all critical fixes work together

        // Step 1: Create session
        const sessionResult = await createQuerySession(
            'query',
            'CriticalFixesTest'
        );
        expect(sessionResult.sessionId).toBe('integration-test-session');

        // Step 2: Add fields (using simpler approach to avoid mock complexity)
        let fieldResult = await selectGraphQLField('integration-test-session', '', 'user');
        expect(fieldResult.error).toBeUndefined();

        fieldResult = await selectGraphQLField('integration-test-session', 'user', 'id');
        expect(fieldResult.error).toBeUndefined();

        fieldResult = await selectGraphQLField('integration-test-session', 'user', 'name');
        expect(fieldResult.error).toBeUndefined();

        // Step 3: Set variables (testing type system fixes)
        const varResult = await setQueryVariable('integration-test-session', '$characterId', 'ID!', undefined);
        expect(varResult.success).toBe(true);

        // Add the $includeStatus variable for directive testing
        const includeVarResult = await setQueryVariable('integration-test-session', '$includeStatus', 'Boolean!', undefined);
        expect(includeVarResult.success).toBe(true);

        const { setVariableValue } = await import('../../tools/set-variable-value');
        const valueResult = await setVariableValue('integration-test-session', '$characterId', '1');
        expect(valueResult.success).toBe(true);

        // Step 4: Set variable argument (instead of string argument to use the declared variable)
        const variableArgResult = await setVariableArgument('integration-test-session', 'user', 'id', '$characterId');
        expect(variableArgResult.success).toBe(true);

        // Step 5: Set directive with argument (testing directive fixes)
        const { setFieldDirective } = await import('../../tools/set-field-directive');
        const directiveResult = await setFieldDirective('integration-test-session', 'user.name', 'include', 'if', '$includeStatus');
        expect(directiveResult.success).toBe(true);

        // Step 6: Verify generated query structure
        const currentQuery = await getCurrentQuery('integration-test-session');
        const queryString = currentQuery.queryString;

        // Verify proper variable argument usage: id: $characterId
        expect(queryString).toContain('id: $characterId');
        expect(queryString).not.toContain('id: "1"');

        // Verify directive with argument: @include(if: $includeStatus)
        expect(queryString).toContain('@include(if: $includeStatus)');
        expect(queryString).not.toContain('@include @include');

        // Step 7: Validate complete query
        const validation = await validateGraphQLQuery('integration-test-session');
        expect(validation.valid).toBe(true);
    });
}); 