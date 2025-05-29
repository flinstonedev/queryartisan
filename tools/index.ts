// Central exports for all GraphQL tools
export { introspectSchemaTool } from "./introspect-schema.js";
export { getRootOperationTypesTool } from "./get-root-operation-types.js";
export { getTypeInfoTool } from "./get-type-info.js";
export { getFieldInfoTool } from "./get-field-info.js";
export { startQuerySessionTool } from "./start-query-session.js";
export { endQuerySessionTool } from "./end-query-session.js";
export { selectFieldTool } from "./select-field.js";
export { executeQueryTool } from "./execute-query.js";

// Additional tools extracted
export { getCurrentQueryTool } from "./get-current-query.js";
export { getSelectionsTool } from "./get-selections.js";
export { selectMultipleFieldsTool } from "./select-multiple-fields.js";
export { setQueryVariableTool } from "./set-query-variable.js";
export { setVariableValueTool } from "./set-variable-value.js";
export { removeQueryVariableTool } from "./remove-query-variable.js";
export { setStringArgumentTool } from "./set-string-argument.js";
export { setVariableArgumentTool } from "./set-variable-argument.js";
export { setTypedArgumentTool } from "./set-typed-argument.js";
export { defineNamedFragmentTool } from "./define-named-fragment.js";
export { applyNamedFragmentTool } from "./apply-named-fragment.js";
export { applyInlineFragmentTool } from "./apply-inline-fragment.js";
export { setFieldDirectiveTool } from "./set-field-directive.js";
export { setOperationDirectiveTool } from "./set-operation-directive.js";
export { validateQueryTool } from "./validate-query.js";
export { getInputObjectHelpTool } from "./get-input-object-help.js";
export { setInputObjectArgumentTool } from "./set-input-object-argument.js";

// Shared utilities
export * from "./shared-utils.js";

// Import all tools for the catalog
import { introspectSchemaTool } from "./introspect-schema.js";
import { getRootOperationTypesTool } from "./get-root-operation-types.js";
import { getTypeInfoTool } from "./get-type-info.js";
import { getFieldInfoTool } from "./get-field-info.js";
import { startQuerySessionTool } from "./start-query-session.js";
import { endQuerySessionTool } from "./end-query-session.js";
import { selectFieldTool } from "./select-field.js";
import { executeQueryTool } from "./execute-query.js";
import { getCurrentQueryTool } from "./get-current-query.js";
import { getSelectionsTool } from "./get-selections.js";
import { selectMultipleFieldsTool } from "./select-multiple-fields.js";
import { setQueryVariableTool } from "./set-query-variable.js";
import { setVariableValueTool } from "./set-variable-value.js";
import { removeQueryVariableTool } from "./remove-query-variable.js";
import { setStringArgumentTool } from "./set-string-argument.js";
import { setVariableArgumentTool } from "./set-variable-argument.js";
import { setTypedArgumentTool } from "./set-typed-argument.js";
import { defineNamedFragmentTool } from "./define-named-fragment.js";
import { applyNamedFragmentTool } from "./apply-named-fragment.js";
import { applyInlineFragmentTool } from "./apply-inline-fragment.js";
import { setFieldDirectiveTool } from "./set-field-directive.js";
import { setOperationDirectiveTool } from "./set-operation-directive.js";
import { validateQueryTool } from "./validate-query.js";
import { getInputObjectHelpTool } from "./get-input-object-help.js";
import { setInputObjectArgumentTool } from "./set-input-object-argument.js";
import { analyzeQueryComplexity } from './shared-utils.js';
import { z } from 'zod';

// Add query complexity analysis tool
const analyzeQueryComplexityTool = {
    name: 'analyze-query-complexity',
    description: 'Analyze the complexity, depth, and performance characteristics of the current query structure',
    schema: {
        sessionId: z.string().describe('The session ID of the query to analyze')
    },
    handler: async ({ sessionId }: { sessionId: string }) => {
        try {
            const { loadQueryState } = await import('./shared-utils.js');

            const queryState = await loadQueryState(sessionId);
            if (!queryState) {
                return {
                    content: [{
                        type: 'text',
                        text: JSON.stringify({
                            error: 'Session not found.'
                        })
                    }]
                };
            }

            const analysis = analyzeQueryComplexity(
                queryState.queryStructure,
                queryState.operationType
            );

            return {
                content: [{
                    type: 'text',
                    text: JSON.stringify({
                        success: true,
                        analysis: {
                            valid: analysis.valid,
                            depth: analysis.depth,
                            fieldCount: analysis.fieldCount,
                            complexityScore: Math.round(analysis.complexityScore * 100) / 100,
                            maxDepth: 8, // MAX_QUERY_COMPLEXITY.DEPTH
                            maxFieldCount: 100, // MAX_QUERY_COMPLEXITY.FIELD_COUNT
                            maxComplexityScore: 1000, // MAX_QUERY_COMPLEXITY.TOTAL_COMPLEXITY_SCORE
                            errors: analysis.errors,
                            warnings: analysis.warnings,
                            recommendations: analysis.complexityScore > 700 ?
                                ['Consider reducing query depth', 'Limit the number of fields requested', 'Use pagination for large result sets'] :
                                analysis.depth > 6 ?
                                    ['Consider reducing query nesting depth'] :
                                    []
                        }
                    })
                }]
            };
        } catch (error) {
            return {
                content: [{
                    type: 'text',
                    text: JSON.stringify({
                        error: error instanceof Error ? error.message : String(error)
                    })
                }]
            };
        }
    }
};

/**
 * Complete tool catalog for GraphQL query building
 * All tools organized by category for easy access
 */
export const TOOL_CATALOG = {
    // Schema Introspection Tools (5 tools)
    schema: {
        introspectSchema: introspectSchemaTool,
        getRootOperationTypes: getRootOperationTypesTool,
        getTypeInfo: getTypeInfoTool,
        getFieldInfo: getFieldInfoTool,
        getInputObjectHelp: getInputObjectHelpTool,
    },

    // Session Management Tools (4 tools)
    session: {
        startQuerySession: startQuerySessionTool,
        endQuerySession: endQuerySessionTool,
        getCurrentQuery: getCurrentQueryTool,
        getSelections: getSelectionsTool,
    },

    // Field Selection Tools (2 tools)
    fields: {
        selectField: selectFieldTool,
        selectMultipleFields: selectMultipleFieldsTool,
    },

    // Variable Management Tools (3 tools)
    variables: {
        setQueryVariable: setQueryVariableTool,
        setVariableValue: setVariableValueTool,
        removeQueryVariable: removeQueryVariableTool,
    },

    // Argument Tools (4 tools)
    arguments: {
        setStringArgument: setStringArgumentTool,
        setTypedArgument: setTypedArgumentTool,
        setInputObjectArgument: setInputObjectArgumentTool,
        setVariableArgument: setVariableArgumentTool,
    },

    // Fragment Tools (3 tools)
    fragments: {
        defineNamedFragment: defineNamedFragmentTool,
        applyNamedFragment: applyNamedFragmentTool,
        applyInlineFragment: applyInlineFragmentTool,
    },

    // Directive Tools (2 tools)
    directives: {
        setFieldDirective: setFieldDirectiveTool,
        setOperationDirective: setOperationDirectiveTool,
    },

    // Validation and Execution Tools (3 tools)
    validation: {
        validateQuery: validateQueryTool,
        executeQuery: executeQueryTool,
        analyzeQueryComplexity: analyzeQueryComplexityTool,
    },
} as const;

/**
 * Get all tools as a flat array
 */
export function getAllTools() {
    return Object.values(TOOL_CATALOG).flatMap(category => Object.values(category));
}

/**
 * Get tools by category
 */
export function getToolsByCategory(category: keyof typeof TOOL_CATALOG) {
    return TOOL_CATALOG[category];
}

/**
 * Find tool by name
 */
export function getToolByName(name: string) {
    return getAllTools().find(tool => tool.name === name);
} 