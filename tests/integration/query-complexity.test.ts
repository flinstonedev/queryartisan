import { describe, it, expect, vi, beforeEach } from 'vitest';
import { analyzeQueryComplexity, MAX_QUERY_COMPLEXITY, executeWithTimeout } from '../../tools/shared-utils';

describe('Query Complexity Analysis', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('analyzeQueryComplexity', () => {
        it('should pass validation for simple queries', () => {
            const simpleQuery = {
                fields: {
                    user: {
                        fieldName: 'user',
                        fields: {
                            name: { fieldName: 'name' },
                            email: { fieldName: 'email' }
                        }
                    }
                }
            };

            const result = analyzeQueryComplexity(simpleQuery);

            expect(result.valid).toBe(true);
            expect(result.depth).toBe(2);
            expect(result.fieldCount).toBe(3);
            expect(result.complexityScore).toBeGreaterThan(0);
            expect(result.errors).toHaveLength(0);
        });

        it('should fail validation for queries exceeding maximum depth', () => {
            // Create a query that exceeds MAX_QUERY_COMPLEXITY.DEPTH (8)
            let deepQuery: any = { fields: {} };
            let current = deepQuery.fields;

            for (let i = 0; i < MAX_QUERY_COMPLEXITY.DEPTH + 2; i++) {
                current[`level${i}`] = {
                    fieldName: `level${i}`,
                    fields: {}
                };
                current = current[`level${i}`].fields;
            }

            const result = analyzeQueryComplexity(deepQuery);

            expect(result.valid).toBe(false);
            expect(result.depth).toBeGreaterThan(MAX_QUERY_COMPLEXITY.DEPTH);
            expect(result.errors[0]).toContain('exceeds maximum allowed depth of 8 at path:');
        });

        it('should handle empty query structures', () => {
            const emptyQuery = { fields: {} };
            const result = analyzeQueryComplexity(emptyQuery);

            expect(result.valid).toBe(true);
            expect(result.depth).toBe(1); // Empty queries still have depth 1 (root level)
            expect(result.fieldCount).toBe(0);
            expect(result.complexityScore).toBe(0);
            expect(result.errors).toHaveLength(0);
        });
    });

    describe('executeWithTimeout', () => {
        it('should resolve promise within timeout', async () => {
            const fastPromise = Promise.resolve('success');
            const result = await executeWithTimeout(fastPromise, 1000);
            expect(result).toBe('success');
        });

        it('should reject when promise takes too long', async () => {
            const slowPromise = new Promise(resolve =>
                setTimeout(() => resolve('too slow'), 200)
            );

            await expect(executeWithTimeout(slowPromise, 100, 'Test timeout'))
                .rejects
                .toThrow('Test timeout');
        });
    });
});
