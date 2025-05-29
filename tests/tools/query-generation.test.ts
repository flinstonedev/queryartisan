import { describe, it, expect } from 'vitest';
import { buildSelectionSet } from '../../tools/shared-utils.js';

describe('Query Generation for Typed Arguments', () => {
    describe('Numeric Argument Serialization', () => {
        it('should generate GraphQL syntax without quotes for numeric values', () => {
            const fields = {
                avatarUrl: {
                    fieldName: 'avatarUrl',
                    alias: null,
                    args: {
                        size: {
                            value: 100,
                            is_typed: true
                        }
                    },
                    fields: {},
                    directives: [],
                    fragmentSpreads: [],
                    inlineFragments: []
                }
            };

            const result = buildSelectionSet(fields);

            expect(result).toContain('avatarUrl(size: 100)');
            expect(result).not.toContain('"100"');
        });

        it('should handle multiple numeric arguments', () => {
            const fields = {
                repositories: {
                    fieldName: 'repositories',
                    alias: null,
                    args: {
                        first: {
                            value: 10,
                            is_typed: true
                        },
                        after: {
                            value: "cursor123",
                            is_typed: false
                        }
                    },
                    fields: {},
                    directives: [],
                    fragmentSpreads: [],
                    inlineFragments: []
                }
            };

            const result = buildSelectionSet(fields);

            expect(result).toContain('first: 10');
            expect(result).not.toContain('first: "10"');
            expect(result).toContain('after: "cursor123"');
        });
    });

    describe('Boolean Argument Serialization', () => {
        it('should generate GraphQL syntax without quotes for boolean values', () => {
            const fields = {
                user: {
                    fieldName: 'user',
                    alias: null,
                    args: {
                        includeImages: {
                            value: true,
                            is_typed: true
                        },
                        active: {
                            value: false,
                            is_typed: true
                        }
                    },
                    fields: {},
                    directives: [],
                    fragmentSpreads: [],
                    inlineFragments: []
                }
            };

            const result = buildSelectionSet(fields);

            expect(result).toContain('includeImages: true');
            expect(result).toContain('active: false');
            expect(result).not.toContain('"true"');
            expect(result).not.toContain('"false"');
        });
    });

    describe('Mixed Type Arguments', () => {
        it('should handle mixed typed and string arguments correctly', () => {
            const fields = {
                search: {
                    fieldName: 'search',
                    alias: null,
                    args: {
                        query: {
                            value: "GraphQL",
                            is_typed: false
                        },
                        first: {
                            value: 5,
                            is_typed: true
                        },
                        includeArchived: {
                            value: false,
                            is_typed: true
                        }
                    },
                    fields: {},
                    directives: [],
                    fragmentSpreads: [],
                    inlineFragments: []
                }
            };

            const result = buildSelectionSet(fields);

            expect(result).toContain('query: "GraphQL"');
            expect(result).toContain('first: 5');
            expect(result).toContain('includeArchived: false');

            expect(result).not.toContain('first: "5"');
            expect(result).not.toContain('includeArchived: "false"');
        });
    });

    describe('Null Value Handling', () => {
        it('should handle null values correctly', () => {
            const fields = {
                updateUser: {
                    fieldName: 'updateUser',
                    alias: null,
                    args: {
                        metadata: {
                            value: null,
                            is_typed: true
                        }
                    },
                    fields: {},
                    directives: [],
                    fragmentSpreads: [],
                    inlineFragments: []
                }
            };

            const result = buildSelectionSet(fields);

            expect(result).toContain('metadata: null');
            expect(result).not.toContain('"null"');
        });
    });

    describe('Backward Compatibility', () => {
        it('should handle legacy string arguments (non-typed) as before', () => {
            const fields = {
                user: {
                    fieldName: 'user',
                    alias: null,
                    args: {
                        name: "John Doe", // Legacy format - plain string
                        id: {
                            value: "123",
                            // No is_typed flag, should be treated as string
                        }
                    },
                    fields: {},
                    directives: [],
                    fragmentSpreads: [],
                    inlineFragments: []
                }
            };

            const result = buildSelectionSet(fields);

            expect(result).toContain('name: "John Doe"');
            expect(result).toContain('id: "123"');
        });
    });
});