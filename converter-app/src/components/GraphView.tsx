import { useEffect, useRef, useState } from 'react';
// Mermaid is browser-focused; we'll import it dynamically when available
import cytoscape, { Core } from 'cytoscape';
import dagre from 'cytoscape-dagre';
import fcose from 'cytoscape-fcose';
import panzoom from 'cytoscape-panzoom';
import cyNavigator from 'cytoscape-navigator';
import contextMenus from 'cytoscape-context-menus';
import undoRedo from 'cytoscape-undo-redo';
cytoscape.use(dagre);
cytoscape.use(fcose);
cytoscape.use(panzoom);
cytoscape.use(cyNavigator);
cytoscape.use(contextMenus as unknown as (cy: typeof cytoscape) => void);
cytoscape.use(undoRedo);
import './GraphView.css';
import 'cytoscape-context-menus/cytoscape-context-menus.css';

// Minimal props: path to markdown with mermaid diagram and a trace json
export default function GraphView(props: { diagramMarkdown?: string; trace?: { sessionId?: string; events?: Array<{ stepId: string; event: 'enter'|'exit'; ts: number }> } }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [cy, setCy] = useState<Core | null>(null);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  type CyNode = { id: string; label: string };
  type CyEdge = { id: string; source: string; target: string };
  type CyElement = { data: CyNode | CyEdge };
  const [elements, setElements] = useState<Array<CyElement>>([]);
  const mermaidCacheRef = useRef<Map<string, { nodes: Array<CyElement>; edges: Array<CyElement> }>>(new Map());
  const [useMermaidParser, setUseMermaidParser] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    const v = window.localStorage.getItem('graphview.parser');
    return v === 'mermaid';
  });
  type MermaidApi = {
    initialize: (cfg: { startOnLoad?: boolean; securityLevel?: string }) => void;
    parse: (txt: string) => Promise<unknown> | unknown;
    render: (id: string, txt: string) => Promise<{ svg: string } | string> | { svg: string } | string;
  };
  const mermaidRef = useRef<MermaidApi | null>(null);
  const [playing, setPlaying] = useState(false);
  const playTimerRef = useRef<number | null>(null);
  const [layoutName, setLayoutName] = useState<string>('cose');
  type CyContextMenusInstance = { destroy?: () => void };
  type CyContextMenuEvent = { target: cytoscape.Collection };
  const navigatorRef = useRef<ReturnType<Core['navigator']> | null>(null);
  const contextMenusRef = useRef<CyContextMenusInstance | null>(null);
  const undoRedoRef = useRef<ReturnType<Core['undoRedo']> | null>(null);
  const [showGroupBoundaries, setShowGroupBoundaries] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    const v = window.localStorage.getItem('graphview.showGroupBoundaries');
    return v ? v === 'true' : true;
  });
  const [collapseGroups, setCollapseGroups] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    const v = window.localStorage.getItem('graphview.collapseGroups');
    return v ? v === 'true' : false;
  });
  const [colorParents, setColorParents] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    const v = window.localStorage.getItem('graphview.colorParents');
    return v ? v === 'true' : false;
  });

  useEffect(() => {
    try { if (typeof window !== 'undefined') window.localStorage.setItem('graphview.showGroupBoundaries', String(showGroupBoundaries)); } catch { /* noop */ }
  }, [showGroupBoundaries]);
  useEffect(() => {
    try { if (typeof window !== 'undefined') window.localStorage.setItem('graphview.collapseGroups', String(collapseGroups)); } catch { /* noop */ }
  }, [collapseGroups]);
  useEffect(() => {
    try { if (typeof window !== 'undefined') window.localStorage.setItem('graphview.colorParents', String(colorParents)); } catch { /* noop */ }
  }, [colorParents]);

  const toKebab = (s: string) => s
    .trim()
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();

  const measureNodeSize = (label: string) => {
    const len = Math.max(1, (label || '').length);
    const w = Math.max(90, Math.min(360, len * 8 + 28));
    const h = 36;
    return { w, h };
  };

  const fmtTs = (ts: number | undefined) => {
    if (!ts || Number.isNaN(ts)) return '';
    const d = new Date(ts);
    const pad = (n: number) => String(n).padStart(2, '0');
    const yyyy = d.getFullYear();
    const mm = pad(d.getMonth() + 1);
    const dd = pad(d.getDate());
    const hh = pad(d.getHours());
    const min = pad(d.getMinutes());
    const sec = pad(d.getSeconds());
    // timezone offset in minutes; convert to +/-HH:MM
    const offMin = -d.getTimezoneOffset();
    const sign = offMin >= 0 ? '+' : '-';
    const absMin = Math.abs(offMin);
    const offH = pad(Math.floor(absMin / 60));
    const offM = pad(absMin % 60);
    return `${yyyy}-${mm}-${dd}T${hh}:${min}:${sec}${sign}${offH}:${offM}`;
  };

  // Fetch and parse Mermaid diagram to Cytoscape elements (supports subgraph blocks and edge labels)
  useEffect(() => {
    const path = props.diagramMarkdown || '/DEPENDENCY-CRUISER_DIAGRAM.md';
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(path);
        if (!res.ok) return;
        const md = await res.text();
        // Extract first mermaid code block
        const m = /```mermaid[\s\S]*?```/i.exec(md);
        const block = m ? m[0].replace(/```mermaid/i, '').replace(/```/i, '') : '';
        const cacheKey = block || '';

        // Attempt Mermaid-backed parsing when enabled and available
        if (useMermaidParser && typeof window !== 'undefined') {
          // Load from cache if present
          const cached = mermaidCacheRef.current.get(cacheKey);
          if (cached && !cancelled) {
            setElements([...(cached.nodes), ...(cached.edges)]);
            return;
          }
          try {
            if (!mermaidRef.current) {
              const mmod = await import('mermaid');
              mermaidRef.current = ((mmod as unknown as { default?: MermaidApi }).default) || (mmod as unknown as MermaidApi);
              // Initialize Mermaid
              try { mermaidRef.current.initialize({ startOnLoad: false, securityLevel: 'loose' }); } catch { /* noop */ }
            }
            // Validate syntax (parse throws on invalid diagrams)
            try { await mermaidRef.current.parse(block); } catch { /* ignore; render often still gives clues */ }
            // Render to SVG and extract nodes/edges
            const renderOut = await mermaidRef.current.render(`graph_${Date.now()}`, block);
            const svgText: string = (renderOut && (renderOut as { svg?: string }).svg) ? (renderOut as { svg: string }).svg : String(renderOut);
            const { nodes: mNodes, edges: mEdges } = extractElementsFromMermaidSVG(svgText, measureNodeSize);
            // Cache and set
            mermaidCacheRef.current.set(cacheKey, { nodes: mNodes, edges: mEdges });
            if (!cancelled) setElements([...(mNodes), ...(mEdges)]);
            return;
          } catch {
            // Fall through to regex parser
          }
        }
        // Normalize and parse subgraph blocks; collect nodes inside subgraphs and connect to a group node
        const rawLines = block.split('\n');
        const lines: string[] = [];
        let inSubgraph = false;
        let currentSubgraphId = '';
        const subgraphMembers: Record<string, string[]> = {};
        for (const raw of rawLines) {
          const l = String(raw).trim();
          if (!l) continue;
          const sgStart = /^subgraph\s+(.+)$/i.exec(l);
          if (sgStart) { inSubgraph = true; currentSubgraphId = toKebab(sgStart[1]); if (!subgraphMembers[currentSubgraphId]) subgraphMembers[currentSubgraphId] = []; continue; }
          if (/^end\b/i.test(l)) { inSubgraph = false; currentSubgraphId = ''; continue; }
          if (inSubgraph) {
            // collect potential node ids inside subgraph (simple token before '[' or before edge arrow)
            const nodeMatch = /^([A-Za-z0-9_\-.]+)\s*\[/.exec(l);
            const edgeMatch = /^([A-Za-z0-9_\-.]+)\s*--/.exec(l);
            const idToken = nodeMatch?.[1] || edgeMatch?.[1];
            if (idToken) subgraphMembers[currentSubgraphId].push(toKebab(idToken));
            // still push line for normal parsing
          }
          lines.push(l);
        }
        const nodes: Record<string, { id: string; label: string }> = {};
        const edges: Array<{ id: string; source: string; target: string; label?: string }> = [];
        // Supports: a --> b  |  a -- text --> b
        const edgeRegex = /^([A-Za-z0-9_\-.]+)\s*--(?:\s*([^>-][^>]*)\s*)?>\s*([A-Za-z0-9_\-.]+).*$/;
        const nodeRegex = /^([A-Za-z0-9_\-.]+)\s*\["?([^\]]+)"?\]$/;
        for (const line of lines) {
          if (/^graph\s+/i.test(line)) continue; // header
          // node like: id["Label"] or id[Label]
          const nm = nodeRegex.exec(line);
          if (nm) {
            const id = toKebab(nm[1]);
            const label = nm[2].replace(/"/g, '');
            nodes[id] = { id, label };
            continue;
          }
          // edge like: a --> b
          const em = edgeRegex.exec(line);
          if (em) {
            const src = toKebab(em[1]);
            const lbl = (em[2] || '').trim();
            const tgt = toKebab(em[3]);
            const eid = `${src}__${tgt}`;
            edges.push({ id: eid, source: src, target: tgt, label: lbl || undefined });
            // Ensure nodes exist even if not declared
            if (!nodes[src]) nodes[src] = { id: src, label: src };
            if (!nodes[tgt]) nodes[tgt] = { id: tgt, label: tgt };
          }
        }
        // Add subgraph group nodes and convert membership to compound parents
        // This clusters group members together and enables per-group styling.
        const groupColors: Record<string, string> = {};
        const palette = ['#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#84cc16','#fb7185'];
        let colorIdx = 0;
        for (const [sg, members] of Object.entries(subgraphMembers)) {
          if (!members.length) continue;
          const groupId = `group-${sg}`;
          if (!nodes[groupId]) nodes[groupId] = { id: groupId, label: `Group: ${sg}` };
          if (!groupColors[groupId]) {
            groupColors[groupId] = palette[colorIdx % palette.length];
            colorIdx++;
          }
          // Assign color to parent node as well
          (nodes[groupId] as unknown as { color?: string }).color = groupColors[groupId];
          for (const m of members) {
            if (!nodes[m]) nodes[m] = { id: m, label: m };
            // Mark member as child of compound group
            // We'll emit parent relationship when building Cytoscape elements.
            (nodes[m] as unknown as { parent?: string }).parent = groupId;
          }
        }
        const els: Array<CyElement> = [];
        for (const n of Object.values(nodes)) {
          const { w, h } = measureNodeSize(n.label);
          const parent = (n as unknown as { parent?: string }).parent;
          const groupColor = parent ? (groupColors[parent] || '#4c8bf5') : undefined;
          const parentColor = (n as unknown as { color?: string }).color;
          els.push({ data: { id: n.id, label: n.label, w, h, parent, color: groupColor, parentColor } });
        }
        for (const e of edges) els.push({ data: { id: e.id, source: e.source, target: e.target, label: e.label } });
        // Cache regex-derived elements for consistency
        const isEdge = (e: CyElement): e is { data: CyEdge } => {
          const d = e.data as Partial<CyEdge>;
          return typeof d.source === 'string' && typeof d.target === 'string';
        };
        const nodesOnly = els.filter(e => !isEdge(e));
        const edgesOnly = els.filter(e => isEdge(e));
        mermaidCacheRef.current.set(cacheKey, { nodes: nodesOnly, edges: edgesOnly });
        if (!cancelled) setElements(els);
      } catch {
        // ignore parse errors
      }
    })();
    return () => { cancelled = true; };
  }, [props.diagramMarkdown, useMermaidParser]);

  // TODO: Replace with real Mermaid parser; for now, create a tiny sample graph
  useEffect(() => {
    if (!containerRef.current) return;
    // If no elements parsed from diagram, create minimal nodes from trace stepIds
    let effectiveElements = elements;
    const traceIds = (props.trace && Array.isArray(props.trace.events))
      ? Array.from(new Set(props.trace.events.map(ev => ev.stepId).filter(Boolean)))
      : [];
    if (!effectiveElements || effectiveElements.length === 0) {
      effectiveElements = traceIds.map(id => {
        const { w, h } = measureNodeSize(id);
        return { data: { id, label: id, w, h } };
      });
    } else if (traceIds.length) {
      // Add missing trace nodes to the existing diagram so step highlights are visible
      const existingIds = new Set<string>();
      for (const el of effectiveElements) {
        const d = (el as unknown as { data?: { id?: string } }).data;
        if (d?.id) existingIds.add(d.id);
      }
      for (const tid of traceIds) {
        if (!existingIds.has(tid)) {
          const { w, h } = measureNodeSize(tid);
          effectiveElements.push({ data: { id: tid, label: tid, w, h } });
        }
      }
    }
    const hasEdges = effectiveElements.some((e) => {
      const d = (e as unknown as { data?: { source?: string; target?: string } }).data;
      return Boolean(d && d.source && d.target);
    });
    const instance = cytoscape({
      container: containerRef.current,
      elements: effectiveElements,
      style: [
        { selector: 'node', style: { 
          'label': 'data(label)', 
          'background-color': 'data(color)', 
          'shape': 'round-rectangle',
          'color': '#ffffff', 
          'text-valign': 'center', 
          'text-halign': 'center',
          'text-outline-width': 1.5,
          'text-outline-color': '#2b2b2b',
          'font-size': '12px',
          'border-width': 1,
          'border-color': '#d8e4ff',
          'width': 'data(w)',
          'height': 'data(h)',
          'text-wrap': 'wrap',
          'text-max-width': 'data(w)',
          'z-index': 1
        } },
        // Compound group (parent) styling (toggle visibility)
        { selector: ':parent', style: showGroupBoundaries ? {
          'background-color': colorParents ? 'data(parentColor)' : '#1f2937',
          'border-color': '#9ca3af',
          'border-width': 2,
          'shape': 'round-rectangle',
          'padding': 12,
          'label': 'data(label)',
          'color': '#e5e7eb',
          'text-outline-width': 0,
          'font-size': '12px',
          'z-index': 2
        } : {
          'background-opacity': 0,
          'border-width': 0,
          'label': '',
          'padding': 0
        } },
        { selector: 'edge', style: { 
          'line-color': '#a8c7ff', 
          'target-arrow-color': '#a8c7ff', 
          'target-arrow-shape': 'triangle', 
          'arrow-scale': 1,
          'label': 'data(label)', 
          'font-size': '11px', 
          'color': '#f0f6ff',
          'text-background-color': '#2b2b2b', 
          'text-background-opacity': 0.5,
          'z-index': 0
        } },
        // No special member edges now; membership is represented via compound parents
        { selector: '.active', style: { 'background-color': '#ff9f50', 'border-color': '#ffd8a8', 'border-width': 2 } },
        { selector: '.dim', style: { 'opacity': 0.55 } },
        { selector: '.collapsed', style: { 'display': 'none' } },
      ],
      layout: { name: hasEdges ? 'cose' : 'concentric' }
    });
    // Enable dragging for interactive adjustments
    try { instance.autoungrabify(false); } catch { /* noop */ }
    // Initialize panzoom controls
    try { instance.panzoom({ zoomFactor: 0.05, minZoom: 0.1, maxZoom: 2.5, fitPadding: 20 }); } catch { /* noop */ }
    // Initialize navigator (minimap)
    try { navigatorRef.current = instance.navigator({ container: undefined }); } catch { /* noop */ }
    // Initialize undo-redo
    try { undoRedoRef.current = instance.undoRedo(); } catch { /* noop */ }
    // Register simple undoable actions for collapsing/expanding group children via context menu
    try {
      if (undoRedoRef.current) {
        undoRedoRef.current.action('collapseChildren', (eles: cytoscape.Collection) => {
          eles.filter(':child').addClass('collapsed');
          return eles;
        }, (eles: cytoscape.Collection) => {
          eles.filter(':child').removeClass('collapsed');
          return eles;
        });
        undoRedoRef.current.action('expandChildren', (eles: cytoscape.Collection) => {
          eles.filter(':child').removeClass('collapsed');
          return eles;
        }, (eles: cytoscape.Collection) => {
          eles.filter(':child').addClass('collapsed');
          return eles;
        });
      }
    } catch { /* noop */ }
    // Initialize context menus
    try {
      contextMenusRef.current = instance.contextMenus({
        menuItems: [
          {
            id: 'fit', content: 'Fit to selection', selector: 'node, :parent', onClickFunction: (event: unknown) => {
              const e = event as CyContextMenuEvent;
              const target = e.target || instance.elements();
              try { instance.fit(target, 30); } catch { /* noop */ }
            }
          },
          {
            id: 'collapse', content: 'Collapse children', selector: ':parent', onClickFunction: (event: unknown) => {
              const parent = (event as CyContextMenuEvent).target;
              try {
                if (undoRedoRef.current) undoRedoRef.current.do('collapseChildren', parent);
                else parent.children().addClass('collapsed');
              } catch { /* noop */ }
            }
          },
          {
            id: 'expand', content: 'Expand children', selector: ':parent', onClickFunction: (event: unknown) => {
              const parent = (event as CyContextMenuEvent).target;
              try {
                if (undoRedoRef.current) undoRedoRef.current.do('expandChildren', parent);
                else parent.children().removeClass('collapsed');
              } catch { /* noop */ }
            }
          },
          {
            id: 'copy-id', content: 'Copy ID', selector: 'node', onClickFunction: (event: unknown) => {
              const id = (event as CyContextMenuEvent).target.id();
              try { window?.navigator?.clipboard?.writeText?.(id); } catch { /* noop */ }
            }
          }
        ],
        // Basic styling config left default; CSS imports handle visuals
      });
    } catch { /* noop */ }
    // Apply collapse if requested
    try {
      if (collapseGroups) {
        instance.nodes(':child').addClass('collapsed');
      }
    } catch { /* noop */ }
    setCy(instance);
    return () => {
      try { contextMenusRef.current?.destroy?.(); } catch { /* noop */ }
      try { navigatorRef.current?.destroy?.(); } catch { /* noop */ }
      try { undoRedoRef.current = null; } catch { /* noop */ }
      instance.destroy();
    };
  }, [elements, props.trace, showGroupBoundaries, collapseGroups, colorParents]);

  // Re-run layout when selection changes or elements update
  useEffect(() => {
    if (!cy) return;
    const hasEdges = cy.edges().length > 0;
    const name = hasEdges ? layoutName : (layoutName === 'breadthfirst' || layoutName === 'dagre' || layoutName === 'fcose' ? 'concentric' : layoutName);
    const common = { fit: true, padding: 20, animate: true, animationDuration: 300 } as Record<string, unknown>;
    const options: Record<string, unknown> = { name, ...common };
    if (name === 'breadthfirst') {
      options.directed = true;
      options.spacingFactor = 1.2;
    } else if (name === 'cose') {
      options.nodeDimensionsIncludeLabels = true;
      options.nodeRepulsion = () => 8000;
      options.idealEdgeLength = () => 120;
      options.edgeElasticity = () => 100;
      options.gravity = 0.5;
      options.nestingFactor = 1.2;
      options.numIter = 1000;
      options.initialTemp = 100;
      options.coolingFactor = 0.95;
      options.minTemp = 1;
    } else if (name === 'fcose') {
      options.nodeDimensionsIncludeLabels = true;
      options.quality = 'default';
      options.randomize = true;
      options.animate = true;
      options.animationDuration = 300;
      options.nodeRepulsion = 450000;
      options.idealEdgeLength = 120;
      options.edgeElasticity = 0.45;
      options.nestingFactor = 0.1;
      options.gravity = 0.25;
    } else if (name === 'dagre') {
      options.rankDir = 'TB';
      options.nodeSep = 50;
      options.edgeSep = 20;
      options.rankSep = 70;
    } else if (name === 'concentric') {
      options.minNodeSpacing = 30;
    }
    try { cy.layout(options).run(); } catch { /* ignore layout errors */ }
  }, [cy, layoutName, elements]);

  // Highlight current step
  useEffect(() => {
    if (!cy || !props.trace || !props.trace.events?.length) return;
    const events = props.trace.events;
    const idx = Math.max(0, Math.min(currentStepIndex, events.length - 1));
    const stepId = events[idx].stepId;
    cy.elements().removeClass('active').removeClass('dim');
    const node = cy.$(`node[id = "${stepId}"]`);
    node.addClass('active');
    cy.elements().not(node).addClass('dim');
    try {
      if (node.nonempty()) {
        cy.center(node);
        const currentZoom = cy.zoom();
        const targetZoom = Math.min(currentZoom, 1.0); // slightly zoomed out for better context
        cy.animate({ zoom: targetZoom, center: { eles: node } }, { duration: 250 });
      }
    } catch { /* ignore focus errors */ }
  }, [cy, props.trace, currentStepIndex]);

  // Playback timer
  useEffect(() => {
    if (!playing) {
      if (playTimerRef.current) { window.clearInterval(playTimerRef.current); playTimerRef.current = null; }
      return;
    }
    if (!props.trace?.events?.length) return;
    playTimerRef.current = window.setInterval(() => {
      setCurrentStepIndex(i => {
        const next = i + 1;
        const max = (props.trace?.events?.length || 1) - 1;
        return next > max ? max : next;
      });
    }, 1000);
    return () => { if (playTimerRef.current) { window.clearInterval(playTimerRef.current); playTimerRef.current = null; } };
  }, [playing, props.trace?.events?.length]);

  return (
    <div className="graphview-root">
      <div ref={containerRef} className="graphview-canvas" />
      <div className="graphview-sidepanel">
        <div className="graphview-fixed-controls">
          <h3>Trace</h3>
          <div>
          <button onClick={() => setCurrentStepIndex(i => Math.max(0, i - 1))}>Prev</button>
          <button onClick={() => setCurrentStepIndex(i => i + 1)}>Next</button>
          <button onClick={() => setPlaying(p => !p)}>{playing ? 'Pause' : 'Play'}</button>
          </div>
          <div className="graphview-layout-controls">
            <strong>Layout:</strong>{' '}
            <button onClick={() => setLayoutName('dagre')}>Dagre</button>{' '}
            <button onClick={() => setLayoutName('breadthfirst')}>Breadthfirst</button>{' '}
            <button onClick={() => setLayoutName('cose')}>COSE</button>{' '}
            <button onClick={() => setLayoutName('fcose')}>fCOSE</button>{' '}
            <button onClick={() => setLayoutName('concentric')}>Concentric</button>
          </div>
          <div className="graphview-layout-controls">
            <strong>Edit:</strong>{' '}
            <button onClick={() => { try { cy?.fit(undefined, 40); } catch { /* noop */ } }}>Fit</button>{' '}
            <button onClick={() => { try { cy?.zoom({ level: 1.0 }); } catch { /* noop */ } }}>Reset Zoom</button>{' '}
            <button onClick={() => { try { undoRedoRef.current?.undo(); } catch { /* noop */ } }}>Undo</button>{' '}
            <button onClick={() => { try { undoRedoRef.current?.redo(); } catch { /* noop */ } }}>Redo</button>
          </div>
          <div className="graphview-layout-controls">
            <strong>Parser:</strong>{' '}
            <button onClick={() => { setUseMermaidParser(true); if (typeof window !== 'undefined') window.localStorage.setItem('graphview.parser', 'mermaid'); }}>Mermaid</button>{' '}
            <button onClick={() => { setUseMermaidParser(false); if (typeof window !== 'undefined') window.localStorage.setItem('graphview.parser', 'regex'); }}>Regex</button>
          </div>
          <div className="graphview-layout-controls">
            <strong>Groups:</strong>{' '}
            <button onClick={() => setShowGroupBoundaries(s => !s)}>{showGroupBoundaries ? 'Hide Boundaries' : 'Show Boundaries'}</button>{' '}
            <button onClick={() => setCollapseGroups(c => !c)}>{collapseGroups ? 'Expand Groups' : 'Collapse Groups'}</button>
            {' '}
            <button onClick={() => setColorParents(p => !p)}>{colorParents ? 'Color Children' : 'Color Parents'}</button>
          </div>
          <div className="graphview-layout-controls">
            <strong>View:</strong>{' '}
            <button onClick={() => { try { if (cy) { cy.fit(undefined, 40); } } catch { /* noop */ } }}>View All</button>
          </div>
        </div>
        <div className="graphview-scroll-area">
          <pre className="graphview-tracepre">{JSON.stringify(props.trace ? {
            ...props.trace,
            startedAt: fmtTs((props.trace as unknown as { startedAt?: number }).startedAt),
            endedAt: fmtTs((props.trace as unknown as { endedAt?: number }).endedAt),
            events: Array.isArray(props.trace.events) ? props.trace.events.map((ev: { ts: number }) => ({
              ...ev,
              ts: fmtTs(ev.ts)
            })) : []
          } : props.trace, null, 2)}</pre>
        </div>
      </div>
    </div>
  );
}

function extractElementsFromMermaidSVG(svg: string, measureNodeSize: (label: string) => { w: number; h: number }): { nodes: Array<{ data: { id: string; label: string; w: number; h: number } }>; edges: Array<{ data: { id: string; source: string; target: string; label?: string } }> } {
  const nodes: Array<{ data: { id: string; label: string; w: number; h: number } }> = [];
  const edges: Array<{ data: { id: string; source: string; target: string; label?: string } }> = [];
  if (!svg || typeof svg !== 'string') return { nodes, edges };
  const parser = (typeof window !== 'undefined') ? new window.DOMParser() : null;
  if (!parser) return { nodes, edges };
  const doc = parser.parseFromString(svg, 'image/svg+xml');

  // Node candidates: Mermaid often uses <g class="node"> with data-id or id
  const gNodes = Array.from(doc.querySelectorAll('g.node, g[id], [data-id]'));
  const seen = new Set<string>();
  for (const g of gNodes) {
    const rawId = (g.getAttribute('data-id') || g.getAttribute('id') || '').trim();
    if (!rawId) continue;
    const id = normalizeMermaidId(rawId);
    if (seen.has(id)) continue;
    seen.add(id);
    const text = g.querySelector('text');
    const label = (text?.textContent || id).trim();
    const { w, h } = measureNodeSize(label);
    nodes.push({ data: { id, label, w, h } });
  }

  // Edge candidates: g.edgePath often contains title/desc
  const gEdges = Array.from(doc.querySelectorAll('g.edgePath, g[class*="edge"], g[id*="edge"]'));
  let i = 0;
  for (const g of gEdges) {
    const labelEl = g.querySelector('text');
    const label = (labelEl?.textContent || '').trim() || undefined;
    const encoded = (g.querySelector('title')?.textContent || g.querySelector('desc')?.textContent || '').trim();
    let source = '';
    let target = '';
    const m = /([A-Za-z0-9_\-:.]+)\s*->\s*([A-Za-z0-9_\-:.]+)/.exec(encoded);
    if (m) {
      source = normalizeMermaidId(m[1]);
      target = normalizeMermaidId(m[2]);
    }
    if (!source || !target) {
      const ids = Array.from(g.querySelectorAll('[data-id]')).map(el => normalizeMermaidId(el.getAttribute('data-id') || ''));
      if (ids.length >= 2) { source = ids[0]; target = ids[1]; }
    }
    if (source && target) {
      edges.push({ data: { id: `e${i++}`, source, target, label } });
    }
  }

  return { nodes, edges };
}

function normalizeMermaidId(id: string): string {
  return id.replace(/^flowchart-/, '').replace(/\s+/g, '_');
}
