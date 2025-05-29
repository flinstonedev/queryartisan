/**
 * 🔧 PRIORITY 1 FIX: Test Assertion Helpers
 * 
 * This file provides standardized assertion patterns to replace
 * the 80+ anti-pattern assertions using expect().toBeUndefined()
 */

import { expect } from 'vitest';

/**
 * Assert that an operation was successful
 * Replaces: expect(result.error).toBeUndefined()
 */
export function expectSuccess(result: any, expectedMessage?: string): void {
    // Positive assertion - verify success is explicitly true
    expect(result.success).toBe(true);

    // Verify no error exists
    expect(result.error).toBeUndefined();

    // If expected message provided, verify it
    if (expectedMessage) {
        expect(result.message).toContain(expectedMessage);
    }

    // Verify message exists (success should always have a message)
    expect(result.message).toBeDefined();
    expect(typeof result.message).toBe('string');
    expect(result.message.length).toBeGreaterThan(0);
}

/**
 * Assert that an operation failed with expected error
 * Replaces inconsistent error checking patterns
 */
export function expectError(result: any, expectedErrorMessage?: string): void {
    // Positive assertion - verify error exists
    expect(result.error).toBeDefined();
    expect(typeof result.error).toBe('string');
    expect(result.error.length).toBeGreaterThan(0);

    // Verify success is not present or is false
    expect(result.success).not.toBe(true);

    // If expected error message provided, verify it
    if (expectedErrorMessage) {
        expect(result.error).toContain(expectedErrorMessage);
    }
}

/**
 * Assert that a query string contains expected GraphQL content
 * Replaces inconsistent query validation patterns  
 */
export function expectValidQuery(queryString: string, expectedContent: string[]): void {
    // Verify query string is valid
    expect(queryString).toBeDefined();
    expect(typeof queryString).toBe('string');
    expect(queryString.length).toBeGreaterThan(0);

    // Verify it contains expected content
    expectedContent.forEach(content => {
        expect(queryString).toContain(content);
    });

    // Basic GraphQL syntax validation
    expect(queryString).toMatch(/^(query|mutation|subscription)/);
    expect(queryString).toContain('{');
    expect(queryString).toContain('}');
}

/**
 * Assert that a field selection was successful
 * Standardized pattern for field selection tests
 */
export function expectFieldSelection(result: any, fieldName: string, parentPath?: string): void {
    expectSuccess(result);

    const expectedMessage = parentPath
        ? `Field '${fieldName}' selected successfully at path '${parentPath}'`
        : `Field '${fieldName}' selected successfully`;

    expect(result.message).toContain(expectedMessage);

    // Verify query structure was updated
    expect(result.queryStructure).toBeDefined();
}

/**
 * Assert that an argument was set successfully  
 * Standardized pattern for argument setting tests
 */
export function expectArgumentSet(
    result: any,
    argumentName: string,
    argumentValue: any,
    fieldPath: string
): void {
    expectSuccess(result);

    expect(result.message).toContain(`argument '${argumentName}'`);
    expect(result.message).toContain(String(argumentValue));
    expect(result.message).toContain(`path '${fieldPath}'`);

    // Verify query structure was updated
    expect(result.queryStructure).toBeDefined();
}

/**
 * Assert that a variable was set successfully
 * Standardized pattern for variable tests
 */
export function expectVariableSet(
    result: any,
    variableName: string,
    variableType: string
): void {
    expectSuccess(result);

    expect(result.message).toContain(`Variable '${variableName}'`);
    expect(result.message).toContain(`type '${variableType}'`);
}

/**
 * Assert that a session was created successfully
 * Standardized pattern for session creation tests
 */
export function expectSessionCreated(
    result: any,
    operationType: string,
    operationName?: string
): void {
    expectSuccess(result);

    expect(result.sessionId).toBeDefined();
    expect(typeof result.sessionId).toBe('string');
    expect(result.sessionId.length).toBeGreaterThan(0);

    expect(result.operationType).toBe(operationType);

    if (operationName) {
        expect(result.operationName).toBe(operationName);
    }
}

/**
 * Assert that a session was ended successfully
 * Standardized pattern for session cleanup tests
 */
export function expectSessionEnded(result: any, sessionId: string): void {
    expectSuccess(result);

    expect(result.message).toContain('ended successfully');
    expect(result.sessionInfo?.sessionId).toBe(sessionId);
}

/**
 * Assert that validation passed
 * Standardized pattern for validation tests
 */
export function expectValidationPassed(result: any): void {
    expect(result.valid).toBe(true);
    expect(result.errors).toBeUndefined();
    expect(result.error).toBeUndefined();

    // Query should be present for successful validation
    if ('query' in result) {
        expect(result.query).toBeDefined();
        expect(typeof result.query).toBe('string');
    }
}

/**
 * Assert that validation failed with expected errors
 * Standardized pattern for validation failure tests
 */
export function expectValidationFailed(result: any, expectedErrors?: string[]): void {
    expect(result.valid).toBe(false);
    expect(result.errors).toBeDefined();
    expect(Array.isArray(result.errors)).toBe(true);
    expect(result.errors.length).toBeGreaterThan(0);

    if (expectedErrors) {
        expectedErrors.forEach(expectedError => {
            expect(result.errors.some((error: string) =>
                error.includes(expectedError)
            )).toBe(true);
        });
    }
}

/**
 * Assert that current query result is valid
 * Standardized pattern for getCurrentQuery tests
 */
export function expectCurrentQuery(
    result: any,
    expectedQueryParts: string[],
    expectedVariables?: Record<string, string>
): void {
    // Should not have error
    expect(result.error).toBeUndefined();

    // Should have query string
    expect(result.queryString).toBeDefined();
    expectValidQuery(result.queryString, expectedQueryParts);

    // Should have variables schema
    expect(result.variables_schema).toBeDefined();

    if (expectedVariables) {
        expect(result.variables_schema).toEqual(expectedVariables);
    }
}

/**
 * Assert that a directive was set successfully
 * Standardized pattern for directive tests
 */
export function expectDirectiveSet(
    result: any,
    directiveName: string,
    fieldPath?: string
): void {
    expectSuccess(result);

    expect(result.message).toContain(`Directive '@${directiveName}'`);

    if (fieldPath) {
        expect(result.message).toContain(`path '${fieldPath}'`);
    }
} 