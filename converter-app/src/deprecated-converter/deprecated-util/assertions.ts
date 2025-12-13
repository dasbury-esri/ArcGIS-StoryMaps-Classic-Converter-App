import type { StoryMapJSON } from '../types/core';

export interface AssertionResult {
  errors: string[];
  warnings: string[];
}

// Core schema/business rules we want to enforce post-conversion.
export function assertStoryMapJson(json: StoryMapJSON): AssertionResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!json) {
    errors.push('StoryMapJSON is null/undefined');
    return { errors, warnings };
  }
  if (!json.root) errors.push('Missing root node id');
  if (!json.nodes || !Object.keys(json.nodes).length) errors.push('No nodes present in JSON');

  // Gather node ids for quick lookup
  const nodeIds = new Set(Object.keys(json.nodes || {}));
  const resourceIds = new Set(Object.keys(json.resources || {}));

  // Helper narrowers
  const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object';
  const hasData = (n: unknown): n is { data: Record<string, unknown> } => isObj(n) && 'data' in n && isObj((n as Record<string, unknown>).data);
  const hasChildren = (n: unknown): n is { children: string[] } => isObj(n) && Array.isArray((n as Record<string, unknown>).children);
  // helper reserved for future safe access patterns

  // Validate root
  if (json.root) {
    const rootNode = json.nodes[json.root];
    if (!rootNode) errors.push('Root node id does not resolve to a node object');
    else if (rootNode.type !== 'story') errors.push(`Root node type expected 'story' but found '${rootNode.type}'`);
    if (hasData(rootNode) && 'metaSettings' in (rootNode.data as Record<string, unknown>)) {
      errors.push('metaSettings should have been stripped from root story node');
    }
  }

  // Node specific validations
  for (const [id, node] of Object.entries(json.nodes)) {
    if (!node) { errors.push(`Node '${id}' is null/undefined`); continue; }
    if (!node.type) errors.push(`Node '${id}' missing required 'type' property`);

    // Child references must exist
    if (hasChildren(node)) {
      for (const childId of (node.children as string[])) {
        if (!nodeIds.has(childId)) errors.push(`Node '${id}' references missing child '${childId}'`);
      }
    }

    // Type-specific checks
    if (node.type === 'webmap') {
      // config.size must exist and be valid
      const size = (isObj(node.config) ? (node.config as Record<string, unknown>)['size'] : undefined) as string | undefined;
      if (!size) errors.push(`WebMap node '${id}' missing config.size`);
      else if (!['standard','wide'].includes(size)) warnings.push(`WebMap node '${id}' has unexpected size '${size}'`);
      if (node.data && Object.prototype.hasOwnProperty.call(node.data as Record<string, unknown>, 'scale')) {
        errors.push(`WebMap node '${id}' still has deprecated data.scale`);
      }
      // referenced resource must exist
      const mapRes = (node.data ? (node.data as Record<string, unknown>)['map'] : undefined) as string | undefined;
      if (mapRes && !resourceIds.has(mapRes)) errors.push(`WebMap node '${id}' references missing resource '${mapRes}'`);
    } else if (node.type === 'text') {
      // textAlignment expected
      if (node.data && !Object.prototype.hasOwnProperty.call(node.data as Record<string, unknown>, 'textAlignment')) {
        errors.push(`Text node '${id}' missing data.textAlignment`);
      }
      const dataText = (node.data ? (node.data as Record<string, unknown>)['text'] : undefined) as string | undefined;
      if (typeof dataText !== 'string' || !dataText.length) warnings.push(`Text node '${id}' has empty/missing text content`);
    } else if (node.type === 'image') {
      const imgRes = (node.data ? (node.data as Record<string, unknown>)['image'] : undefined) as string | undefined;
      if (!imgRes) errors.push(`Image node '${id}' missing data.image resource reference`);
      else if (!resourceIds.has(imgRes)) errors.push(`Image node '${id}' references missing resource '${imgRes}'`);
    } else if (node.type === 'video') {
      const videoRes = (node.data ? (node.data as Record<string, unknown>)['video'] : undefined) as string | undefined;
      if (videoRes && !resourceIds.has(videoRes)) warnings.push(`Video node '${id}' references missing resource '${videoRes}'`); // may be external/embed
    } else if (node.type === 'embed') {
      // Basic sanity: url or embedSrc should exist
      const dt = node.data as Record<string, unknown> | undefined;
      const url = dt ? (dt['url'] as unknown) : undefined;
      const embedSrc = dt ? (dt['embedSrc'] as unknown) : undefined;
      if (!dt || (!url && !embedSrc)) warnings.push(`Embed node '${id}' missing url/embedSrc`);
    } else if (node.type === 'tour') {
      const dt = node.data as Record<string, unknown> | undefined;
      if (!dt) {
        errors.push(`Tour node '${id}' missing data object`);
      } else {
        ['type','subtype','map','places','accentColor'].forEach(k => { if (!(k in dt)) errors.push(`Tour node '${id}' missing data.${k}`); });
        const places = dt['places'] as unknown;
        if (Array.isArray(places) && !(places as unknown[]).length) warnings.push(`Tour node '${id}' has empty places array`);
        const mapNodeId = dt.map as string | undefined;
        if (mapNodeId && !nodeIds.has(mapNodeId)) errors.push(`Tour node '${id}' references missing map node '${mapNodeId}'`);
      }
    } else if (node.type === 'tour-map') {
      const dt = node.data as Record<string, unknown> | undefined;
      if (!dt) errors.push(`Tour-map node '${id}' missing data`);
      else {
        if (!('geometries' in dt)) warnings.push(`Tour-map node '${id}' missing data.geometries`);
        if (!('mode' in dt)) warnings.push(`Tour-map node '${id}' missing data.mode`);
      }
    }
  }

  // Validate resources minimal integrity
  for (const [resId, res] of Object.entries(json.resources || {})) {
    if (!res) { errors.push(`Resource '${resId}' is null/undefined`); continue; }
    if (!res.type) errors.push(`Resource '${resId}' missing type`);
    if (res.type === 'webmap') {
      const data = res.data as Record<string, unknown> | undefined;
      if (!data?.itemId) errors.push(`WebMap resource '${resId}' missing data.itemId`);
      const itemType = data ? (data['itemType'] as string | undefined) : undefined;
      if (!['Web Map','Web Scene'].includes(itemType ?? '')) warnings.push(`WebMap resource '${resId}' unexpected itemType '${itemType}'`);
      const initialState = data ? (data['initialState'] as Record<string, unknown> | undefined) : undefined;
      if (initialState && 'scale' in initialState) errors.push(`WebMap resource '${resId}' initialState still contains scale`);
    }
    if (res.type === 'image') {
      const data = res.data as Record<string, unknown> | undefined;
      const src = data ? (data['src'] as unknown) : undefined;
      const resourceIdField = data ? (data['resourceId'] as unknown) : undefined;
      if (!src && !resourceIdField) warnings.push(`Image resource '${resId}' missing src/resourceId`);
    }
  }

  // Actions validation
  if (Array.isArray(json.actions)) {
    for (const act of json.actions) {
      const origin = isObj(act) ? (act['origin'] as string | undefined) : undefined;
      const target = isObj(act) ? (act['target'] as string | undefined) : undefined;
      if (origin && !nodeIds.has(origin)) errors.push(`Action references missing origin node '${origin}'`);
      if (target && !nodeIds.has(target)) errors.push(`Action references missing target node '${target}'`);
      const event = isObj(act) ? (act['event'] as string | undefined) : undefined;
      if (event === 'ImmersiveSlide_ReplaceMedia') {
        const data = isObj(act) ? (act['data'] as Record<string, unknown> | undefined) : undefined;
        const media = data ? (data['media'] as string | undefined) : undefined;
        if (!media) {
          errors.push('ReplaceMedia action missing data.media');
        } else if (!nodeIds.has(media)) {
          errors.push(`ReplaceMedia action references missing media node '${media}'`);
        }
      }
    }
  }

  return { errors, warnings };
}

export function assertOrThrow(json: StoryMapJSON): void {
  const { errors, warnings } = assertStoryMapJson(json);
  if (errors.length) {
    const msg = `StoryMapJSON assertion failed (errors=${errors.length}, warnings=${warnings.length}):\n` + errors.join('\n');
    throw new Error(msg);
  }
}

// Lightweight helper to format assertion output
export function formatAssertionReport(result: AssertionResult): string {
  const lines: string[] = [];
  lines.push(`Assertion Report: ${result.errors.length} error(s), ${result.warnings.length} warning(s)`);
  if (result.errors.length) {
    lines.push('Errors:');
    for (const e of result.errors) lines.push('  - ' + e);
  }
  if (result.warnings.length) {
    lines.push('Warnings:');
    for (const w of result.warnings) lines.push('  - ' + w);
  }
  return lines.join('\n');
}
