# Visualization Flow

## 2025-12-13 Updates

- Serverless fetch: Added JSON endpoints (`get-trace`, `list-latest-trace`, `list-output-files`) to reliably load traces and recent outputs without HTML parsing.
- Output paths: Normalized saves to `converter-app/tests/output` for `converted-*.json` and `trace-*.json`; persist repo-relative `lastTracePath`.
- GraphView UX: Implemented a "Latest Files" panel, clickable recent traces, and active-step focus (center + zoom) with fallback nodes when diagram edges are absent.
- Diagram hosting: Moved dependency-cruiser Mermaid to `converter-app/public/DEPENDENCY-CRUISER_DIAGRAM.md` for stable loading.
- Trace instrumentation: Enriched `Converter` with `onEnter/onExit` around key steps (fetch-classic, detect-template, validate-webmaps, convert-story, transfer-media, save-outputs) and fixed lint-safe catch blocks.
- Mermaid parser: Added a feature flag to toggle between a Mermaid-backed parser and the existing regex parser. When enabled, we initialize Mermaid in the browser, render the diagram to SVG, and extract node IDs and edge pairs from the SVG DOM. Results are cached in-memory and the parser choice is persisted via localStorage.

## Runtime Visualization Flow (Cytoscape + Trace)

This TODO list tracks the work to build a runtime visualization powered by Cytoscape.js and a step-by-step trace captured during conversion. We will update this file as we progress.

## Goals

- Visualize dependency graph (from `DEPENDENCY-CRUISER_DIAGRAM.md`) with Cytoscape.js
- Record runtime trace JSON via `makeStep()` wrappers
- Drive graph highlighting from the trace (play/pause/next/prev)
- Show per-step input/output in a side panel

## Milestones

### 1) Trace Foundation

- [ ] Add `src/trace/TraceRecorder.ts` (singleton): `startSession(itemId)`, `onEnter`, `onExit`, `endSession()`, `export()`
- [ ] Add `src/trace/makeStep.ts`:
  - `makeStep({ id, type, description, run })` → wraps `run(ctx)` to emit `onEnter/onExit`
  - Ensure timestamps + optional meta (e.g., module, cost)
- [ ] Define event schema: `{ ts, event: 'enter'|'exit', stepId, type, input?, output?, meta? }`
- [ ] Add trace session metadata: `{ sessionId, itemId, startedAt, endedAt }`

### 2) Instrumentation (Minimal Pass)

- [ ] Wrap in `converter-app/src/components/Converter.tsx`:
  - `fetchUserInfo`, `fetchClassicItemData`, `detectClassicTemplate`, `fetchClassicWebmap`, `validateWebmaps`
  - `convertStory`, `transferImages`, `saveDraft`, `updateKeywords`
- [ ] Emit summary `enter/exit` in converter entry points:
  - `MapJournalConverter.convert`, `SwipeConverter.convert`, `MapTourConverter.convert`
  - `MapSeriesConverter.convertSeries`
- [x] After run, save trace JSON:
  - Dev: POST `/.netlify/functions/save-converted` → `test/output/tmp_results/<single|map-series>/<classicId-MM-ddTHH-MM>/trace.json`
  - Implemented: ends session and saves trace alongside `draft.json` in dev

### 3) Graph View (Cytoscape.js)

- [ ] Create `src/components/GraphView.tsx`:
  - Load Mermaid from `DEPENDENCY-CRUISER_DIAGRAM.md`
  - Parse nodes/edges → Cytoscape elements
    - Implemented: two parser paths
      - Mermaid-backed: `mermaid.render()` to SVG + DOM scraping (ids/labels/edges)
      - Regex-backed: supports nodes `id[Label]`, edges `a --> b`, labeled edges `a -- text --> b`, and subgraph grouping (`subgraph ... end` → group node + member edges)
    - Normalize node ids to kebab-case for consistent `stepId` mapping
    - Cache: per-diagram cache avoids repeated Mermaid renders; parser choice stored in localStorage (`graphview.parser`)
  - Load trace JSON; maintain `currentStepIndex`
  - Highlight active node/edge; fade others
  - Side panel: show `input` / `output` for active step
- [ ] Controls:
  - [x] play/pause
  - [x] next/prev
  - [ ] jump-to-step
- [ ] Node mapping strategy:
  - Keep a dictionary from `stepId` → graph node id
  - Prefer kebab-case names aligned with module/function identifiers
  - Implemented: `toKebab()` normalizes ids; edges/nodes emit labels

### 4) Dev Wiring & UX

- [x] Add dev-only control to open GraphView with latest trace
  - Implemented: a button in `Converter.tsx` appears only when a trace is available (in-memory or `lastTracePath`)
  - Opens dedicated page `/graphview.html` which loads latest trace (localStorage or serverless endpoint)
  - Serverless: `/.netlify/functions/list-latest-trace` returns newest `test/output/tmp_results/.../trace.json`
- [ ] Graceful error states (missing diagram, empty trace, unmapped steps)
- [x] Persist trace alongside draft.json in a timestamped folder
  - Folder: `test/output/tmp_results/<single|map-series>/<classicId-MM-ddTHH-MM>/`
  - Files: `draft.json`, `trace.json`, and Map Series `entries/entry-<n>.json`

### 5) Enhancements (Optional)

- [ ] Record durations between enter/exit; visualize as edge thickness or node size
- [ ] Filter steps by type (`fetch`, `convert`, `transfer`, `update`)
- [ ] Attach quick links from nodes to source files
- [ ] Export annotated screenshots for docs

## Pages

- [x] Dedicated page for GraphView
  - Files: `converter-app/graphview.html`, `src/pages/graphview.tsx`, `src/pages/GraphViewPage.tsx`
  - Behavior: loads last saved trace from localStorage `lastTracePath` or via `list-latest-trace`, renders GraphView

## Dev Save Output

- Base folder: `test/output/tmp_results/<single|map-series>/<classicId-MM-ddTHH-MM>/`
- Files saved: `draft.json`, `trace.json`, and for Map Series `entries/entry-<n>.json`, `collection-draft.json`
- After saving `trace.json`, path is persisted to `localStorage.lastTracePath` for quick reload

## Conventions

- Step IDs: kebab-case aligned with functional unit (e.g., `fetch-classic-data`)
- Types: `fetch`, `convert`, `transfer`, `update`, `diagnostic`
- Keep trace payload small; avoid storing large blobs (truncate strings; elide binary)

## References

- Dependency graph source: `DEPENDENCY-CRUISER_DIAGRAM.md`
- Cytoscape.js: <https://js.cytoscape.org/>

---

Maintenance: This file is a live checklist. We will update status boxes and add notes as work progresses.
