# Entity Network Graph Visualization — Roadmap

Replace the text-based entity/relationship display with an interactive force-directed graph using `react-force-graph-2d`.

## Phases

- [x] **Phase 1: Base component** — Install `react-force-graph-2d`, create `EntityGraph` component that transforms `RelationshipWithEntities[]` into nodes + links
- [x] **Phase 2: Node styling** — Color-code nodes by entity type (corporation=blue, agency=purple, etc.), size by connection count, show name labels
- [x] **Phase 3: Edge styling** — Directional arrows, color by relationship type, ownership % as edge label
- [x] **Phase 4: EntityPage integration** — Replace text-based ownership tree and relationships list with the graph component
- [x] **Phase 5: Interactions** — Click node to navigate to entity page, hover tooltips with entity/relationship details
- [x] **Phase 6: Full-page graph explorer** — New `/admin/graph` route showing entire network with filters (entity type, relationship type, search)
- [x] **Phase 7: Controls + legend** — Zoom/pan/fit buttons, color legend for entity types
