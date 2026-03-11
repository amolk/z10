# Ralph Fix Plan

## High Priority
- [ ] Implement .z10.html file parser (read format from disk)
- [ ] Implement .z10.html file serializer (write format to disk)
- [ ] Implement MCP server with read tools (get_project_summary, get_node_info, get_tree, etc.)
- [ ] Implement MCP server write tools (the 12 z10 commands via MCP)

## Medium Priority
- [ ] Implement CLI tool (z10 branch, z10 diff, z10 sync)
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
- [x] Create test framework and initial tests (49 tests, all passing)
- [x] Add error handling and validation (deterministic error codes per PRD spec)

## Notes
- Focus on MVP functionality first
- Ensure each feature is properly tested
- Update this file after each major milestone
