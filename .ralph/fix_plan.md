# Ralph Fix Plan

## High Priority
(all complete)

## Medium Priority
- [x] Implement CLI tool (z10 branch, z10 diff, z10 sync)
- [ ] Add Z10 runtime (template instantiation, faker data, mode switching)
- [ ] Add configuration management
- [ ] Create user documentation

## Low Priority
- [ ] Performance optimization
- [ ] Extended feature set (export_react, visual diff)
- [ ] Integration with external services
- [ ] Advanced error recovery

## Completed
- [x] Project initialization
- [x] Set up basic project structure and build system (TypeScript + Vitest)
- [x] Define core data structures and types (Z10Document, Z10Node, Z10Command, etc.)
- [x] Implement core business logic (Document model + 12 command executors)
- [x] Create test framework and initial tests (106 tests across 5 files, all passing)
- [x] Add error handling and validation (deterministic error codes per PRD spec)
- [x] Implement .z10.html file parser (17 tests)
- [x] Implement .z10.html file serializer (13 tests)
- [x] Fixed type error in batch command executor (CommandResult union narrowing)
- [x] Implement MCP server with read tools (7 tools, 27 tests)
- [x] Implement MCP server write tools (12 tools via command executor)
- [x] MCP HTTP server with Streamable HTTP transport on port 29910
- [x] Implement CLI tool entry point (z10 serve, z10 new, z10 info)
- [x] Implement CLI Git commands (z10 branch, z10 diff, z10 merge, z10 sync) with semantic node-level diffing

## Notes
- Focus on MVP functionality first
- Ensure each feature is properly tested
- Update this file after each major milestone
- Next: z10 branch/diff/sync CLI commands, Z10 runtime, documentation
