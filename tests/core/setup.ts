import { vi, beforeEach } from 'vitest';
import { buildSchema } from 'graphql';

// Set environment variables for testing
process.env.NODE_ENV = 'test';
process.env.DEFAULT_GRAPHQL_ENDPOINT = 'http://localhost:4000/graphql';
process.env.REDIS_URL = 'redis://localhost:6379';

export const TEST_SCHEMA = buildSchema(`
  type Query {
    character(id: ID!): Character
    characters(
      page: Int, 
      filter: FilterCharacter,
      includeImages: Boolean,
      active: Boolean,
      limit: Int,
      offset: Int
    ): Characters
    location(id: ID!): Location
    locations(page: Int, filter: FilterLocation): Locations
    episode(id: ID!): Episode
    episodes(page: Int, filter: FilterEpisode): Episodes
    user(id: ID!): User
    users(limit: Int, offset: Int): [User]
    # Additional test fields for comprehensive coverage
    testField(testArg: String): String
    complexField(
      stringArg: String,
      intArg: Int,
      floatArg: Float,
      boolArg: Boolean,
      idArg: ID,
      enumArg: TestEnum,
      inputArg: TestInput
    ): String
  }

  type Mutation {
    createUser(input: UserInput!): User
    updateUser(id: ID!, input: UserInput!): User
    deleteUser(id: ID!): Boolean
    # Additional mutation for test coverage
    testMutation(input: TestInput!): TestResult
  }

  type Character {
    id: ID!
    name: String
    status: String
    species: String
    type: String
    gender: String
    origin: Location
    location: Location
    image: String
    episode: [Episode]!
    created: String
    # Additional fields that tests might reference
    active: Boolean
    metadata: String
  }

  type Characters {
    info: Info
    results: [Character]
  }

  type Location {
    id: ID!
    name: String
    type: String
    dimension: String
    residents: [Character]!
    created: String
  }

  type Locations {
    info: Info
    results: [Location]
  }

  type Episode {
    id: ID!
    name: String
    air_date: String
    episode: String
    characters: [Character]!
    created: String
  }

  type Episodes {
    info: Info
    results: [Episode]
  }

  type User {
    id: ID!
    name: String!
    email: String!
    active: Boolean
    metadata: String
  }

  type Info {
    count: Int
    pages: Int
    next: Int
    prev: Int
  }

  # Test-specific types for comprehensive coverage
  type TestResult {
    success: Boolean!
    message: String
    data: String
  }

  enum TestEnum {
    OPTION_A
    OPTION_B
    OPTION_C
  }

  input FilterCharacter {
    name: String
    status: String
    species: String
    type: String
    gender: String
    active: Boolean
  }

  input FilterLocation {
    name: String
    type: String
    dimension: String
  }

  input FilterEpisode {
    name: String
    episode: String
  }

  input UserInput {
    name: String!
    email: String!
    active: Boolean
  }

  input TestInput {
    name: String!
    value: Int!
    active: Boolean
    metadata: String
  }

  # Additional input types for comprehensive test coverage
  input ComplexInput {
    stringField: String
    intField: Int
    floatField: Float
    boolField: Boolean
    enumField: TestEnum
    nestedInput: TestInput
  }

  # Standard GraphQL directives that tests commonly use
  directive @include(if: Boolean!) on FIELD | FRAGMENT_SPREAD | INLINE_FRAGMENT
  directive @skip(if: Boolean!) on FIELD | FRAGMENT_SPREAD | INLINE_FRAGMENT
  directive @deprecated(reason: String = "No longer supported") on FIELD_DEFINITION | ENUM_VALUE
`);

export class MockStateManager {
  private static sessions: Map<string, any> = new Map();

  /**
   * Create a new session with proper state isolation
   */
  static createSession(sessionId: string, initialState: Partial<any> = {}): any {
    const defaultState = {
      sessionId,
      headers: {},
      operationType: 'query',
      operationTypeName: 'Query',
      operationName: null,
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
      createdAt: new Date().toISOString(),
      ...initialState
    };

    this.sessions.set(sessionId, { ...defaultState });
    return this.sessions.get(sessionId);
  }

  /**
   * Get session state with proper isolation
   */
  static getSession(sessionId: string): any | null {
    const session = this.sessions.get(sessionId);
    return session ? { ...session } : null; // Return copy to prevent mutations
  }

  /**
   * Update session state
   */
  static updateSession(sessionId: string, updates: Partial<any>): void {
    const existing = this.sessions.get(sessionId);
    if (existing) {
      this.sessions.set(sessionId, { ...existing, ...updates });
    }
  }

  /**
   * Delete session
   */
  static deleteSession(sessionId: string): boolean {
    return this.sessions.delete(sessionId);
  }

  /**
   * Clear all sessions (for test cleanup)
   */
  static clearAllSessions(): void {
    this.sessions.clear();
  }

  /**
   * Get session count (for debugging)
   */
  static getSessionCount(): number {
    return this.sessions.size;
  }
}

// Create a standardized shared mock factory for use across all test files
export const createSharedUtilsMock = (customMocks = {}) => ({
  resolveEndpointAndHeaders: vi.fn().mockReturnValue({
    url: 'http://localhost:4000/graphql',
    headers: { 'Content-Type': 'application/json' }
  }),
  generateSessionId: vi.fn().mockReturnValue('test-session-id'),
  fetchAndCacheSchema: vi.fn().mockResolvedValue(TEST_SCHEMA),

  loadQueryState: vi.fn().mockImplementation(async (sessionId: string) => {
    if (sessionId === 'invalid-session-id' || sessionId === 'non-existent-session') {
      return null;
    }

    // Use MockStateManager for consistent state handling
    const session = MockStateManager.getSession(sessionId);
    if (session) {
      return session;
    }

    // Create default session if it doesn't exist (for backward compatibility)
    return MockStateManager.createSession(sessionId);
  }),

  saveQueryState: vi.fn().mockImplementation(async (sessionId: string, newState: any) => {
    MockStateManager.updateSession(sessionId, newState);
    return undefined;
  }),

  deleteQueryState: vi.fn().mockImplementation(async (sessionId: string) => {
    return MockStateManager.deleteSession(sessionId);
  }),

  buildQueryFromStructure: vi.fn().mockImplementation((
    queryStructure: any,
    operationType = 'query',
    variablesSchema = {},
    operationName?: string,
    fragments = {},
    operationDirectives = [],
    variablesDefaults = {}
  ) => {
    // More sophisticated mock that handles arguments, directives, variables, and operation names
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

    const buildFields = (fields: any): string[] => {
      return Object.entries(fields).map(([fieldKey, field]: [string, any]) => {
        let fieldStr = fieldKey;

        // Handle field alias - FIXED: Use actual fieldName, not the key
        if (field.alias) {
          fieldStr = `${field.alias}: ${field.fieldName || fieldKey}`;
        }

        // Handle arguments
        if (field.args && Object.keys(field.args).length > 0) {
          const args = Object.entries(field.args).map(([argName, argValue]: [string, any]) => {
            let value;
            if (argValue && typeof argValue === 'object' && 'value' in argValue) {
              value = argValue.value;
            } else if (argValue && typeof argValue === 'object' && '__graphqlString' in argValue) {
              value = `"${argValue.__graphqlString}"`;
              return `${argName}: ${value}`;
            } else {
              value = argValue;
            }

            // Handle complex objects
            if (typeof value === 'object' && value !== null) {
              if (Array.isArray(value)) {
                const arrayItems = value.map(item =>
                  typeof item === 'string' ? `"${item}"` : JSON.stringify(item)
                ).join(', ');
                return `${argName}: [${arrayItems}]`;
              } else {
                // Convert object to GraphQL input object syntax - FIX: Better object handling
                const objEntries = Object.entries(value).map(([k, v]) => {
                  if (typeof v === 'string') {
                    return `${k}: "${v}"`;
                  } else if (typeof v === 'number' || typeof v === 'boolean') {
                    return `${k}: ${v}`;
                  } else if (typeof v === 'object' && v !== null) {
                    // Handle nested objects recursively
                    const nestedEntries = Object.entries(v).map(([nk, nv]) => {
                      if (typeof nv === 'string') {
                        return `${nk}: "${nv}"`;
                      } else {
                        return `${nk}: ${nv}`;
                      }
                    }).join(', ');
                    return `${k}: {${nestedEntries}}`;
                  } else {
                    return `${k}: ${v}`;
                  }
                }).join(', ');
                return `${argName}: {${objEntries}}`;
              }
            }

            if (typeof value === 'string' && !value.startsWith('"') && !value.startsWith('$')) {
              return `${argName}: "${value}"`;
            } else {
              return `${argName}: ${value}`;
            }
          }).join(', ');
          fieldStr += `(${args})`;
        }

        // Handle directives - FIX: Properly render directive arguments
        if (field.directives && field.directives.length > 0) {
          const directives = field.directives.map((directive: any) => {
            let directiveStr = `@${directive.name}`;

            // Handle both 'args' (object) and 'arguments' (array) formats
            let directiveArgs = {};
            if (directive.args && Object.keys(directive.args).length > 0) {
              directiveArgs = directive.args;
            } else if (directive.arguments && directive.arguments.length > 0) {
              // Convert arguments array to args object
              directive.arguments.forEach((arg: any) => {
                directiveArgs[arg.name] = arg.value;
              });
            }

            if (Object.keys(directiveArgs).length > 0) {
              const args = Object.entries(directiveArgs).map(([argName, argValue]: [string, any]) => {
                let value = argValue;
                if (typeof value === 'object' && value !== null && 'value' in value) {
                  value = value.value;
                }
                // Don't quote variables that start with $ or booleans
                if (typeof value === 'string' && !value.startsWith('$')) {
                  return `${argName}: "${value}"`;
                } else if (typeof value === 'boolean') {
                  return `${argName}: ${value}`;
                } else {
                  return `${argName}: ${value}`;
                }
              }).join(', ');
              directiveStr += `(${args})`;
            }
            return directiveStr;
          }).join(' ');
          fieldStr += ` ${directives}`;
        }

        // Handle nested fields
        if (field.fields && Object.keys(field.fields).length > 0) {
          const nestedFields = buildFields(field.fields);
          fieldStr += ` { ${nestedFields.join(' ')} }`;
        }

        return fieldStr;
      });
    };

    const fieldsStr = buildFields(queryStructure.fields).join(' ');
    return `${operationHeader} { ${fieldsStr} }`;
  }),
  getTypeNameStr: vi.fn().mockImplementation((type) => {
    if (!type) return 'Unknown';
    if (type.name) return type.name;
    if (type.ofType) return type.ofType.name + (type.kind === 'NON_NULL' ? '!' : '');
    return type.toString();
  }),
  GraphQLValidationUtils: {
    isValidGraphQLName: vi.fn().mockReturnValue(true),
    validateFieldAlias: vi.fn().mockReturnValue({ valid: true }),
    validateFieldName: () => ({ valid: true }),
    validateVariableName: vi.fn().mockReturnValue({ valid: true }),
    validateOperationName: vi.fn().mockReturnValue({ valid: true }),
    validateVariableType: vi.fn().mockReturnValue({ valid: true }),
    validateFieldInSchema: vi.fn().mockReturnValue({ valid: true }),
    validateValueAgainstType: vi.fn().mockReturnValue(null),
    validateGraphQLType: vi.fn().mockReturnValue({ valid: true }),
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
    getArgumentType: vi.fn((schema, fieldPath, argumentName) => {
      // Return a dummy type for mock purposes
      const queryType = schema.getQueryType();
      if (queryType) {
        const field = queryType.getFields()[fieldPath];
        if (field) {
          const arg = field.args.find(a => a.name === argumentName);
          if (arg) return arg.type;
        }
      }
      return null;
    }),
    serializeGraphQLValue: vi.fn((value) => {
      if (typeof value === 'string') return `"${value}"`;
      return String(value);
    }),
    validateAgainstSchema: vi.fn().mockImplementation((queryString, schema) => {
      try {
        // Handle empty or whitespace-only queries
        if (!queryString || queryString.trim() === '') {
          return {
            valid: false,
            errors: ['Query is empty. Add fields to the query structure first.']
          };
        }

        // Special test mode handling - skip validation for test queries
        if (queryString.includes('testField')) {
          return { valid: true, errors: [] };
        }

        // For test predictability, check for specific test patterns
        if (queryString.includes('nonExistent') && queryString.includes('alsoNonExistent')) {
          return {
            valid: false,
            errors: [
              "Cannot query field 'nonExistent' on type 'Query'.",
              "Cannot query field 'alsoNonExistent' on type 'Query'."
            ]
          };
        }

        if (queryString.includes('nonExistent')) {
          return {
            valid: false,
            errors: ["Cannot query field 'nonExistent' on type 'Query'."]
          };
        }

        if (queryString.includes('InvalidType')) {
          return {
            valid: false,
            errors: ["Unknown type 'InvalidType'."]
          };
        }

        if (queryString.includes('invalidField')) {
          return {
            valid: false,
            errors: ["Cannot query field 'invalidField' on type 'User'."]
          };
        }

        // Special handling for syntax error test case
        if (queryString.includes('query { user ( }')) {
          return {
            valid: false,
            errors: ['Syntax Error: Expected Name, found }']
          };
        }

        // If we have graphql available, try to use it
        if (typeof require !== 'undefined') {
          try {
            const { parse, validate } = require('graphql');
            const parsedQuery = parse(queryString);
            const validationErrors = validate(schema, parsedQuery);

            if (validationErrors && validationErrors.length > 0) {
              return {
                valid: false,
                errors: validationErrors.map(err => err.message)
              };
            }
          } catch (parseError) {
            // Handle syntax errors
            return {
              valid: false,
              errors: [parseError.message]
            };
          }
        }

        return { valid: true, errors: [] };
      } catch (error) {
        // Handle any other errors
        return {
          valid: false,
          errors: [error.message || String(error)]
        };
      }
    }),
  },
  validateInputComplexity: vi.fn().mockReturnValue(null),

  // Add the new complexity analysis functions
  analyzeQueryComplexity: vi.fn().mockImplementation((queryStructure: any, operationType = 'query') => {
    // Handle empty query structures
    if (!queryStructure || !queryStructure.fields || Object.keys(queryStructure.fields).length === 0) {
      return {
        valid: true,
        depth: 0,
        fieldCount: 0,
        complexityScore: 0,
        errors: [],
        warnings: []
      };
    }

    // Handle test cases that should fail
    if (queryStructure && queryStructure.fields) {
      const fieldCount = Object.keys(queryStructure.fields).length;

      // Mock depth calculation - if too many nested levels
      let maxDepth = 1;
      const calculateDepth = (fields: any, currentDepth = 1): number => {
        if (!fields || typeof fields !== 'object') return currentDepth;

        let deepest = currentDepth;
        Object.values(fields).forEach((field: any) => {
          if (field && field.fields) {
            deepest = Math.max(deepest, calculateDepth(field.fields, currentDepth + 1));
          }
        });
        return deepest;
      };

      maxDepth = calculateDepth(queryStructure.fields);

      // Return failure for overly complex queries
      if (maxDepth > 8 || fieldCount > 100) {
        return {
          valid: false,
          depth: maxDepth,
          fieldCount,
          complexityScore: fieldCount * 10,
          errors: maxDepth > 8 ?
            [`Query depth ${maxDepth} exceeds maximum allowed depth of 8 at path: level0.level1...`] :
            [`Query field count ${fieldCount} exceeds maximum allowed field count of 100`],
          warnings: []
        };
      }

      return {
        valid: true,
        depth: maxDepth,
        fieldCount,
        complexityScore: fieldCount * 2.5,
        errors: [],
        warnings: []
      };
    }

    // Default fallback
    return {
      valid: true,
      depth: 2,
      fieldCount: 3,
      complexityScore: 10.5,
      errors: [],
      warnings: []
    };
  }),

  executeWithTimeout: vi.fn().mockImplementation(async (promise: Promise<any>, timeoutMs: number, timeoutMessage = 'Operation timed out') => {
    // For testing, just return the promise result - don't actually implement timeout
    try {
      return await promise;
    } catch (error) {
      throw error;
    }
  }),

  // Add the constants
  MAX_QUERY_COMPLEXITY: {
    DEPTH: 8,
    FIELD_COUNT: 100,
    TOTAL_COMPLEXITY_SCORE: 1000,
  },

  QUERY_EXECUTION_TIMEOUT: {
    DEFAULT: 30000,
    EXPENSIVE: 60000,
  },

  ...customMocks
});

export const setupTestEnvironment = () => {
  // Clear all mock sessions before each test
  MockStateManager.clearAllSessions();

  // Clear all vitest mocks
  vi.clearAllMocks();
};

export const createTestSession = (sessionId: string = 'test-session-id', overrides: any = {}) => {
  return MockStateManager.createSession(sessionId, {
    operationType: 'query',
    operationName: 'TestQuery',
    ...overrides
  });
}; 