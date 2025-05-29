

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
   * Ensure the session map is initialized.
   */
  private static ensureInitialized() {
    if (!this.sessions) {
      this.sessions = new Map();
    }
  }

  /**
   * Create a new session with proper state isolation
   */
  static createSession(sessionId: string, initialState: Partial<any> = {}): any {
    this.ensureInitialized();
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
    };

    const newState = { ...defaultState, ...initialState, queryStructure: { ...defaultState.queryStructure, ...initialState.queryStructure } };
    this.sessions.set(sessionId, newState);
    return newState;
  }

  /**
   * Retrieve a session state
   */
  static getSession(sessionId: string): any | null {
    this.ensureInitialized();
    const session = this.sessions.get(sessionId);
    return session ? { ...session } : null; // Return copy to prevent mutations
  }

  /**
   * Update an existing session state
   */
  static updateSession(sessionId: string, updates: Partial<any>): void {
    this.ensureInitialized();
    const existingState = this.sessions.get(sessionId);
    if (existingState) {
      this.sessions.set(sessionId, { ...existingState, ...updates });
    }
  }

  /**
   * Delete a session
   */
  static deleteSession(sessionId: string): boolean {
    this.ensureInitialized();
    return this.sessions.delete(sessionId);
  }

  /**
   * Clear all sessions for a clean test slate
   */
  static clearAllSessions(): void {
    this.ensureInitialized();
    this.sessions.clear();
  }

  /**
   * Get the current number of active sessions
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
    isValidGraphQLName: (name: string) => /^[_A-Za-z][_0-9A-Za-z]*$/.test(name),
    validateFieldAlias: (alias: string) => {
      if (alias && !/^[_A-Za-z][_0-9A-Za-z]*$/.test(alias)) {
        return { valid: false, error: `Invalid field alias "${alias}".` };
      }
      return { valid: true };
    },
    validateFieldName: () => ({ valid: true }),
    validateVariableName: () => ({ valid: true }),
    validateOperationName: (name: string) => ({ valid: true }),
    validateVariableType: () => ({ valid: true }),
    serializeGraphQLValue: (v: any) => {
      if (typeof v === 'string') return `"${v}"`;
      return String(v);
    },
    validateFieldInSchema: () => ({ valid: true, field: { type: {}, args: [] } }),
    validateValueAgainstType: (value: any, type: any) => {
      // Handle null values for nullable types
      if (value === null) {
        // If the type is NOT NonNull (doesn't have ofType property in our mock), null is allowed
        if (!type?.kind || type.kind !== 'NON_NULL') {
          return null; // No error - null is valid for nullable types
        } else {
          return `Cannot be null for non-null type`;
        }
      }

      // Enhanced validation to catch type mismatches
      const typeName = type?.name || type?.ofType?.name || 'Unknown';

      if (typeName === 'Int') {
        if (typeof value === 'number') {
          if (!Number.isInteger(value)) {
            return `Int expects an integer, but received ${value}`;
          }
        } else if (typeof value === 'string') {
          const num = Number(value);
          if (isNaN(num) || !Number.isInteger(num)) {
            return `Int expects an integer, but received "${value}"`;
          }
        } else {
          return `Int expects an integer, but received ${typeof value}`;
        }
      }

      if (typeName === 'Boolean') {
        if (typeof value !== 'boolean' && value !== 'true' && value !== 'false') {
          if (typeof value === 'string' && value !== 'true' && value !== 'false') {
            return `Boolean expects a boolean, but received "${value}"`;
          }
        }
      }

      return null; // No error
    },
    coerceToInteger: (value: any) => {
      if (typeof value === 'number' && Number.isInteger(value)) return value;
      if (typeof value === 'string') {
        const num = Number(value);
        if (!isNaN(num) && Number.isInteger(num)) return num;
      }
      return null;
    },
    coerceToBoolean: (value: any) => {
      if (typeof value === 'boolean') return value;
      if (value === 'true') return true;
      if (value === 'false') return false;
      return null;
    },
    coerceToFloat: (value: any) => {
      if (typeof value === 'number') return value;
      if (typeof value === 'string') {
        const num = Number(value);
        if (!isNaN(num)) return num;
      }
      return null;
    },
    coerceStringValue: (value: string) => {
      // Helper function to replicate coerceToInteger logic
      const coerceToInt = (val: any) => {
        if (typeof val === 'number' && Number.isInteger(val)) return val;
        if (typeof val === 'string') {
          const num = Number(val);
          if (!isNaN(num) && Number.isInteger(num)) return num;
        }
        return null;
      };

      // Helper function to replicate coerceToFloat logic
      const coerceToFloat = (val: any) => {
        if (typeof val === 'number') return val;
        if (typeof val === 'string') {
          const num = Number(val);
          if (!isNaN(num)) return num;
        }
        return null;
      };

      // Helper function to replicate coerceToBoolean logic
      const coerceToBool = (val: any) => {
        if (typeof val === 'boolean') return val;
        if (val === 'true') return true;
        if (val === 'false') return false;
        return null;
      };

      // Try to detect and coerce numeric values
      const numericValue = coerceToInt(value);
      if (numericValue !== null) {
        return {
          coerced: true,
          value: numericValue,
          type: 'Int',
          warning: `Detected numeric value "${value}". Consider using set-typed-argument() for better type safety.`
        };
      }

      const floatValue = coerceToFloat(value);
      if (floatValue !== null && floatValue !== numericValue) {
        return {
          coerced: true,
          value: floatValue,
          type: 'Float',
          warning: `Detected float value "${value}". Consider using set-typed-argument() for better type safety.`
        };
      }

      // Try to detect and coerce boolean values
      const booleanValue = coerceToBool(value);
      if (booleanValue !== null) {
        return {
          coerced: true,
          value: booleanValue,
          type: 'Boolean',
          warning: `Detected boolean value "${value}". Consider using set-typed-argument() for better type safety.`
        };
      }

      // Value should remain as string
      return {
        coerced: false,
        value: value
      };
    },
    // Enhanced validation methods for Issue #4
    validateArgumentInSchema: (fieldDef: any, argumentName: string, fieldPath?: string) => {
      // Mock argument validation - return failure for non-existent args with suggestion
      if (argumentName === 'nonExistentArg' || argumentName === 'invalidArg') {
        return {
          valid: false,
          error: `Argument '${argumentName}' not found on field '${fieldPath || 'unknown'}'. Available arguments: page, limit, active.`
        };
      }
      if (argumentName === 'activ') {
        return {
          valid: false,
          error: `Argument '${argumentName}' not found on field '${fieldPath || 'unknown'}'. Did you mean 'active'?`
        };
      }
      return { valid: true, argDef: { type: { name: 'String' } } };
    },
    validateGraphQLType: (typeString: string) => {
      const commonMistakes = {
        'Integer': 'Int',
        'id': 'ID'
      };

      if (commonMistakes[typeString]) {
        return {
          valid: false,
          error: `Invalid type '${typeString}'. Did you mean '${commonMistakes[typeString]}'?`
        };
      }

      return { valid: true };
    },
    findSimilarName: (target: string, candidates: string[]) => {
      // Simple mock - return known similar names
      const similarMap = {
        'charaters': 'characters',
        'activ': 'active'
      };
      return similarMap[target] || null;
    },
    levenshteinDistance: () => 1,
    generatePerformanceWarning: (argumentName: string, value: any) => {
      if (argumentName === 'limit') {
        const numValue = typeof value === 'string' ? parseInt(value, 10) : value;
        if (numValue >= 1000) {
          return `Large limit value (${numValue}) may impact performance. Consider using pagination with smaller limits and 'page' or 'offset' arguments.`;
        }
      }
      return null;
    },
  },
  validateInputComplexity: vi.fn().mockReturnValue(null),
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