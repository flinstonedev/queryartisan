import { config } from 'dotenv';
import {
    GraphQLSchema,
    getIntrospectionQuery,
    buildClientSchema,
    printSchema,
    isObjectType,
    isInterfaceType,
    isEnumType,
    isInputObjectType,
    isNonNullType,
    isListType,
    isScalarType,
    isUnionType,
    getNamedType,
    print,
    astFromValue,
    GraphQLString,
    GraphQLInt,
    GraphQLFloat,
    GraphQLBoolean,
    parse,
    validate,
    buildSchema,
    GraphQLError,
    GraphQLObjectType,
    GraphQLInputObjectType,
    GraphQLInterfaceType,
    isLeafType,
    GraphQLInputType,
    coerceInputValue
} from 'graphql';
import { createClient } from 'redis';
import { randomBytes } from 'crypto';

// Load environment variables from .env file
config({ path: '.env' });

// Redis client setup
const redis = createClient({
    url: process.env.REDIS_URL || 'redis://localhost:6379',
    socket: {
        reconnectStrategy: false,
        connectTimeout: 1000,
    }
});

// Fallback in-memory storage
const memoryStorage = new Map<string, any>();
let useRedis = false;
let redisConnectionAttempted = false;
let redisConnectionPromise: Promise<void> | null = null;

// Initialize Redis connection
async function initializeRedis(): Promise<boolean> {
    if (redisConnectionAttempted) {
        return useRedis;
    }

    if (!redisConnectionPromise) {
        redisConnectionPromise = (async () => {
            try {
                redisConnectionAttempted = true;
                let connectionSucceeded = false;

                redis.on('error', (err: Error) => {
                    // Only log and fall back to memory if connection hasn't succeeded yet
                    if (!connectionSucceeded) {
                        console.log('Redis not available, using in-memory session storage for development');
                        useRedis = false;
                    } else {
                        // If connection had succeeded, just log but don't change useRedis
                        console.warn('Redis error after successful connection:', err.message);
                    }
                });

                redis.on('connect', () => {
                    console.log('Redis Client Connected');
                });

                redis.on('ready', () => {
                    console.log('Redis Client Ready');
                });

                await Promise.race([
                    redis.connect(),
                    new Promise((_, reject) =>
                        setTimeout(() => reject(new Error('Redis connection timeout')), 2000)
                    )
                ]);

                // Verify connection works before marking as successful
                await redis.ping();
                connectionSucceeded = true;
                useRedis = true;
                console.log('Redis connection verified');

            } catch (error) {
                console.log('Redis connection failed, using in-memory storage for development');
                useRedis = false;
            }
        })();
    }

    await redisConnectionPromise;
    return useRedis;
}

// Schema caching
const schemaCache = new Map<string, GraphQLSchema>();
const rawSchemaJsonCache = new Map<string, any>();

// Query state structure
export interface QueryState {
    headers: Record<string, string>;
    operationType: string;
    operationTypeName: string;
    operationName: string | null;
    queryStructure: {
        fields: Record<string, any>;
        fragmentSpreads: string[];
        inlineFragments: any[];
    };
    fragments: Record<string, any>;
    variablesSchema: Record<string, string>;
    variablesDefaults: Record<string, any>;
    variablesValues: Record<string, any>;
    operationDirectives: any[];
    createdAt: string;
}

// GraphQL validation utilities
export class GraphQLValidationUtils {
    static isValidGraphQLName(name: string): boolean {
        if (!name || typeof name !== 'string') return false;
        return /^[_A-Za-z][_0-9A-Za-z]*$/.test(name);
    }

    static validateOperationName(name: string | null): { valid: boolean; error?: string } {
        if (name === null || name === undefined) return { valid: true };
        if (typeof name !== 'string') return { valid: false, error: 'Operation name must be a string' };
        if (name.trim() === '') return { valid: true };

        if (!this.isValidGraphQLName(name)) {
            return {
                valid: false,
                error: `Invalid operation name "${name}". Must match /^[_A-Za-z][_0-9A-Za-z]*$/`
            };
        }
        return { valid: true };
    }

    static validateVariableName(name: string): { valid: boolean; error?: string } {
        if (!name || typeof name !== 'string') {
            return { valid: false, error: 'Variable name must be a string' };
        }

        if (!name.startsWith('$')) {
            return { valid: false, error: 'Variable name must start with "$"' };
        }

        const nameWithoutDollar = name.slice(1);
        if (!this.isValidGraphQLName(nameWithoutDollar)) {
            return {
                valid: false,
                error: `Invalid variable name "${name}". Must be $[_A-Za-z][_0-9A-Za-z]*`
            };
        }
        return { valid: true };
    }

    static validateFieldAlias(alias: string | null): { valid: boolean; error?: string } {
        if (alias === null || alias === undefined) return { valid: true };
        if (typeof alias !== 'string') return { valid: false, error: 'Field alias must be a string' };
        if (alias.trim() === '') return { valid: false, error: 'Field alias cannot be empty' };

        if (!this.isValidGraphQLName(alias)) {
            return {
                valid: false,
                error: `Invalid field alias "${alias}". Must match /^[_A-Za-z][_0-9A-Za-z]*$/`
            };
        }
        return { valid: true };
    }

    static validateStringLength(value: string, name: string): { valid: boolean; error?: string } {
        const MAX_STRING_LENGTH = 8192;
        if (value.length > MAX_STRING_LENGTH) {
            return {
                valid: false,
                error: `Input for "${name}" exceeds maximum allowed length of ${MAX_STRING_LENGTH} characters.`
            };
        }
        return { valid: true };
    }

    static validateNoControlCharacters(value: string, name: string): { valid: boolean; error?: string } {
        // eslint-disable-next-line no-control-regex
        const controlCharRegex = /[\u0000-\u001F\u007F-\u009F]/;
        if (controlCharRegex.test(value)) {
            return {
                valid: false,
                error: `Input for "${name}" contains disallowed control characters.`
            };
        }
        return { valid: true };
    }

    static validatePaginationValue(argumentName: string, value: string): { valid: boolean; error?: string } {
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
    }

    static serializeGraphQLValue(value: any): string {
        if (value === null || value === undefined) {
            return 'null';
        }

        if (typeof value === 'string' && value.startsWith('$')) {
            return value;
        }

        // Handle special __graphqlString wrapper for proper string serialization
        if (typeof value === 'object' && value !== null && '__graphqlString' in value) {
            return JSON.stringify(value.__graphqlString);
        }

        try {
            let gqlType;

            if (typeof value === 'string') {
                gqlType = GraphQLString;
            } else if (typeof value === 'number') {
                if (Number.isInteger(value)) {
                    gqlType = GraphQLInt;
                } else {
                    gqlType = GraphQLFloat;
                }
            } else if (typeof value === 'boolean') {
                gqlType = GraphQLBoolean;
            } else if (Array.isArray(value)) {
                const serializedElements = value.map(v => this.serializeGraphQLValue(v));
                return `[${serializedElements.join(', ')}]`;
            } else if (typeof value === 'object' && value !== null) {
                const entries = Object.entries(value).map(([k, v]) =>
                    `${k}: ${this.serializeGraphQLValue(v)}`
                );
                return `{${entries.join(', ')}}`;
            } else {
                return JSON.stringify(value);
            }

            const ast = astFromValue(value, gqlType);
            if (ast) {
                return print(ast);
            }

            return typeof value === 'string' ? JSON.stringify(value) : String(value);
        } catch (error) {
            return typeof value === 'string' ? JSON.stringify(value) : String(value);
        }
    }

    static validateValueAgainstType(value: any, type: any): string | null {
        if (isNonNullType(type)) {
            if (value === null || value === undefined) {
                return `Type ${type} is non-nullable, but received null/undefined.`;
            }
            return this.validateValueAgainstType(value, type.ofType);
        }

        if (value === null || value === undefined) {
            return null; // Nullable type, null value is ok.
        }

        const namedType = getNamedType(type);

        if (isScalarType(namedType)) {
            switch (namedType.name) {
                case 'String':
                    if (typeof value !== 'string') {
                        return `Type String expects a string, but received ${typeof value}.`;
                    }
                    break;
                case 'ID':
                    // ID accepts both string and number/int values (GraphQL spec)
                    if (typeof value !== 'string' && typeof value !== 'number') {
                        return `Type ID expects a string or number, but received ${typeof value}.`;
                    }
                    break;
                case 'Int':
                    // Enhanced Int validation with type coercion for protocol compatibility
                    const coercedIntValue = this.coerceToInteger(value);
                    if (coercedIntValue === null) {
                        return `Type Int expects an integer, but received ${String(value)}.`;
                    }
                    break;
                case 'Float':
                    // Enhanced Float validation with type coercion for protocol compatibility
                    const coercedFloatValue = this.coerceToFloat(value);
                    if (coercedFloatValue === null) {
                        return `Type Float expects a number, but received ${typeof value}.`;
                    }
                    break;
                case 'Boolean':
                    // Enhanced Boolean validation with type coercion for protocol compatibility
                    const coercedBoolValue = this.coerceToBoolean(value);
                    if (coercedBoolValue === null) {
                        return `Type Boolean expects a boolean, but received ${typeof value}.`;
                    }
                    break;
            }
        }

        return null; // No validation error
    }

    /**
     * Coerce value to integer, handling protocol type conversion issues
     * Returns the coerced integer value or null if coercion fails
     */
    static coerceToInteger(value: any): number | null {
        // Direct number that's an integer
        if (typeof value === 'number' && Number.isInteger(value)) {
            return value;
        }

        // String that represents an integer (protocol conversion case)
        if (typeof value === 'string') {
            const parsed = parseInt(value, 10);
            if (!isNaN(parsed) && parsed.toString() === value) {
                return parsed;
            }
        }

        // Boolean to number conversion (edge case)
        if (typeof value === 'boolean') {
            return null; // Booleans should not coerce to integers
        }

        return null;
    }

    /**
     * Coerce value to float, handling protocol type conversion issues
     * Returns the coerced float value or null if coercion fails
     */
    static coerceToFloat(value: any): number | null {
        // Direct number
        if (typeof value === 'number') {
            return value;
        }

        // String that represents a number (protocol conversion case)
        if (typeof value === 'string') {
            const parsed = parseFloat(value);
            if (!isNaN(parsed) && isFinite(parsed)) {
                return parsed;
            }
        }

        return null;
    }

    /**
     * Coerce value to boolean, handling protocol type conversion issues
     * Returns the coerced boolean value or null if coercion fails
     */
    static coerceToBoolean(value: any): boolean | null {
        // Direct boolean
        if (typeof value === 'boolean') {
            return value;
        }

        // String representations of boolean (protocol conversion case)
        if (typeof value === 'string') {
            const lowerValue = value.toLowerCase();
            if (lowerValue === 'true') {
                return true;
            }
            if (lowerValue === 'false') {
                return false;
            }
        }

        // Number to boolean (JavaScript falsy/truthy, but be strict)
        if (typeof value === 'number') {
            return null; // Numbers should not automatically coerce to booleans
        }

        return null;
    }

    static coerceStringValue(value: string): { coerced: boolean; value: any; type?: string; warning?: string } {
        // Try to detect and coerce numeric values
        const numericValue = this.coerceToInteger(value);
        if (numericValue !== null) {
            return {
                coerced: true,
                value: numericValue,
                type: 'Int',
                warning: `Detected numeric value "${value}". Consider using set-typed-argument() for better type safety.`
            };
        }

        const floatValue = this.coerceToFloat(value);
        if (floatValue !== null && floatValue !== numericValue) {
            return {
                coerced: true,
                value: floatValue,
                type: 'Float',
                warning: `Detected float value "${value}". Consider using set-typed-argument() for better type safety.`
            };
        }

        // Try to detect and coerce boolean values
        const booleanValue = this.coerceToBoolean(value);
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
    }

    static validateFieldInSchema(
        schema: GraphQLSchema,
        parentType: any,
        fieldName: string
    ): { valid: boolean; error?: string; fieldDef?: any } {
        if (!parentType) {
            return { valid: false, error: 'Parent type not found in schema' };
        }

        const fields = parentType.getFields();
        const fieldDef = fields[fieldName];

        if (!fieldDef) {
            const suggestion = this.findSimilarName(fieldName, Object.keys(fields));
            let error = `Field '${fieldName}' not found on type '${parentType.name}'.`;
            if (suggestion) {
                error += ` Did you mean '${suggestion}'?`;
            }
            return { valid: false, error };
        }

        return { valid: true, fieldDef };
    }

    static validateVariableType(typeString: string): { valid: boolean; error?: string } {
        if (!typeString || typeof typeString !== 'string' || typeString.trim() === '') {
            return { valid: false, error: 'Variable type cannot be empty' };
        }

        const MAX_TYPE_DEPTH = 5;
        const depth = typeString.split('[').length - 1;
        if (depth > MAX_TYPE_DEPTH) {
            return {
                valid: false,
                error: `Variable type nesting depth of ${depth} exceeds maximum of ${MAX_TYPE_DEPTH} in "${typeString}".`
            };
        }

        const typeValidation = this.validateGraphQLType(typeString);
        if (!typeValidation.valid) {
            return typeValidation;
        }

        try {
            const testQuery = `query Test($var: ${typeString}) { __typename }`;
            parse(testQuery);
            return { valid: true };
        } catch (error) {
            return {
                valid: false,
                error: `Invalid variable type "${typeString}": ${error instanceof Error ? error.message : String(error)}`
            };
        }
    }

    static validateQuerySyntax(queryString: string): { valid: boolean; errors?: string[] } {
        if (!queryString) {
            return { valid: false, errors: ['Query string is empty'] };
        }

        try {
            parse(queryString);
            return { valid: true };
        } catch (error) {
            return {
                valid: false,
                errors: [error instanceof Error ? error.message : String(error)]
            };
        }
    }

    static validateAgainstSchema(
        queryString: string,
        schema: GraphQLSchema
    ): { valid: boolean; errors?: string[] } {
        try {
            const document = parse(queryString);
            const errors = validate(schema, document);

            if (errors.length > 0) {
                return {
                    valid: false,
                    errors: errors.map(err => err.message)
                };
            }

            return { valid: true };
        } catch (error) {
            return {
                valid: false,
                errors: [error instanceof Error ? error.message : String(error)]
            };
        }
    }

    static validateArgumentInSchema(
        fieldDef: any,
        argumentName: string,
        fieldPath?: string
    ): { valid: boolean; error?: string; argDef?: any } {
        try {
            if (!fieldDef || !fieldDef.args) {
                return {
                    valid: false,
                    error: `No arguments available for field '${fieldPath || 'unknown'}'`
                };
            }

            const argDef = fieldDef.args.find((arg: any) => arg.name === argumentName);

            if (!argDef) {
                const availableArgs = fieldDef.args.map((arg: any) => arg.name);
                const suggestion = this.findSimilarName(argumentName, availableArgs);

                let error = `Argument '${argumentName}' not found on field '${fieldPath || fieldDef.name}'.`;

                if (suggestion) {
                    error += ` Did you mean '${suggestion}'?`;
                } else if (availableArgs.length > 0) {
                    const argList = availableArgs.slice(0, 5).join(', ');
                    error += ` Available arguments: ${argList}${availableArgs.length > 5 ? ', ...' : ''}.`;
                } else {
                    error += ' This field does not accept any arguments.';
                }

                return { valid: false, error };
            }

            return { valid: true, argDef };
        } catch (error) {
            return {
                valid: false,
                error: `Error validating argument: ${error instanceof Error ? error.message : String(error)}`
            };
        }
    }

    static validateGraphQLType(typeString: string): { valid: boolean; error?: string; suggestion?: string } {
        // First check if it's already a valid GraphQL type
        const validTypes = ['Int', 'Float', 'String', 'Boolean', 'ID'];
        const baseType = typeString.replace(/[!\[\]]/g, ''); // Remove non-null and list modifiers

        if (validTypes.includes(baseType)) {
            return { valid: true };
        }

        const commonTypeMistakes: Record<string, string> = {
            'integer': 'Int',
            'int': 'Int',
            'number': 'Int',
            'float': 'Float',
            'double': 'Float',
            'bool': 'Boolean',
            'boolean': 'Boolean',
            'string': 'String',
            'str': 'String',
            'text': 'String',
            'id': 'ID',
            'identifier': 'ID'
        };

        const normalizedType = typeString.toLowerCase();
        if (commonTypeMistakes[normalizedType]) {
            return {
                valid: false,
                error: `Invalid type '${typeString}'. Did you mean '${commonTypeMistakes[normalizedType]}'?`,
                suggestion: commonTypeMistakes[normalizedType]
            };
        }

        // Try to parse as GraphQL type
        try {
            const testQuery = `query Test($var: ${typeString}) { __typename }`;
            parse(testQuery);
            return { valid: true };
        } catch (error) {
            return {
                valid: false,
                error: `Could not determine GraphQL type for '${typeString}'. Use standard GraphQL types like Int, String, Boolean, ID, or Float.`
            };
        }
    }

    static findSimilarName(target: string, candidates: string[]): string | null {
        if (candidates.length === 0) return null;

        const targetLower = target.toLowerCase();
        let bestMatch = null;
        let bestScore = Infinity;

        for (const candidate of candidates) {
            const candidateLower = candidate.toLowerCase();
            const score = this.levenshteinDistance(targetLower, candidateLower);

            // Only suggest if it's reasonably similar (within 3 edits and target length)
            if (score < bestScore && score <= Math.min(3, Math.ceil(target.length * 0.6))) {
                bestScore = score;
                bestMatch = candidate;
            }
        }

        return bestMatch;
    }

    static levenshteinDistance(a: string, b: string): number {
        const matrix = Array(b.length + 1).fill(null).map(() => Array(a.length + 1).fill(null));

        for (let i = 0; i <= a.length; i++) matrix[0][i] = i;
        for (let j = 0; j <= b.length; j++) matrix[j][0] = j;

        for (let j = 1; j <= b.length; j++) {
            for (let i = 1; i <= a.length; i++) {
                const substitutionCost = a[i - 1] === b[j - 1] ? 0 : 1;
                matrix[j][i] = Math.min(
                    matrix[j][i - 1] + 1,     // deletion
                    matrix[j - 1][i] + 1,     // insertion
                    matrix[j - 1][i - 1] + substitutionCost // substitution
                );
            }
        }

        return matrix[b.length][a.length];
    }

    static generatePerformanceWarning(argumentName: string, value: any): string | null {
        if (argumentName === 'limit' && typeof value === 'number' && value > 1000) {
            return `Large limit value (${value}) may impact performance. Consider using pagination with smaller limits and 'page' or 'offset' arguments.`;
        }

        if (argumentName === 'limit' && typeof value === 'string') {
            const numValue = parseInt(value, 10);
            if (!isNaN(numValue) && numValue > 1000) {
                return `Large limit value (${numValue}) may impact performance. Consider using pagination with smaller limits and 'page' or 'offset' arguments.`;
            }
        }

        return null;
    }

    /**
     * Finds the specific GraphQL type for a given field path and argument name.
     * This is essential for schema-aware validation.
     * @param schema The GraphQL schema object.
     * @param fieldPath The dot-separated path to the field (e.g., "user.posts").
     * @param argumentName The name of the argument to get the type for.
     * @returns The GraphQLInputType if found, otherwise null.
     */
    static getArgumentType(
        schema: GraphQLSchema,
        fieldPath: string,
        argumentName: string
    ): GraphQLInputType | null {
        try {
            const pathParts = fieldPath.split('.').filter(p => p);
            if (pathParts.length === 0) return null;

            let currentType: GraphQLObjectType | GraphQLInterfaceType | null = schema.getQueryType() || null;
            if (!currentType) return null;

            // Navigate through the path to find the field
            for (let i = 0; i < pathParts.length; i++) {
                const fieldName = pathParts[i];
                const field: any = currentType.getFields()[fieldName];
                if (!field) return null;

                if (i === pathParts.length - 1) {
                    // This is the target field, look for the argument
                    const arg = field.args.find((a: any) => a.name === argumentName);
                    return arg ? (arg.type as GraphQLInputType) : null;
                } else {
                    // Navigate deeper
                    const fieldType: any = getNamedType(field.type);
                    if (isObjectType(fieldType) || isInterfaceType(fieldType)) {
                        currentType = fieldType;
                    } else {
                        return null;
                    }
                }
            }

            return null;
        } catch (error) {
            console.warn('Error getting argument type:', error);
            return null;
        }
    }

    static validateRequiredArguments(
        schema: GraphQLSchema,
        queryStructure: any,
        operationType: string = 'query'
    ): { valid: boolean; warnings: string[] } {
        const warnings: string[] = [];

        const validateNode = (node: any, path: string, currentType: GraphQLObjectType | GraphQLInterfaceType | null) => {
            if (!currentType || !node.fields) return;

            Object.entries(node.fields).forEach(([fieldKey, fieldNode]: [string, any]) => {
                const fieldName = fieldNode.fieldName || fieldKey;
                const fieldPath = path ? `${path}.${fieldKey}` : fieldKey;

                try {
                    const fields = currentType.getFields();
                    const fieldDef = fields[fieldName];

                    if (fieldDef && fieldDef.args) {
                        fieldDef.args.forEach((argDef: any) => {
                            if (isNonNullType(argDef.type)) {
                                const providedArgs = fieldNode.args || {};
                                if (!(argDef.name in providedArgs)) {
                                    warnings.push(`Required argument '${argDef.name}' missing for field '${fieldPath}'`);
                                }
                            }
                        });
                    }

                    // Recurse into nested fields
                    if (fieldNode.fields && Object.keys(fieldNode.fields).length > 0) {
                        const nextType = fieldDef ? getNamedType(fieldDef.type) : null;
                        if (nextType && (isObjectType(nextType) || isInterfaceType(nextType))) {
                            validateNode(fieldNode, fieldPath, nextType);
                        }
                    }
                } catch (error) {
                    console.warn(`Error validating field ${fieldPath}:`, error);
                }
            });
        };

        try {
            let rootType: GraphQLObjectType | null = null;
            switch (operationType.toLowerCase()) {
                case 'query':
                    rootType = schema.getQueryType() || null;
                    break;
                case 'mutation':
                    rootType = schema.getMutationType() || null;
                    break;
                case 'subscription':
                    rootType = schema.getSubscriptionType() || null;
                    break;
            }

            if (rootType) {
                validateNode(queryStructure, '', rootType);
            }
        } catch (error) {
            console.warn('Error in validateRequiredArguments:', error);
        }

        return { valid: warnings.length === 0, warnings };
    }
}

// Helper function to sanitize URLs for logging
function sanitizeUrlForLogging(url: string): string {
    try {
        const urlObj = new URL(url);
        if (urlObj.username || urlObj.password) {
            return url.replace(/\/\/[^@]*@/, '//***:***@');
        }
        return url;
    } catch {
        return url;
    }
}

// Helper function to resolve endpoint and headers
// SECURITY: Only allows requests to the default GraphQL endpoint to prevent SSRF attacks
// Mock-first approach for testing - defaults to localhost
export function resolveEndpointAndHeaders(): { url: string | null; headers: Record<string, string> } {
    // Only use the default endpoint from environment variables
    const defaultEndpoint = process.env.DEFAULT_GRAPHQL_ENDPOINT;
    let resolvedUrl: string | null = null;

    if (defaultEndpoint) {
        resolvedUrl = defaultEndpoint;
        console.log(`Using default GraphQL endpoint: ${sanitizeUrlForLogging(defaultEndpoint)}`);
    } else {
        // For test environments, default to localhost to prevent real network calls
        if (process.env.NODE_ENV === 'test') {
            resolvedUrl = 'http://localhost:4000/graphql';
            console.log('Test environment: using localhost GraphQL endpoint');
        } else {
            console.warn('No DEFAULT_GRAPHQL_ENDPOINT configured in environment variables');
        }
    }

    const headers: Record<string, string> = {};

    if (process.env.DEFAULT_GRAPHQL_HEADERS) {
        try {
            const defaultHeaders = JSON.parse(process.env.DEFAULT_GRAPHQL_HEADERS);
            if (typeof defaultHeaders !== 'object' || defaultHeaders === null || Array.isArray(defaultHeaders)) {
                throw new Error('Headers must be a valid object');
            }

            // Validate each header key/value
            for (const [key, value] of Object.entries(defaultHeaders)) {
                if (typeof key !== 'string' || typeof value !== 'string') {
                    throw new Error(`Invalid header: ${key} must be string`);
                }
                if (key.length > 100 || value.length > 1000) {
                    throw new Error(`Header ${key} exceeds maximum length`);
                }
            }

            Object.assign(headers, defaultHeaders);
        } catch (error) {
            console.warn(`Failed to parse DEFAULT_GRAPHQL_HEADERS: ${error instanceof Error ? error.message : 'Invalid JSON'}`);
        }
    }

    return { url: resolvedUrl, headers };
}

// Fetch and cache schema
export async function fetchAndCacheSchema(sessionHeaders?: Record<string, string>): Promise<GraphQLSchema> {
    const { url: resolvedUrl, headers: envHeaders } = resolveEndpointAndHeaders();

    if (!resolvedUrl) {
        throw new Error("No default GraphQL endpoint configured in environment variables (DEFAULT_GRAPHQL_ENDPOINT)");
    }

    if (schemaCache.has(resolvedUrl)) {
        return schemaCache.get(resolvedUrl)!;
    }

    const mergedHeaders = { ...envHeaders, ...sessionHeaders };
    const introspectionQuery = getIntrospectionQuery({ descriptions: true });

    try {
        const response = await fetch(resolvedUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...mergedHeaders,
            },
            body: JSON.stringify({ query: introspectionQuery }),
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const result = await response.json();

        if (result.errors) {
            throw new Error(`GraphQL errors: ${JSON.stringify(result.errors)}`);
        }

        if (!result.data) {
            throw new Error("Invalid introspection response: 'data' field missing");
        }

        const schema = buildClientSchema(result.data);
        schemaCache.set(resolvedUrl, schema);
        rawSchemaJsonCache.set(resolvedUrl, result.data);

        return schema;
    } catch (error) {
        throw new Error(`Error processing schema from ${resolvedUrl}: ${error instanceof Error ? error.message : String(error)}`);
    }
}

// Helper function to get type name string from GraphQL type
export function getTypeNameStr(gqlType: any): string {
    if (isNonNullType(gqlType)) return `${getTypeNameStr(gqlType.ofType)}!`;
    if (isListType(gqlType)) return `[${getTypeNameStr(gqlType.ofType)}]`;
    if (gqlType && gqlType.name) return gqlType.name;
    return String(gqlType);
}

// Generate session ID
export function generateSessionId(): string {
    return randomBytes(16).toString('hex');
}

// Query state storage functions
export async function saveQueryState(sessionId: string, queryState: QueryState): Promise<void> {
    const redisAvailable = await initializeRedis();
    const serializableData = { ...queryState };

    try {
        if (redisAvailable && useRedis) {
            const sessionKey = `querystate:${sessionId}`;
            await redis.setEx(sessionKey, 3600, JSON.stringify(serializableData));
            console.log(`Session ${sessionId} saved to Redis`);
        } else {
            memoryStorage.set(`querystate:${sessionId}`, serializableData);
            console.log(`Session ${sessionId} saved to memory storage`);
        }
    } catch (error) {
        console.error(`Error saving query state ${sessionId} to Redis:`, error);
        // Always fall back to memory storage on error
        memoryStorage.set(`querystate:${sessionId}`, serializableData);
        console.log(`Session ${sessionId} saved to memory storage as fallback`);
    }
}

export async function loadQueryState(sessionId: string): Promise<QueryState | null> {
    const redisAvailable = await initializeRedis();

    try {
        if (redisAvailable && useRedis) {
            const sessionKey = `querystate:${sessionId}`;
            const data = await redis.get(sessionKey);

            if (data) {
                const jsonString = typeof data === 'string' ? data : (data as Buffer).toString();
                const queryState = JSON.parse(jsonString);
                console.log(`Session ${sessionId} loaded from Redis`);
                return queryState;
            }

            // If not found in Redis, also check memory storage as fallback
            const memoryData = memoryStorage.get(`querystate:${sessionId}`);
            if (memoryData) {
                console.log(`Session ${sessionId} found in memory storage fallback`);
                return memoryData;
            }
        } else {
            const memoryData = memoryStorage.get(`querystate:${sessionId}`);
            if (memoryData) {
                console.log(`Session ${sessionId} loaded from memory storage`);
                return memoryData;
            }
        }

        console.log(`Session ${sessionId} not found in any storage`);
        return null;
    } catch (error) {
        console.error(`Error loading query state ${sessionId} from Redis:`, error);
        // Fall back to memory storage on error
        const memoryData = memoryStorage.get(`querystate:${sessionId}`);
        if (memoryData) {
            console.log(`Session ${sessionId} loaded from memory storage after Redis error`);
            return memoryData;
        }
        return null;
    }
}

export async function deleteQueryState(sessionId: string): Promise<boolean> {
    const redisAvailable = await initializeRedis();

    try {
        if (redisAvailable && useRedis) {
            const sessionKey = `querystate:${sessionId}`;
            const result = await redis.del(sessionKey);
            return (result as number) > 0;
        } else {
            const existed = memoryStorage.has(`querystate:${sessionId}`);
            memoryStorage.delete(`querystate:${sessionId}`);
            return existed;
        }
    } catch (error) {
        console.error(`Error deleting query state ${sessionId}:`, error);
        const existed = memoryStorage.has(`querystate:${sessionId}`);
        memoryStorage.delete(`querystate:${sessionId}`);
        return existed;
    }
}

// Export the raw schema cache for use in other tools
export { rawSchemaJsonCache };

// Generate example values for GraphQL types
export function generateExampleValue(gqlType: any): any {
    if (isNonNullType(gqlType)) {
        return generateExampleValue(gqlType.ofType);
    }

    if (isListType(gqlType)) {
        return generateExampleValue(gqlType.ofType);
    }

    if (isScalarType(gqlType)) {
        if (gqlType.name === "String") return "example_string";
        if (gqlType.name === "Int") return 42;
        if (gqlType.name === "Float") return 3.14;
        if (gqlType.name === "Boolean") return true;
        if (gqlType.name === "ID") return "example_id";
        return "example_value";
    }

    if (isEnumType(gqlType)) {
        const enumValues = gqlType.getValues();
        return enumValues.length > 0 ? enumValues[0].name : "ENUM_VALUE";
    }

    if (isInputObjectType(gqlType)) {
        const nestedObj: any = {};
        const fields = gqlType.getFields();
        Object.entries(fields).forEach(([fieldName, fieldDef]) => {
            if (isNonNullType((fieldDef as any).type)) {
                nestedObj[fieldName] = generateExampleValue((fieldDef as any).type.ofType);
            } else {
                nestedObj[fieldName] = generateExampleValue((fieldDef as any).type);
            }
        });
        return nestedObj;
    }

    return null;
}

// Build query from structure
export function buildQueryFromStructure(
    queryStructure: any,
    operationType: string,
    variablesSchema: Record<string, string>,
    operationName?: string | null,
    fragments: Record<string, any> = {},
    operationDirectives: any[] = [],
    variablesDefaults: Record<string, any> = {}
): string {
    const hasFields = queryStructure.fields && Object.keys(queryStructure.fields).length > 0;
    const hasFragmentSpreads = queryStructure.fragmentSpreads && queryStructure.fragmentSpreads.length > 0;
    const hasInlineFragments = queryStructure.inlineFragments && queryStructure.inlineFragments.length > 0;
    const hasFragments = fragments && Object.keys(fragments).length > 0;

    if (!hasFields && !hasFragmentSpreads && !hasInlineFragments && !hasFragments) {
        return "";
    }

    let variablesString = Object.entries(variablesSchema)
        .map(([name, type]) => {
            const cleanVarName = name.startsWith('$') ? name.slice(1) : name;
            let definition = `$${cleanVarName}: ${type}`;

            if (variablesDefaults[name] !== undefined) {
                const defaultValue = variablesDefaults[name];
                definition += ` = ${GraphQLValidationUtils.serializeGraphQLValue(defaultValue)}`;
            }

            return definition;
        })
        .join(', ');

    let operationDirectivesString = "";
    if (operationDirectives && operationDirectives.length > 0) {
        operationDirectivesString = " " + operationDirectives.map(dir => {
            let argsString = "";
            if (dir.arguments && dir.arguments.length > 0) {
                argsString = "(" + dir.arguments.map((arg: { name: string, value: any }) => {
                    const value = typeof arg.value === 'string' && arg.value.startsWith('$')
                        ? arg.value
                        : GraphQLValidationUtils.serializeGraphQLValue(arg.value);
                    return `${arg.name}: ${value}`;
                }).join(', ') + ")";
            }
            return `@${dir.name}${argsString}`;
        }).join(" ") + " ";
    }

    const selectionSetString = buildSelectionSet(queryStructure.fields);

    // Properly serialize fragments
    const fragmentsString = Object.entries(fragments).map(([fragmentName, fragmentData]: [string, any]) => {
        if (fragmentData && fragmentData.onType && fragmentData.fields) {
            const fragmentSelectionSet = buildSelectionSet(fragmentData.fields);
            return `fragment ${fragmentName} on ${fragmentData.onType} {\n${fragmentSelectionSet}\n}`;
        }
        return '';
    }).filter(f => f).join('\n\n');

    let queryString = '';
    if (operationType) {
        queryString += `${operationType}`;
    }

    if (operationName) {
        queryString += ` ${operationName}`;
    }

    if (variablesString) {
        queryString += `(${variablesString})`
    }

    if (operationDirectivesString) {
        queryString += `${operationDirectivesString}`;
    }

    queryString += ` {\n${selectionSetString}\n}`;

    if (fragmentsString) {
        queryString += `\n\n${fragmentsString}`;
    }

    return queryString.trim();
}

// Build selection set from fields structure
export function buildSelectionSet(fields: Record<string, any>, indent = '  '): string {
    return Object.entries(fields).map(([, fieldData]) => {
        let fieldString = `${indent}${fieldData.alias ? fieldData.alias + ': ' : ''}${fieldData.fieldName}`;

        if (fieldData.args && Object.keys(fieldData.args).length > 0) {
            const args = Object.entries(fieldData.args).map(([argName, argValue]: [string, any]) => {
                if (typeof argValue === 'object' && argValue !== null && ('value' in argValue || 'is_variable' in argValue || 'is_enum' in argValue || 'is_typed' in argValue)) {
                    if (argValue.is_variable) {
                        return `${argName}: ${argValue.value}`;
                    } else if (argValue.is_enum) {
                        return `${argName}: ${argValue.value}`;
                    } else if (argValue.is_typed) {
                        // Handle typed values - serialize the raw value properly
                        if (typeof argValue.value === 'number' || typeof argValue.value === 'boolean' || argValue.value === null) {
                            return `${argName}: ${argValue.value}`;
                        } else {
                            return `${argName}: ${GraphQLValidationUtils.serializeGraphQLValue(argValue.value)}`;
                        }
                    } else {
                        return `${argName}: ${GraphQLValidationUtils.serializeGraphQLValue(argValue.value)}`;
                    }
                } else {
                    if (typeof argValue === 'string' && argValue.startsWith('$')) {
                        return `${argName}: ${argValue}`;
                    } else if (typeof argValue === 'object' && argValue !== null && '__graphqlString' in argValue) {
                        // Handle special string format to prevent double quoting
                        return `${argName}: ${JSON.stringify(argValue.__graphqlString)}`;
                    } else {
                        return `${argName}: ${GraphQLValidationUtils.serializeGraphQLValue(argValue)}`;
                    }
                }
            });
            fieldString += `(${args.join(', ')})`;
        }

        if (fieldData.directives && fieldData.directives.length > 0) {
            const directives = fieldData.directives.map((dir: any) => {
                let directiveStr = `@${dir.name}`;
                if (dir.arguments && dir.arguments.length > 0) {
                    const dirArgs = dir.arguments.map((arg: any) => {
                        const value = typeof arg.value === 'string' && arg.value.startsWith('$')
                            ? arg.value
                            : GraphQLValidationUtils.serializeGraphQLValue(arg.value);
                        return `${arg.name}: ${value}`;
                    });
                    directiveStr += `(${dirArgs.join(', ')})`;
                }
                return directiveStr;
            });
            fieldString += ` ${directives.join(' ')}`;
        }

        let subSelectionContent = '';
        if (fieldData.fields && Object.keys(fieldData.fields).length > 0) {
            subSelectionContent += buildSelectionSet(fieldData.fields, indent + '  ');
        }

        if (fieldData.fragmentSpreads && Array.isArray(fieldData.fragmentSpreads) && fieldData.fragmentSpreads.length > 0) {
            if (subSelectionContent && !subSelectionContent.endsWith('\n')) subSelectionContent += '\n';
            subSelectionContent += fieldData.fragmentSpreads.map((s: string) => `${indent + '  '}...${s}`).join('\n');
        }

        if (fieldData.inlineFragments) {
            fieldData.inlineFragments.forEach((inlineFrag: any) => {
                if (inlineFrag.on_type && inlineFrag.selections && Object.keys(inlineFrag.selections).length > 0) {
                    if (subSelectionContent && !subSelectionContent.endsWith('\n')) subSelectionContent += '\n';
                    const inlineFragSelectionStr = buildSelectionSet(inlineFrag.selections, indent + '    ');
                    subSelectionContent += `${indent + '  '}... on ${inlineFrag.on_type} {\n${inlineFragSelectionStr}\n${indent + '  '}}`;
                }
            });
        }

        if (subSelectionContent) {
            fieldString += ` {\n${subSelectionContent}\n${indent}}`;
        }

        return fieldString;
    }).join('\n');
}

export const MAX_INPUT_COMPLEXITY = {
    DEPTH: 10,
    PROPERTIES: 1000,
};

// Query depth and complexity limits
export const MAX_QUERY_COMPLEXITY = {
    DEPTH: 8, // Recommended 7-10 levels, setting to 8
    FIELD_COUNT: 100,
    TOTAL_COMPLEXITY_SCORE: 1000,
};

export const QUERY_EXECUTION_TIMEOUT = {
    DEFAULT: 30000, // 30 seconds
    EXPENSIVE: 60000, // 60 seconds for expensive operations
};

/**
 * Analyze query depth and complexity
 */
export function analyzeQueryComplexity(
    queryStructure: any,
    operationType: string = 'query'
): {
    valid: boolean;
    depth: number;
    fieldCount: number;
    complexityScore: number;
    errors: string[];
    warnings: string[];
} {
    const result = {
        valid: true,
        depth: 0,
        fieldCount: 0,
        complexityScore: 0,
        errors: [] as string[],
        warnings: [] as string[],
    };

    const visited = new Set<string>();

    function analyzeNode(node: any, currentDepth: number, path: string = ''): void {
        if (!node || !node.fields) return;

        if (currentDepth > result.depth) {
            result.depth = currentDepth;
        }

        if (currentDepth > MAX_QUERY_COMPLEXITY.DEPTH) {
            result.valid = false;
            result.errors.push(
                `Query depth ${currentDepth} exceeds maximum allowed depth of ${MAX_QUERY_COMPLEXITY.DEPTH} at path: ${path}`
            );
            return; // Stop analyzing deeper to prevent excessive error messages
        }

        // Analyze each field
        Object.entries(node.fields).forEach(([fieldKey, fieldData]: [string, any]) => {
            const fieldPath = path ? `${path}.${fieldKey}` : fieldKey;
            result.fieldCount++;

            // Calculate field complexity score
            let fieldComplexity = 1; // Base complexity

            // Add complexity for arguments
            if (fieldData.args && Object.keys(fieldData.args).length > 0) {
                fieldComplexity += Object.keys(fieldData.args).length * 0.5;

                // Higher complexity for pagination arguments with large values
                Object.entries(fieldData.args).forEach(([argName, argValue]: [string, any]) => {
                    if (['first', 'last', 'limit', 'count'].includes(argName.toLowerCase())) {
                        const numValue = typeof argValue === 'number' ? argValue :
                            (typeof argValue === 'string' ? parseInt(argValue, 10) : 0);
                        if (numValue > 100) {
                            fieldComplexity += Math.log10(numValue) * 2;
                        }
                    }
                });
            }

            // Add complexity for directives
            if (fieldData.directives && fieldData.directives.length > 0) {
                fieldComplexity += fieldData.directives.length * 0.3;
            }

            // Multiply by depth factor (deeper fields are more expensive)
            fieldComplexity *= Math.pow(1.5, currentDepth);

            result.complexityScore += fieldComplexity;

            // Prevent circular references in analysis
            if (!visited.has(fieldPath)) {
                visited.add(fieldPath);

                // Recursively analyze nested fields
                if (fieldData.fields && Object.keys(fieldData.fields).length > 0) {
                    analyzeNode(fieldData, currentDepth + 1, fieldPath);
                }

                visited.delete(fieldPath);
            }
        });

        // Analyze fragment spreads
        if (node.fragmentSpreads && Array.isArray(node.fragmentSpreads)) {
            node.fragmentSpreads.forEach((fragmentName: string) => {
                result.fieldCount++;
                result.complexityScore += 2; // Fragment spreads add complexity
            });
        }

        // Analyze inline fragments
        if (node.inlineFragments && Array.isArray(node.inlineFragments)) {
            node.inlineFragments.forEach((inlineFragment: any, index: number) => {
                const fragPath = `${path}...on${inlineFragment.on_type || 'Unknown'}[${index}]`;
                if (inlineFragment.selections) {
                    analyzeNode({ fields: inlineFragment.selections }, currentDepth + 1, fragPath);
                }
            });
        }
    }

    // Start analysis from root
    analyzeNode(queryStructure, 1);

    // Check overall limits
    if (result.fieldCount > MAX_QUERY_COMPLEXITY.FIELD_COUNT) {
        result.valid = false;
        result.errors.push(
            `Query field count ${result.fieldCount} exceeds maximum allowed field count of ${MAX_QUERY_COMPLEXITY.FIELD_COUNT}`
        );
    }

    if (result.complexityScore > MAX_QUERY_COMPLEXITY.TOTAL_COMPLEXITY_SCORE) {
        result.valid = false;
        result.errors.push(
            `Query complexity score ${Math.round(result.complexityScore)} exceeds maximum allowed complexity of ${MAX_QUERY_COMPLEXITY.TOTAL_COMPLEXITY_SCORE}`
        );
    }

    // Add warnings for high complexity
    if (result.complexityScore > MAX_QUERY_COMPLEXITY.TOTAL_COMPLEXITY_SCORE * 0.7) {
        result.warnings.push(
            `Query complexity score ${Math.round(result.complexityScore)} is approaching the limit of ${MAX_QUERY_COMPLEXITY.TOTAL_COMPLEXITY_SCORE}. Consider simplifying the query.`
        );
    }

    if (result.depth > MAX_QUERY_COMPLEXITY.DEPTH * 0.8) {
        result.warnings.push(
            `Query depth ${result.depth} is approaching the limit of ${MAX_QUERY_COMPLEXITY.DEPTH}. Consider reducing nesting.`
        );
    }

    return result;
}

/**
 * Execute with timeout
 */
export async function executeWithTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    timeoutMessage: string = 'Operation timed out'
): Promise<T> {
    const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
            reject(new Error(`${timeoutMessage} (${timeoutMs}ms)`));
        }, timeoutMs);
    });

    return Promise.race([promise, timeoutPromise]);
}

/**
 * Calculate per-field complexity score for rate limiting
 */
export function calculateFieldComplexityScore(fieldData: any, depth: number = 1): number {
    let score = 1; // Base score

    // Arguments add complexity
    if (fieldData.args && Object.keys(fieldData.args).length > 0) {
        score += Object.keys(fieldData.args).length * 0.5;
    }

    // Directives add complexity
    if (fieldData.directives && fieldData.directives.length > 0) {
        score += fieldData.directives.length * 0.3;
    }

    // Nested fields multiply complexity
    if (fieldData.fields && Object.keys(fieldData.fields).length > 0) {
        const nestedScore = Object.values(fieldData.fields).reduce((sum: number, nestedField: any) => {
            return sum + calculateFieldComplexityScore(nestedField, depth + 1);
        }, 0);
        score += nestedScore * 1.2; // Nested fields are more expensive
    }

    // Depth multiplier
    score *= Math.pow(1.3, depth - 1);

    return score;
}

export function validateInputComplexity(value: any, name: string): string | null {
    if (value === null || typeof value !== 'object') {
        return null; // Not a complex object, no need to validate
    }

    const visited = new WeakSet();
    let count = 0;

    function check(val: any, depth: number): string | null {
        if (val === null || typeof val !== 'object') {
            return null;
        }

        if (depth > MAX_INPUT_COMPLEXITY.DEPTH) {
            return `Input for "${name}" exceeds the maximum allowed depth of ${MAX_INPUT_COMPLEXITY.DEPTH}.`;
        }

        if (visited.has(val)) {
            // This is a circular reference. We don't treat it as an error,
            // but we stop traversing to prevent infinite loops.
            return null;
        }
        visited.add(val);

        if (Array.isArray(val)) {
            count += val.length;
            for (const item of val) {
                const error = check(item, depth + 1);
                if (error) return error;
            }
        } else {
            const keys = Object.keys(val);
            count += keys.length;
            for (const key of keys) {
                const error = check(val[key], depth + 1);
                if (error) return error;
            }
        }

        if (count > MAX_INPUT_COMPLEXITY.PROPERTIES) {
            return `Input for "${name}" exceeds the maximum allowed number of properties/elements of ${MAX_INPUT_COMPLEXITY.PROPERTIES}.`;
        }

        return null;
    }

    return check(value, 1);
} 