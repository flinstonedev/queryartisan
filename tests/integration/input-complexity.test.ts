import { describe, it, expect } from 'vitest';
import { validateInputComplexity, MAX_INPUT_COMPLEXITY } from '../../tools/shared-utils';

describe('validateInputComplexity', () => {
    it('should return null for simple, valid inputs', () => {
        expect(validateInputComplexity('a string', 'test')).toBeNull();
        expect(validateInputComplexity(123, 'test')).toBeNull();
        expect(validateInputComplexity(true, 'test')).toBeNull();
        expect(validateInputComplexity(null, 'test')).toBeNull();
        expect(validateInputComplexity({ a: 1, b: 2 }, 'test')).toBeNull();
    });

    it('should return an error for inputs that are too deep', () => {
        let deepObject: any = {};
        let current = deepObject;
        for (let i = 0; i < MAX_INPUT_COMPLEXITY.DEPTH + 1; i++) {
            current.nested = {};
            current = current.nested;
        }
        const error = validateInputComplexity(deepObject, 'deepObject');
        expect(error).not.toBeNull();
        expect(error).toContain('exceeds the maximum allowed depth');
    });

    it('should return an error for inputs with too many properties', () => {
        const wideObject: { [key: string]: number } = {};
        for (let i = 0; i < MAX_INPUT_COMPLEXITY.PROPERTIES + 1; i++) {
            wideObject[`key${i}`] = i;
        }
        const error = validateInputComplexity(wideObject, 'wideObject');
        expect(error).not.toBeNull();
        expect(error).toContain('exceeds the maximum allowed number of properties/elements');
    });

    it('should return an error for arrays with too many elements', () => {
        const largeArray = new Array(MAX_INPUT_COMPLEXITY.PROPERTIES + 1).fill(0);
        const error = validateInputComplexity(largeArray, 'largeArray');
        expect(error).not.toBeNull();
        expect(error).toContain('exceeds the maximum allowed number of properties/elements');
    });

    it('should correctly count properties in nested objects and arrays', () => {
        const complexObject = {
            a: 1,
            b: [1, 2, 3], // 1 (array) + 3 (elements) = 4
            c: {
                d: 4,
                e: {
                    f: 5
                }
            } // 1 (c) + 1 (e) = 2
        }; // Total properties = 1 (root) + 1 (a) + 1 (b) + 3 (b elements) + 1 (c) + 1 (d) + 1 (e) + 1(f) => should be less than the limit
        const count = (obj: any) => JSON.stringify(obj).match(/"/g)?.length || 0; // A rough way to estimate complexity for the test
        expect(count(complexObject)).toBeLessThan(MAX_INPUT_COMPLEXITY.PROPERTIES);
        expect(validateInputComplexity(complexObject, 'complexObject')).toBeNull();
    });

    it('should handle circular references gracefully without throwing an error', () => {
        const obj1: any = {};
        const obj2: any = { obj1 };
        obj1.obj2 = obj2;
        expect(validateInputComplexity(obj1, 'circular')).toBeNull();
    });

}); 