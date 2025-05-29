# Contributing to QueryArtisan

Thank you for your interest in contributing to QueryArtisan! We welcome contributions from the community and are grateful for any help you can provide.

## Table of Contents

- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Making Changes](#making-changes)
- [Testing](#testing)
- [Submitting Changes](#submitting-changes)
- [Code Style Guidelines](#code-style-guidelines)
- [Reporting Issues](#reporting-issues)
- [Feature Requests](#feature-requests)
- [Community Guidelines](#community-guidelines)

## Getting Started

### Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js** (v18 or higher)
- **pnpm** (recommended) or **npm**
- **Redis** (required for session management - see [Upstash](https://upstash.com/) for serverless option)
- **Git**

### Fork and Clone

1. Fork the repository on GitHub
2. Clone your fork locally:
   ```bash
   git clone https://github.com/flinstonedev/queryartisan.git
   cd queryartisan
   ```

## Development Setup

1. **Install dependencies:**
   ```bash
   pnpm install
   ```

2. **Set up environment variables:**
   ```bash
   cp example.env .env
   # Edit .env with your configuration
   # Required: REDIS_URL and DEFAULT_GRAPHQL_ENDPOINT (Pokemon API demo: https://graphql-pokeapi.vercel.app/)
   ```

3. **Start Redis** (required for session management):
   ```bash
   # Using Upstash (recommended for production)
   # Get Redis URL from https://upstash.com/
   
   # On macOS with Homebrew
   brew services start redis
   
   # On Ubuntu/Debian
   sudo systemctl start redis-server
   
   # Using Docker
   docker run -d -p 6379:6379 redis:alpine
   ```

4. **Run the development server:**
   ```bash
   vercel dev
   # Your MCP server is available at http://localhost:3000/mcp
   ```

5. **Verify everything works:**
   ```bash
   pnpm test
   ```

## Making Changes

### Branch Naming

Create a descriptive branch name:
- `feature/add-new-tool` - for new features
- `fix/rate-limit-bug` - for bug fixes
- `docs/update-readme` - for documentation
- `refactor/optimize-query-parsing` - for refactoring

### Commit Messages

Use clear, descriptive commit messages:
```
feat: add query complexity analysis tool
fix: resolve schema validation error in set-typed-argument
docs: update API documentation for new tools
test: add integration tests for rate limiting
```

### Code Organization

- **Tools**: Add new GraphQL tools in `/tools/`
- **Tests**: Add corresponding tests in `/tests/`
- **API**: API-related code in `/api/`
- **Documentation**: Update relevant docs in `/docs/` or README

## Testing

### Running Tests

```bash
# Run all tests
pnpm test

# Run tests in watch mode
pnpm run test:watch

# Run specific test file
pnpm test -- set-typed-argument.test.ts

# Run tests with coverage
pnpm run test:coverage
```

### Test Requirements

- **Unit tests**: Required for new tools and utilities
- **Integration tests**: Required for API endpoints
- **Edge case testing**: Include error handling and validation tests

### Writing Tests

```typescript
// Example test structure
describe('New Tool', () => {
    beforeEach(() => {
        // Setup test data
    });

    it('should handle valid input correctly', async () => {
        // Test implementation
    });

    it('should handle edge cases', async () => {
        // Test edge cases
    });

    it('should validate input properly', async () => {
        // Test validation
    });
});
```

## Submitting Changes

### Pull Request Process

1. **Update your branch:**
   ```bash
   git checkout main
   git pull upstream main
   git checkout your-feature-branch
   git rebase main
   ```

2. **Run tests:**
   ```bash
   pnpm test
   pnpm run lint
   ```

3. **Push changes:**
   ```bash
   git push origin your-feature-branch
   ```

4. **Create Pull Request:**
   - Use a clear, descriptive title
   - Reference any related issues
   - Include a detailed description of changes
   - Add screenshots for UI changes

### Pull Request Template

```markdown
## Description
Brief description of the changes made.

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Documentation update
- [ ] Refactoring
- [ ] Performance improvement

## Testing
- [ ] Tests pass locally
- [ ] Added tests for new functionality
- [ ] Tested edge cases

## Checklist
- [ ] Code follows project style guidelines
- [ ] Self-review completed
- [ ] Documentation updated
- [ ] No breaking changes (or marked as such)
```

## Code Style Guidelines

### TypeScript/JavaScript

- Use **TypeScript** for all new code
- Follow **ESLint** configuration
- Use **Prettier** for formatting
- Prefer `async/await` over Promises
- Use descriptive variable and function names

### Tool Development

QueryArtisan provides **26 tools** across 7 categories for GraphQL query building:

#### Tool Categories:
- **Schema Intelligence** (5 tools): `introspect-schema`, `get-type-info`, etc.
- **Session Management** (4 tools): `start-query-session`, `end-query-session`, etc.
- **Field Selection** (3 tools): `select-field`, `select-multiple-fields`, etc.
- **Variable Management** (3 tools): `set-query-variable`, `remove-query-variable`, etc.
- **Argument Handling** (4 tools): `set-typed-argument`, `set-input-object-argument`, etc.
- **Fragment Support** (3 tools): `define-named-fragment`, `apply-named-fragment`, etc.
- **Directive Support** (2 tools): `set-field-directive`, `set-operation-directive`
- **Validation & Execution** (2 tools): `validate-query`, `execute-query`

```typescript
// Tool structure template
export const myNewTool = {
    name: 'my-new-tool',
    description: 'Clear description of what this tool does',
    schema: {
        param1: z.string().describe('Description of parameter'),
        param2: z.number().optional().describe('Optional parameter'),
    },
    handler: async ({ param1, param2 }: MyToolParams) => {
        // Implementation
        return {
            content: [{
                type: 'text',
                text: JSON.stringify(result)
            }]
        };
    }
};
```

### Error Handling

```typescript
// Always include proper error handling
try {
    // Operation
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
```

## Reporting Issues

### Bug Reports

Use the bug report template and include:

- **Clear description** of the issue
- **Steps to reproduce** the problem
- **Expected vs actual behavior**
- **Environment details** (Node.js version, OS, etc.)
- **Error messages** or logs
- **Minimal code example** if applicable


## Feature Requests

When requesting new features:

- **Check existing issues** first
- **Describe the problem** you're trying to solve
- **Explain your proposed solution**
- **Consider alternatives** you've thought about
- **Provide use cases** and examples

## Community Guidelines

### Code of Conduct

We are committed to providing a welcoming and inclusive environment. Please:

- **Be respectful** and considerate
- **Be patient** with newcomers
- **Give constructive feedback**
- **Focus on collaboration**

### Getting Help

- **Documentation**: Check README and docs first
- **Issues**: Search existing issues
- **Discussions**: Use GitHub Discussions for questions
- **Community**: Join our community channels

## Development Tips

### Debugging

```bash
# Debug with verbose logging
DEBUG=* vercel dev

# Test specific functionality
pnpm run test:debug -- --grep "your test"
```

### Performance

- **Profile** your changes with realistic data
- **Consider session management** implications with Redis
- **Test with large schemas** when relevant
- **Monitor Redis memory usage** for session storage

### Documentation

- Update **README.md** for user-facing changes
- Add **JSDoc comments** for complex functions
- Update **API documentation** as needed

## Recognition

Contributors will be recognized:

- In the **CONTRIBUTORS.md** file
- In **release notes** for significant contributions
- Through **GitHub's contributor graph**

---

Thank you for contributing to QueryArtisan! Your efforts help make GraphQL development more accessible and powerful for everyone.

For questions about contributing, feel free to open an issue or reach out to the maintainers. 