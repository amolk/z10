# Agent Build Instructions

## Project Setup
```bash
npm install
```

## Running Tests
```bash
npm test              # run all tests
npm run test:watch    # run tests in watch mode
npm run test:coverage # run with coverage report
```

## Build Commands
```bash
npm run build   # compile TypeScript to dist/
npm run lint    # type-check without emitting
npm run clean   # remove dist/
```

## Architecture

Zero-10 is a design tool built on annotated web standards. The `.z10.html` file format uses `data-z10-*` attributes over standard HTML/CSS. The core engine operates directly on DOM (via happy-dom on server/CLI, browser DOM on web UI).

### Source Structure
```
src/
├── dom/                          # Core collaborative DOM engine
│   ├── clock.ts                  # Lamport logical clock
│   ├── timestamps.ts             # data-z10-ts-* attribute system + bubble
│   ├── bootstrap.ts              # Document bootstrapping (assign IDs + timestamps)
│   ├── sandbox.ts                # Sandboxed code execution (node:vm)
│   ├── transaction.ts            # Transaction engine (execute → validate → commit)
│   ├── validator.ts              # Per-facet conflict detection + TimestampManifest
│   ├── write-set.ts              # MutationRecord → write set builder
│   ├── illegal-mod-check.ts      # Reject changes to data-z10-id / data-z10-ts-*
│   ├── proxy.ts                  # LocalProxy: ticket-based reads + submitCode
│   ├── reconcile-children.ts     # Efficient child list reconciliation
│   ├── patch-serialize.ts        # MutationRecords → PatchOp[] serialization
│   ├── patch-replay.ts           # PatchOp[] → DOM replay (server, CLI, browser)
│   ├── ring-buffer.ts            # In-memory patch history
│   ├── style-utils.ts            # Style string parse/diff utilities
│   ├── strip.ts                  # Strip z10 metadata for agent/export views
│   └── subtree-lock.ts           # Subtree-level locking
├── cli/                          # CLI agent interface
│   ├── exec.ts                   # z10 exec — single-block JS execution
│   ├── dom.ts                    # z10 dom — DOM tree display
│   ├── commands.ts               # login, project/page load, components, tokens
│   ├── project-connection.ts     # Server sync + patch subscription
│   ├── session.ts                # CLI session state management
│   ├── api.ts                    # HTTP client for z10 server
│   └── patch-stream.ts           # SSE patch subscription
├── core/                         # Legacy (being replaced by src/dom/)
│   ├── types.ts                  # Z10Document, Z10Node, Z10Command types
│   ├── document.ts               # Old document model (Map-based)
│   └── commands.ts               # Old command executor (12 primitives)
└── index.ts                      # Package entry point
```

### Core Concepts
- **Transaction Engine**: Atomic code execution — clone subtree → sandbox execute → validate → commit or reject
- **Sandbox**: Agent code runs in a scoped `document` proxy (node:vm). No access to live DOM, network, or globals
- **Read Tickets**: `getSubtree()` returns HTML + ticketId with a timestamp manifest. `submitCode(code, ticketId)` validates changes against the manifest for conflict detection
- **Conflict Detection**: Per-facet timestamp comparison (structural, children, text, attribute, style-property). Concurrent edits to different facets of the same node don't conflict
- **Patch Broadcast**: Committed changes serialized as PatchOp[] and broadcast to all connected clients
- **Governance**: Three levels — full-edit, propose-approve, scoped-edit

### Technology
- TypeScript 5.7+ with strict mode
- ES2022 modules (NodeNext resolution)
- Vitest for testing
- No runtime dependencies (zero deps)

## Key Learnings
- tsconfig uses NodeNext module resolution (linter auto-corrected from ES2022/bundler)
- All imports use .js extension (required for NodeNext)
- Tests run in ~190ms for 49 tests — very fast feedback loop

## Feature Development Quality Standards

**CRITICAL**: All new features MUST meet the following mandatory requirements before being considered complete.

### Testing Requirements

- **Minimum Coverage**: 85% code coverage ratio required for all new code
- **Test Pass Rate**: 100% - all tests must pass, no exceptions
- **Test Types Required**:
  - Unit tests for all business logic and services
  - Integration tests for API endpoints or main functionality
  - End-to-end tests for critical user workflows
- **Coverage Validation**: Run coverage reports before marking features complete:
  ```bash
  # Examples by language/framework
  npm run test:coverage
  pytest --cov=src tests/ --cov-report=term-missing
  cargo tarpaulin --out Html
  ```
- **Test Quality**: Tests must validate behavior, not just achieve coverage metrics
- **Test Documentation**: Complex test scenarios must include comments explaining the test strategy

### Git Workflow Requirements

Before moving to the next feature, ALL changes must be:

1. **Committed with Clear Messages**:
   ```bash
   git add .
   git commit -m "feat(module): descriptive message following conventional commits"
   ```
   - Use conventional commit format: `feat:`, `fix:`, `docs:`, `test:`, `refactor:`, etc.
   - Include scope when applicable: `feat(api):`, `fix(ui):`, `test(auth):`
   - Write descriptive messages that explain WHAT changed and WHY

2. **Pushed to Remote Repository**:
   ```bash
   git push origin <branch-name>
   ```
   - Never leave completed features uncommitted
   - Push regularly to maintain backup and enable collaboration
   - Ensure CI/CD pipelines pass before considering feature complete

3. **Branch Hygiene**:
   - Work on feature branches, never directly on `main`
   - Branch naming convention: `feature/<feature-name>`, `fix/<issue-name>`, `docs/<doc-update>`
   - Create pull requests for all significant changes

4. **Ralph Integration**:
   - Update .ralph/fix_plan.md with new tasks before starting work
   - Mark items complete in .ralph/fix_plan.md upon completion
   - Update .ralph/PROMPT.md if development patterns change
   - Test features work within Ralph's autonomous loop

### Documentation Requirements

**ALL implementation documentation MUST remain synchronized with the codebase**:

1. **Code Documentation**:
   - Language-appropriate documentation (JSDoc, docstrings, etc.)
   - Update inline comments when implementation changes
   - Remove outdated comments immediately

2. **Implementation Documentation**:
   - Update relevant sections in this AGENT.md file
   - Keep build and test commands current
   - Update configuration examples when defaults change
   - Document breaking changes prominently

3. **README Updates**:
   - Keep feature lists current
   - Update setup instructions when dependencies change
   - Maintain accurate command examples
   - Update version compatibility information

4. **AGENT.md Maintenance**:
   - Add new build patterns to relevant sections
   - Update "Key Learnings" with new insights
   - Keep command examples accurate and tested
   - Document new testing patterns or quality gates

### Feature Completion Checklist

Before marking ANY feature as complete, verify:

- [ ] All tests pass with appropriate framework command
- [ ] Code coverage meets 85% minimum threshold
- [ ] Coverage report reviewed for meaningful test quality
- [ ] Code formatted according to project standards
- [ ] Type checking passes (if applicable)
- [ ] All changes committed with conventional commit messages
- [ ] All commits pushed to remote repository
- [ ] .ralph/fix_plan.md task marked as complete
- [ ] Implementation documentation updated
- [ ] Inline code comments updated or added
- [ ] .ralph/AGENT.md updated (if new patterns introduced)
- [ ] Breaking changes documented
- [ ] Features tested within Ralph loop (if applicable)
- [ ] CI/CD pipeline passes

### Rationale

These standards ensure:
- **Quality**: High test coverage and pass rates prevent regressions
- **Traceability**: Git commits and .ralph/fix_plan.md provide clear history of changes
- **Maintainability**: Current documentation reduces onboarding time and prevents knowledge loss
- **Collaboration**: Pushed changes enable team visibility and code review
- **Reliability**: Consistent quality gates maintain production stability
- **Automation**: Ralph integration ensures continuous development practices

**Enforcement**: AI agents should automatically apply these standards to all feature development tasks without requiring explicit instruction for each task.
