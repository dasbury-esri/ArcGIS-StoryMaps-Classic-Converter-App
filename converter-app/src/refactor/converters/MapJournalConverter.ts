import { BaseConverter } from './BaseConverter.ts';
import { determineScaleZoomLevel } from '../../converter/utils.ts';
import type { ClassicValues, ClassicSection } from '../types/classic.ts';
import type { ConverterResult, StoryMapJSON } from '../types/core.ts';
import { createThemeWithDecisions } from '../theme/themeMapper.ts';
import { StoryMapJSONBuilder } from '../schema/StoryMapJSONBuilder.ts';
import type { BaseConverterOptions } from './BaseConverter.ts';

export class MapJournalConverter extends BaseConverter {
  private builder: StoryMapJSONBuilder;
  private sections: ClassicSection[] = [];
  private imageResourceMap = new Map<string, string>();
  private media = new Set<string>();
  // Collected <style> blocks found in section HTML (not turned into narrative nodes)
  private styleBlocks: string[] = [];
  // Count of external provider video embeds (YouTube/Vimeo) converted
  private videoEmbedCount = 0;

  constructor(options: BaseConverterOptions) {
    super(options);
    this.builder = new StoryMapJSONBuilder(options.themeId);
  }

  protected extractStructure(): void {
    const values = this.classicJson.values as ClassicValues;
    const storySections = (values.story && Array.isArray(values.story.sections)) ? values.story.sections as ClassicSection[] : [];
    const topSections = Array.isArray(values.sections) ? values.sections as ClassicSection[] : [];
    // Prefer story.sections (Map Journal) else fallback to top-level sections
    this.sections = storySections.length ? storySections : topSections;
    this.emit(`Extracted ${this.sections.length} section(s)`);
  }

  protected convertContent(): void {
    this.builder.createStoryRoot();
    const v = this.classicJson.values as ClassicValues;
    this.emit('Created story root node');
    this.builder.addCoverNode(v.title || 'Untitled Story', v.subtitle as string | undefined);
    this.builder.addNavigationHidden();
    this.builder.addCreditsNode();
    this.emit('Added cover/navigation/credits scaffold');
    // Inject metaSettings (title, description, optional cover image resource when available later)
    const metaDesc = (v.description || v.subtitle || '') + '';
    let coverImageRes: string | undefined;
    // Heuristic: if first resource is image and cover has image assigned later we could map; placeholder now
    this.builder.setStoryMeta(v.title || 'Untitled Story', metaDesc.trim() || undefined, coverImageRes);

    // Map classic layout settings to sidecar config
    const classicValues = v as ClassicValues;
    const layoutId = classicValues.settings?.layout?.id || 'side';
    const layoutCfg = (classicValues.settings?.layoutOptions?.layoutCfg as { size?: string; position?: string }) || {};
    const classicSize = layoutCfg.size || 'medium';
    const classicPosition = layoutCfg.position || 'right';
    const hasClassicTheme = !!classicValues.settings?.theme && Object.keys(classicValues.settings.theme || {}).length > 0;
    const subtype: 'docked-panel' | 'floating-panel' = layoutId === 'float' ? 'floating-panel' : 'docked-panel';
    let narrativePanelSize: 'small' | 'medium' | 'large' = 'medium';
    if (classicSize === 'small' || classicSize === 'medium' || classicSize === 'large') narrativePanelSize = classicSize;
    const narrativePanelPosition: 'start' | 'end' = classicPosition === 'left' ? 'start' : classicPosition === 'right' ? 'end' : 'end';
    const { immersiveId: sidecarId, slideId: placeholderSlideId, narrativeId: placeholderNarrativeId } =
      this.builder.addSidecar(subtype, narrativePanelPosition, narrativePanelSize);
    // Remove placeholder slide + narrative panel created by sidecar scaffold; we will add real slides below.
    this.builder.removeNode(placeholderSlideId);
    this.builder.removeNode(placeholderNarrativeId);
    this.builder.updateNode(sidecarId, node => { node.children = []; });

    // Optional intro slide (ignore root-level webmap per requirement; only use description)
    if (v.description) {
      const introNarrative: string[] = [this.builder.createTextNode(String(v.description), 'paragraph')];
      this.builder.addSlideToSidecar(sidecarId, introNarrative, undefined);
    }

    const sectionHeadingIds: string[] = [];
    const navigateButtonStubs: Array<{ actionId: string; buttonNodeId: string }> = [];
    // Inline navigate anchors (no button node) we must add href later
    const navigateInlineStubs: Array<{ actionId: string; richNodeId: string }> = [];
    for (const section of this.sections) {
      const narrativeIds: string[] = [];
      const actionStubs: Array<{ actionId: string; text: string; buttonNodeId: string }> = [];

      // Title first (capture heading id for navigate targets)
      let headingNodeId: string | undefined;
      if (section.title) {
        headingNodeId = this.builder.createTextNode(section.title, 'h3');
        narrativeIds.push(headingNodeId);
      }
      sectionHeadingIds.push(headingNodeId || '');

      const rawHtml = (section.content || section.description || '') + '';
      if (rawHtml.trim()) {
        // Use DOMParser in browser; fallback in Node
        if (typeof (globalThis as unknown as { DOMParser?: unknown }).DOMParser !== 'undefined') {
          try {
            const doc = new DOMParser().parseFromString(rawHtml, 'text/html');
            for (const el of Array.from(doc.body.children)) {
              this.handleElementOrdered(el, narrativeIds, actionStubs, navigateButtonStubs, navigateInlineStubs);
            }
          } catch {
            this.parseOrderedFallback(rawHtml, narrativeIds, actionStubs, navigateButtonStubs, navigateInlineStubs);
          }
        } else {
          this.parseOrderedFallback(rawHtml, narrativeIds, actionStubs, navigateButtonStubs, navigateInlineStubs);
        }
      }

      // Primary media for slide
      let mediaNodeId: string | undefined;
      const m = section.media;
      if (m?.image?.url) {
        const rId = this.builder.addImageResource(m.image.url);
        mediaNodeId = this.builder.createImageNode(rId, m.image.caption, m.image.altText, 'wide');
        this.media.add(m.image.url);
      } else if (m?.webmap?.id) {
        // Support Web Scene vs Web Map via optional itemType field in classic JSON media
        const wmItemType: 'Web Map' | 'Web Scene' = m.webmap.itemType === 'Web Scene' ? 'Web Scene' : 'Web Map';
        type ClassicLayer = { id: string; visibility: boolean; title?: string };
        type ClassicExtent = { xmin: number; ymin: number; xmax: number; ymax: number; spatialReference?: { wkid?: number; latestWkid?: number; wkt?: string } };
        interface ClassicWebMapExtras { overview?: { enable?: boolean; openByDefault?: boolean }; legend?: { enable?: boolean; openByDefault?: boolean }; geocoder?: { enable?: boolean }; popup?: unknown; }
        const extras = m.webmap as ClassicWebMapExtras;
        // Normalize extent/center SR to Web Mercator if provided in WGS84
        const normalizeExtent = (ex: ClassicExtent | undefined): ClassicExtent | undefined => {
          if (!ex) return ex;
          const sr = ex.spatialReference?.wkid || ex.spatialReference?.wkt || ex.spatialReference?.latestWkid;
          const is4326 = sr === 4326 || sr === 'WGS84' || sr === 'WGS 84';
          const toWebMercatorX = (lon: number) => lon * 20037508.34 / 180;
          const toWebMercatorY = (lat: number) => {
            const y = Math.log(Math.tan((90 + lat) * Math.PI / 360)) / (Math.PI / 180);
            return y * 20037508.34 / 180;
          };
          if (is4326 && typeof ex.xmin === 'number') {
            const xmin = toWebMercatorX(ex.xmin);
            const xmax = toWebMercatorX(ex.xmax);
            const ymin = toWebMercatorY(ex.ymin);
            const ymax = toWebMercatorY(ex.ymax);
            return { xmin, ymin, xmax, ymax, spatialReference: { wkid: 102100 } };
          }
          return ex;
        };
        const normalizedExtent = m.webmap.extent ? normalizeExtent(m.webmap.extent as ClassicExtent) : undefined;
        // Compute viewpoint/zoom/scale from extent
        interface Viewpoint { targetGeometry?: unknown; scale?: number }
        let viewpoint: Viewpoint | undefined;
        let zoom: number | undefined;
        if (normalizedExtent) {
          const scaleZoom = determineScaleZoomLevel(normalizedExtent as unknown as { ymax: number; ymin: number });
          if (scaleZoom) {
            viewpoint = { targetGeometry: normalizedExtent, scale: scaleZoom.scale };
            zoom = scaleZoom.zoom;
          }
        }
        const initialState = {
          extent: normalizedExtent,
          mapLayers: Array.isArray(m.webmap.layers)
            ? (m.webmap.layers as ClassicLayer[]).map(l => ({ id: l.id, title: l.title || l.id, visible: l.visibility }))
            : undefined,
          overview: extras.overview ? { enable: !!extras.overview.enable, openByDefault: !!extras.overview.openByDefault } : undefined,
          legend: extras.legend ? { enable: !!extras.legend.enable, openByDefault: !!extras.legend.openByDefault } : undefined,
          geocoder: extras.geocoder ? { enable: !!extras.geocoder.enable } : undefined,
          popup: extras.popup || undefined,
          viewpoint,
          zoom
        };
        // Create webmap resource as 'default' type (experiment: skip later enrichment step)
        const wId = this.builder.addWebMapResource(m.webmap.id, wmItemType, initialState, 'default');
        // Attach scale to top-level resource data (parity with legacy)
        // Removed attaching top-level scale to resource (rely on viewpoint.scale)
        mediaNodeId = this.builder.createWebMapNode(
          wId,
          section.title ? `${wmItemType === 'Web Scene' ? 'Scene' : 'Map'}: ${section.title}` : undefined
        );
        this.media.add(m.webmap.id);
        // Ensure slide-level extent/layers/viewpoint present on node for downstream consumers
        if (mediaNodeId) {
          this.builder.updateNodeData(mediaNodeId, (data) => {
            if (normalizedExtent) data.extent = normalizedExtent;
            if (Array.isArray(m.webmap.layers)) {
              (data as Record<string, unknown>).mapLayers = (m.webmap.layers as ClassicLayer[]).map(l => ({ id: l.id, title: l.title || l.id, visible: l.visibility }));
            }
            if (viewpoint) (data as Record<string, unknown>).viewpoint = viewpoint;
            if (typeof zoom === 'number') (data as Record<string, unknown>).zoom = zoom;
            // Removed data.scale assignment (use viewpoint.scale)
            if (extras.overview && extras.overview.enable) {
              (data as Record<string, unknown>).overview = { openByDefault: !!extras.overview.openByDefault };
            }
            if (extras.legend && extras.legend.enable) {
              (data as Record<string, unknown>).legend = { openByDefault: !!extras.legend.openByDefault };
            }
          });
        }
      } else if (m?.video?.url) {
        const providerInfo = this.detectVideoProvider(m.video.url);
        if (providerInfo.provider !== 'unknown') {
          mediaNodeId = this.builder.createVideoEmbedNode(m.video.url, providerInfo.provider, providerInfo.id, m.video.caption, m.video.caption, undefined, m.video.altText);
          this.videoEmbedCount++; // track converted embed
        } else {
          const vRes = this.builder.addVideoResource(m.video.url, 'uri');
          mediaNodeId = this.builder.createVideoNode(vRes, m.video.caption, m.video.altText);
          this.media.add(m.video.url);
        }
      } else if (m?.webpage?.url) {
        mediaNodeId = this.builder.createEmbedNode(m.webpage.url, m.webpage.caption, m.webpage.title, m.webpage.description, m.webpage.altText);
      }

      const { slideId } = this.builder.addSlideToSidecar(sidecarId, narrativeIds, mediaNodeId);

      // Resolve contentActions -> action-buttons + ReplaceMedia actions
      if (Array.isArray(section.contentActions) && section.contentActions.length) {
        const map = new Map(section.contentActions.map(a => [a.id, a]));
        for (const stub of actionStubs) {
          const act = map.get(stub.actionId);
          if (!act || act.type !== 'media' || !act.media) continue;
          let actMediaNode: string | undefined;
            const media = act.media;
            if (media.webmap?.id) {
              const wmItemType2: 'Web Map' | 'Web Scene' = media.webmap.itemType === 'Web Scene' ? 'Web Scene' : 'Web Map';
              // Compute viewpoint/zoom/scale from extent if present
              interface Viewpoint2 { targetGeometry?: unknown; scale?: number }
              let viewpoint2: Viewpoint2 | undefined;
              let zoom2: number | undefined;
              // Normalize extent SR for action media as well
              const normalizedExtent2 = media.webmap.extent ? normalizeExtent(media.webmap.extent as ClassicExtent) : undefined;
              // Extract extras for action media
              interface ClassicWebMapExtras2 { overview?: { enable?: boolean; openByDefault?: boolean }; legend?: { enable?: boolean; openByDefault?: boolean } }
              const extras2 = media.webmap as ClassicWebMapExtras2;
              if (normalizedExtent2) {
                const scaleZoom2 = determineScaleZoomLevel(normalizedExtent2 as unknown as { ymax: number; ymin: number });
                if (scaleZoom2) {
                  viewpoint2 = { targetGeometry: normalizedExtent2, scale: scaleZoom2.scale };
                  zoom2 = scaleZoom2.zoom;
                }
              }
              const initialState2 = {
                extent: normalizedExtent2,
                mapLayers: Array.isArray(media.webmap.layers)
                  ? media.webmap.layers.map(l => ({ id: l.id, title: l.title || l.id, visible: l.visibility }))
                  : undefined,
                overview: extras2.overview ? { enable: !!extras2.overview.enable, openByDefault: !!extras2.overview.openByDefault } : undefined,
                legend: extras2.legend ? { enable: !!extras2.legend.enable, openByDefault: !!extras2.legend.openByDefault } : undefined,
                viewpoint: viewpoint2,
                zoom: zoom2
              };
              // Action replace-media webmap also created as 'default'
              const wmRes = this.builder.addWebMapResource(media.webmap.id, wmItemType2, initialState2, 'default');
              // Attach scale to top-level resource data (parity with legacy)
              // Removed attaching scale to action webmap resource
              actMediaNode = this.builder.createWebMapNode(
                wmRes,
                stub.text.includes('Map') || stub.text.includes('Scene') ? stub.text : undefined
              );
              const currentJson = this.builder.getJson();
              if (actMediaNode) {
                const wmNode = currentJson.nodes[actMediaNode];
                if (wmNode && wmNode.data) {
                  if (Array.isArray(media.webmap.layers)) {
                    (wmNode.data as Record<string, unknown>).mapLayers = media.webmap.layers.map(l => ({ id: l.id, title: l.title || l.id, visible: l.visibility }));
                  }
                  if (normalizedExtent2) {
                    (wmNode.data as Record<string, unknown>).extent = normalizedExtent2;
                  }
                  if (viewpoint2) {
                    (wmNode.data as Record<string, unknown>).viewpoint = viewpoint2;
                  }
                  if (typeof zoom2 === 'number') {
                    (wmNode.data as Record<string, unknown>).zoom = zoom2;
                  }
                  // Removed data.scale assignment for action media node
                  // Propagate overview/legend open state to node-level for action media
                  if (extras2.overview && extras2.overview.enable) {
                    (wmNode.data as Record<string, unknown>).overview = { openByDefault: !!extras2.overview.openByDefault };
                  }
                  if (extras2.legend && extras2.legend.enable) {
                    (wmNode.data as Record<string, unknown>).legend = { openByDefault: !!extras2.legend.openByDefault };
                  }
                }
              }
              this.media.add(media.webmap.id);
            } else if (media.image?.url) {
              const rId = this.builder.addImageResource(media.image.url);
              actMediaNode = this.builder.createImageNode(rId, media.image.caption, media.image.altText, 'standard');
              this.media.add(media.image.url);
            } else if (media.video?.url) {
              const providerInfo2 = this.detectVideoProvider(media.video.url);
              if (providerInfo2.provider !== 'unknown') {
                actMediaNode = this.builder.createVideoEmbedNode(media.video.url, providerInfo2.provider, providerInfo2.id, media.video.caption, media.video.caption, undefined, media.video.altText);
                this.videoEmbedCount++;
              } else {
                const vRes = this.builder.addVideoResource(media.video.url, 'uri');
                actMediaNode = this.builder.createVideoNode(vRes, media.video.caption, media.video.altText);
                this.media.add(media.video.url);
              }
            } else if (media.webpage?.url) {
              actMediaNode = this.builder.createEmbedNode(media.webpage.url, media.webpage.caption, media.webpage.title, media.webpage.description, media.webpage.altText);
            }
          if (actMediaNode) {
            // Attach dependents reference via builder mutator (extend StoryMapNode with dependents bag)
            this.builder.updateNode(stub.buttonNodeId, (btnNode) => {
              const b = btnNode as unknown as { dependents?: Record<string, string> };
              if (!b.dependents) b.dependents = {};
              b.dependents.actionMedia = actMediaNode;
            });
            this.builder.registerReplaceMediaAction(stub.buttonNodeId, slideId, actMediaNode);
          }
        }
      }
    }

    // Resolve navigate buttons -> internal links referencing heading nodes by index
    const navigateIndexLookup = new Map<string, number>();
    this.sections.forEach((sec) => {
      (sec.contentActions || []).forEach(a => {
        if (a.type === 'navigate' && typeof a.index === 'number') navigateIndexLookup.set(a.id, a.index);
      });
    });
    for (const stub of navigateButtonStubs) {
      const targetIdx = navigateIndexLookup.get(stub.actionId);
      if (typeof targetIdx === 'number') {
        const headingId = sectionHeadingIds[targetIdx];
        if (headingId) this.builder.setButtonLink(stub.buttonNodeId, `#ref-${headingId}`);
      }
    }
    // Inline anchors: inject hrefs inside preserved HTML
    // Refresh live JSON snapshot for inline anchor resolution
    const json = this.builder.getJson();
    for (const stub of navigateInlineStubs) {
      const targetIdx = navigateIndexLookup.get(stub.actionId);
      if (typeof targetIdx !== 'number') continue;
      const headingId = sectionHeadingIds[targetIdx];
      if (!headingId) continue;
      const node = json.nodes[stub.richNodeId];
      if (node?.type === 'text' && node.data) {
        interface RichTextData { text: string; type: string; preserveHtml?: boolean }
        const data = node.data as unknown as RichTextData;
        if (!data.preserveHtml) continue;
        const html = data.text;
        // Add href if absent
        const re = new RegExp(`<a([^>]*data-storymaps=["']${stub.actionId}["'][^>]*)>`,'i');
        const updated = html.replace(re, (full, attrs) => {
          if (/href=/.test(attrs)) return full; // already has href
          return `<a${attrs} href="#ref-${headingId}" target="_self">`;
        });
        data.text = updated;
      }
    }

    // Theme provenance & inline theme resource override application
    const classicTheme = classicValues.settings?.theme || null;
    // Fallback branch: if no classic theme and float layout, apply obsidian with no overrides and adjust each immersive-narrative-panel (not the sidecar itself)
    if (!hasClassicTheme && layoutId === 'float') {
      // Update every immersive-narrative-panel to position:end & size:medium
      const currentJson = this.builder.getJson();
      for (const node of Object.values(currentJson.nodes)) {
        if (node && node.type === 'immersive-narrative-panel') {
          if (!node.data) node.data = {};
          (node.data as Record<string, unknown>).position = 'end';
          (node.data as Record<string, unknown>).size = 'medium';
        }
      }
      const decisions: Record<string, unknown> = {
        baseThemeId: 'obsidian',
        forcedByMissingClassicTheme: true,
        variableOverridesApplied: [],
        layoutMapping: {
          classicLayoutId: layoutId,
          classicSize,
          classicPosition,
          mappedSubtype: subtype,
          mappedNarrativePanelSize: 'medium',
          mappedNarrativePanelPosition: 'end'
        }
      };
      this.builder.applyTheme({ themeId: 'obsidian', variableOverrides: {} });
      decisions.videoEmbeds = this.videoEmbedCount;
      this.builder.addConverterMetadata('MapJournal', { classicMetadata: { theme: classicTheme, mappingDecisions: decisions } });
      this.emit('Applied fallback obsidian theme (no classic theme present; float layout)');
      return;
    }
    const { theme: mappedTheme, decisions } = createThemeWithDecisions(this.classicJson);
    decisions.layoutMapping = {
      classicLayoutId: layoutId,
      classicSize,
      classicPosition,
      mappedSubtype: subtype,
      mappedNarrativePanelSize: narrativePanelSize,
      mappedNarrativePanelPosition: narrativePanelPosition
    };
    // Build overrides from variableOverridesApplied list
    const overrides: Record<string,string> = {};
    if (Array.isArray(decisions.variableOverridesApplied)) {
      for (const key of decisions.variableOverridesApplied) {
        if (mappedTheme.variables && key in mappedTheme.variables) {
          overrides[key] = String(mappedTheme.variables[key]);
        }
      }
    }
    // Attach extracted custom CSS (style blocks) provenance if present
    if (this.styleBlocks.length) {
      try {
        const combined = this.styleBlocks.join('\n\n');
        (decisions as Record<string, unknown>)["customCss"] = {
          blockCount: this.styleBlocks.length,
          combined,
          approxBytes: combined.length
        } as Record<string, unknown>;
      } catch {
        // swallow
      }
    }
    // Apply base theme and overrides to existing theme resource
    this.builder.applyTheme({ themeId: decisions.baseThemeId, variableOverrides: overrides });
    (decisions as Record<string, unknown>).videoEmbeds = this.videoEmbedCount;
    // Add converter metadata resource
    this.builder.addConverterMetadata('MapJournal', { classicMetadata: { theme: classicTheme, mappingDecisions: decisions } });
    const sidecarNode = this.builder.getJson().nodes[sidecarId];
    const slideCount = sidecarNode?.children?.length || 0;
    this.emit(`Built single sidecar with ${slideCount} slide(s); theme overrides applied (${Object.keys(overrides).length})`);
  }

  protected applyTheme(): void {
    // Theme already applied with overrides inside convertContent
    this.emit('applyTheme skipped (handled in convertContent)');
  }

  protected collectMedia(): string[] {
    this.emit(`Collected ${this.media.size} media URL(s)`);
    return Array.from(this.media);
  }

  protected getStoryMapJson(): StoryMapJSON {
    return this.builder.getJson();
  }

  static convert(opts: BaseConverterOptions): ConverterResult {
    const converter = new MapJournalConverter(opts);
    return converter.convert();
  }

  private extractImageEntries(html: string): Array<{ src: string; alt?: string; caption?: string }> {
    const found: Array<{ src: string; alt?: string; caption?: string }> = [];
    const figureRegex = /<figure[^>]*>([\s\S]*?)<\/figure>/gi;
    let figMatch: RegExpExecArray | null;
    while ((figMatch = figureRegex.exec(html)) !== null) {
      const figureHtml = figMatch[1];
      const imgTag = /<img[^>]*>/i.exec(figureHtml)?.[0];
      if (!imgTag) continue;
      const srcMatch = /src=["']([^"'>]+)["']/i.exec(imgTag);
      if (!srcMatch) continue;
      const altMatch = /alt=["']([^"'>]*)["']/i.exec(imgTag);
      const captionMatch = /<figcaption[^>]*>([\s\S]*?)<\/figcaption>/i.exec(figureHtml);
      const caption = captionMatch ? this.stripHtml(captionMatch[1]).trim() : undefined;
      const src = srcMatch[1];
      if (!found.some(f => f.src === src)) {
        found.push({ src, alt: altMatch ? altMatch[1] : undefined, caption });
      }
    }
    const imgTagRegex = /<img[^>]*src=["']([^"'>]+)["'][^>]*>/gi;
    let match: RegExpExecArray | null;
    while ((match = imgTagRegex.exec(html)) !== null) {
      const tag = match[0];
      const src = match[1];
      if (!found.some(f => f.src === src)) {
        const altMatch = /alt=["']([^"'>]*)["']/i.exec(tag);
        found.push({ src, alt: altMatch ? altMatch[1] : undefined });
      }
    }
    return found;
  }

  private stripHtml(input: string): string {
    return input.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
  }

  private extractParagraphBlocks(html: string): string[] {
    const blocks: string[] = [];
    const pRegex = /<p[^>]*>([\s\S]*?)<\/p>/gi;
    let match: RegExpExecArray | null;
    while ((match = pRegex.exec(html)) !== null) {
      const raw = match[1];
      const cleaned = this.stripHtml(raw);
      if (cleaned) blocks.push(cleaned);
    }
    // Fallback: if no <p> tags, treat entire content as one block
    if (!blocks.length) {
      const cleaned = this.stripHtml(html);
      if (cleaned) blocks.push(cleaned);
    }
    return blocks;
  }

  private extractActionAnchorLabel(html: string, actionId: string): string | undefined {
    const anchorRegex = new RegExp(`<a[^>]*data-storymaps=["']${actionId}["'][^>]*>([\\s\\S]*?)</a>`, 'i');
    const m = anchorRegex.exec(html);
    if (!m) return undefined;
    return this.stripHtml(m[1]);
  }

  private BUTTON_CLASS_REGEX = /^btn-(green|orange|purple|yellow|red)$/i;

  // Determines whether an HTML segment (post token-split) contains meaningful content.
  // Keeps segments that have visible text after stripping tags & whitespace, or that
  // include inline navigate/action anchors (data-storymaps) even if anchor text is blank.
  private isNonEmptyHtmlSegment(seg: string): boolean {
    if (!seg) return false;
    // Preserve segments containing inline action/navigate anchors regardless of text content
    const hasDataAnchor = /data-storymaps=/i.test(seg);
    // Strip style/script blocks (defensive) and HTML tags
    const stripped = seg
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/gi, ' ') // decode common non-breaking spaces
      .replace(/\u00A0/g, ' ') // Unicode NBSP
      .trim();
    return hasDataAnchor || stripped.length > 0;
  }

  // --- Inline Color Style -> Class Conversion (replicates Python workflow logic) ---
  // Minimal CSS color name map (extend as needed)
  private CSS_COLOR_MAP: Record<string, string> = {
    aliceblue: '#F0F8FF', antiquewhite: '#FAEBD7', aqua: '#00FFFF', aquamarine: '#7FFFD4', azure: '#F0FFFF',
    beige: '#F5F5DC', bisque: '#FFE4C4', black: '#000000', blanchedalmond: '#FFEBCD', blue: '#0000FF',
    blueviolet: '#8A2BE2', brown: '#A52A2A', burlywood: '#DEB887', cadetblue: '#5F9EA0', chartreuse: '#7FFF00',
    chocolate: '#D2691E', coral: '#FF7F50', cornflowerblue: '#6495ED', cornsilk: '#FFF8DC', crimson: '#DC143C',
    cyan: '#00FFFF', darkblue: '#00008B', darkcyan: '#008B8B', darkgoldenrod: '#B8860B', darkgray: '#A9A9A9',
    darkgreen: '#006400', darkgrey: '#A9A9A9', darkkhaki: '#BDB76B', darkmagenta: '#8B008B', darkolivegreen: '#556B2F',
    darkorange: '#FF8C00', darkorchid: '#9932CC', darkred: '#8B0000', darksalmon: '#E9967A', darkseagreen: '#8FBC8F',
    darkslateblue: '#483D8B', darkslategray: '#2F4F4F', darkslategrey: '#2F4F4F', darkturquoise: '#00CED1', darkviolet: '#9400D3',
    deeppink: '#FF1493', deepskyblue: '#00BFFF', dimgray: '#696969', dimgrey: '#696969', dodgerblue: '#1E90FF',
    firebrick: '#B22222', floralwhite: '#FFFAF0', forestgreen: '#228B22', fuchsia: '#FF00FF', gainsboro: '#DCDCDC',
    ghostwhite: '#F8F8FF', gold: '#FFD700', goldenrod: '#DAA520', gray: '#808080', green: '#008000',
    greenyellow: '#ADFF2F', grey: '#808080', honeydew: '#F0FFF0', hotpink: '#FF69B4', indianred: '#CD5C5C',
    indigo: '#4B0082', ivory: '#FFFFF0', khaki: '#F0E68C', lavender: '#E6E6FA', lavenderblush: '#FFF0F5',
    lawngreen: '#7CFC00', lemonchiffon: '#FFFACD', lightblue: '#ADD8E6', lightcoral: '#F08080', lightcyan: '#E0FFFF',
    lightgoldenrodyellow: '#FAFAD2', lightgray: '#D3D3D3', lightgreen: '#90EE90', lightgrey: '#D3D3D3', lightpink: '#FFB6C1',
    lightsalmon: '#FFA07A', lightseagreen: '#20B2AA', lightskyblue: '#87CEFA', lightslategray: '#778899', lightslategrey: '#778899',
    lightsteelblue: '#B0C4DE', lightyellow: '#FFFFE0', lime: '#00FF00', limegreen: '#32CD32', linen: '#FAF0E6',
    magenta: '#FF00FF', maroon: '#800000', mediumaquamarine: '#66CDAA', mediumblue: '#0000CD', mediumorchid: '#BA55D3',
    mediumpurple: '#9370DB', mediumseagreen: '#3CB371', mediumslateblue: '#7B68EE', mediumspringgreen: '#00FA9A', mediumturquoise: '#48D1CC',
    mediumvioletred: '#C71585', midnightblue: '#191970', mintcream: '#F5FFFA', mistyrose: '#FFE4E1', moccasin: '#FFE4B5',
    navajowhite: '#FFDEAD', navy: '#000080', oldlace: '#FDF5E6', olive: '#808000', olivedrab: '#6B8E23',
    orange: '#FFA500', orangered: '#FF4500', orchid: '#DA70D6', palegoldenrod: '#EEE8AA', palegreen: '#98FB98',
    paleturquoise: '#AFEEEE', palevioletred: '#DB7093', papayawhip: '#FFEFD5', peachpuff: '#FFDAB9', peru: '#CD853F',
    pink: '#FFC0CB', plum: '#DDA0DD', powderblue: '#B0E0E6', purple: '#800080', rebeccapurple: '#663399',
    red: '#FF0000', rosybrown: '#BC8F8F', royalblue: '#4169E1', saddlebrown: '#8B4513', salmon: '#FA8072',
    sandybrown: '#F4A460', seagreen: '#2E8B57', seashell: '#FFF5EE', sienna: '#A0522D', silver: '#C0C0C0',
    skyblue: '#87CEEB', slateblue: '#6A5ACD', slategray: '#708090', slategrey: '#708090', snow: '#FFFAFA',
    springgreen: '#00FF7F', steelblue: '#4682B4', tan: '#D2B48C', teal: '#008080', thistle: '#D8BFD8',
    tomato: '#FF6347', turquoise: '#40E0D0', violet: '#EE82EE', wheat: '#F5DEB3', white: '#FFFFFF',
    whitesmoke: '#F5F5F5', yellow: '#FFFF00', yellowgreen: '#9ACD32'
  };

  private colorToHex(value: string): string | undefined {
    if (!value) return undefined;
    value = value.trim();
    // Remove !important
    value = value.replace(/!important$/i, '').trim();
    // Already hex (#RRGGBB or #RGB)
    if (/^#([0-9a-f]{3})$/i.test(value)) {
      // Expand #RGB to #RRGGBB
      const r = value[1], g = value[2], b = value[3];
      return `#${r}${r}${g}${g}${b}${b}`.toUpperCase();
    }
    if (/^#([0-9a-f]{6})$/i.test(value)) return value.toUpperCase();
    // rgb(r,g,b) format
    const rgbMatch = /rgb\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/i.exec(value);
    if (rgbMatch) {
      const [r,g,b] = rgbMatch.slice(1,4).map(n => Math.max(0, Math.min(255, parseInt(n,10))));
      return `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`.toUpperCase();
    }
    // Python workflow had rgb-123-123-123 variant
    const rgbDashMatch = /rgb-?(\d+)-?(\d+)-?(\d+)/i.exec(value);
    if (rgbDashMatch) {
      const [r,g,b] = rgbDashMatch.slice(1,4).map(n => Math.max(0, Math.min(255, parseInt(n,10))));
      return `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`.toUpperCase();
    }
    // Named color
    const named = value.toLowerCase();
    if (this.CSS_COLOR_MAP[named]) return this.CSS_COLOR_MAP[named].toUpperCase();
    return undefined;
  }

  private processHtmlColorsPreserveHtml(html: string): string {
    if (!html || !/<[^>]+style=/i.test(html)) return html; // fast path if no style attributes
    // Use DOM when available
    try {
      const doc = new DOMParser().parseFromString(`<wrapper>${html}</wrapper>`, 'text/html');
      const wrapper = doc.querySelector('wrapper');
      if (!wrapper) return html;
      for (const el of Array.from(wrapper.querySelectorAll('[style]'))) {
        const style = el.getAttribute('style') || '';
        const m = /color\s*:\s*([^;]+)(;?)/i.exec(style);
        if (!m) continue;
        const colorRaw = m[1].trim();
        const hex = this.colorToHex(colorRaw);
        if (!hex) continue;
        const className = `sm-text-color-${hex.substring(1)}`; // drop '#'
        // Remove color declaration from style
        let newStyle = style.replace(m[0], '').trim();
        newStyle = newStyle.replace(/;;+/g,';');
        newStyle = newStyle.replace(/^;|;$/g,'').trim();
        if (newStyle) el.setAttribute('style', newStyle); else el.removeAttribute('style');
        const existingClass = el.getAttribute('class');
        if (existingClass) el.setAttribute('class', existingClass + ' ' + className); else el.setAttribute('class', className);
      }
      return wrapper.innerHTML;
    } catch {
      // Fallback regex-based processing (less precise)
      return html.replace(/(<[^>]+style=["'][^"'>]*color\s*:[^"'>]+["'][^>]*>)/gi, (tag) => {
        const styleMatch = /style=["']([^"'>]+)["']/i.exec(tag);
        if (!styleMatch) return tag;
        let style = styleMatch[1];
        const colorDecl = /color\s*:\s*([^;]+)(;?)/i.exec(style);
        if (!colorDecl) return tag;
        const colorRaw = colorDecl[1].trim();
        const hex = this.colorToHex(colorRaw);
        if (!hex) return tag;
        const className = `sm-text-color-${hex.substring(1)}`;
        style = style.replace(colorDecl[0], '').trim();
        style = style.replace(/;;+/g,';').replace(/^;|;$/g,'').trim();
        let newTag = tag.replace(styleMatch[0], style ? `style="${style}"` : '');
        if (/class=["']/i.test(newTag)) {
          newTag = newTag.replace(/class=["']([^"'>]+)["']/i, (m0, cls) => `class="${cls} ${className}"`);
        } else {
          newTag = newTag.replace(/<([^\s>]+)/, (m0, tName) => `<${tName} class="${className}"`);
        }
        return newTag;
      });
    }
  }

  private handleElementOrdered(
    el: Element,
    narrativeIds: string[],
    actionStubs: Array<{ actionId: string; text: string; buttonNodeId: string }>,
    navigateButtonStubs: Array<{ actionId: string; buttonNodeId: string }>,
    navigateInlineStubs: Array<{ actionId: string; richNodeId: string }>
  ): void {
    if (el.tagName === 'STYLE') {
      const css = el.textContent || '';
      if (css.trim()) this.styleBlocks.push(css.trim());
      return; // Do not create a text node for raw CSS
    }
    if (el.tagName === 'FIGURE') {
      const img = el.querySelector('img');
      if (img?.src) {
        const resId = this.builder.addImageResource(img.src);
        narrativeIds.push(this.builder.createImageNode(resId, el.querySelector('figcaption')?.textContent?.trim() || undefined, img.alt || undefined, 'standard'));
        this.media.add(img.src);
      }
      return;
    }
    if (el.tagName === 'IMG') {
      if (el.getAttribute('src')) {
        const src = el.getAttribute('src')!;
        const resId = this.builder.addImageResource(src);
        narrativeIds.push(this.builder.createImageNode(resId, undefined, el.getAttribute('alt') || undefined, 'standard'));
        this.media.add(src);
      }
      return;
    }
    if (el.tagName === 'P' || el.tagName === 'DIV') {
      // Preserve inner HTML; process anchors & images
      const workingDoc = new DOMParser().parseFromString(`<wrapper>${el.innerHTML}</wrapper>`, 'text/html');
      const wrapper = workingDoc.querySelector('wrapper')!;
      // Handle images: replace with tokens so we can keep order
      for (const img of Array.from(wrapper.querySelectorAll('img[src]'))) {
        const src = img.getAttribute('src')!;
        const alt = img.getAttribute('alt') || undefined;
        const resId = this.builder.addImageResource(src);
        const imgNodeId = this.builder.createImageNode(resId, undefined, alt, 'standard');
        this.media.add(src);
        img.replaceWith(workingDoc.createTextNode(`%%IMG:${imgNodeId}%%`));
      }
      for (const a of Array.from(wrapper.querySelectorAll('a[data-storymaps]'))) {
        const actionId = a.getAttribute('data-storymaps')!;
        const actionType = a.getAttribute('data-storymaps-type') || '';
        const label = (a.textContent || 'View').trim();
        const classAttr = a.getAttribute('class') || '';
        const classes = classAttr.split(/\s+/).filter(Boolean);
        const hasButtonClass = classes.some(c => this.BUTTON_CLASS_REGEX.test(c));
        if (actionType === 'media') {
          const btnId = this.builder.createActionButtonNode(label, 'wide');
          actionStubs.push({ actionId, text: label, buttonNodeId: btnId });
          a.replaceWith(workingDoc.createTextNode(`%%ACTION_BTN:${btnId}%%`));
        } else if (actionType === 'navigate') {
          if (hasButtonClass) {
            const btnId = this.builder.createButtonNode(label, 'wide');
            navigateButtonStubs.push({ actionId, buttonNodeId: btnId });
            a.replaceWith(workingDoc.createTextNode(`%%NAV_BTN:${btnId}%%`));
          } else {
            // Keep anchor inline; will add href later
            navigateInlineStubs.push({ actionId, richNodeId: '' }); // richNodeId assigned after node creation
          }
        }
      }
      const htmlWithTokens = wrapper.innerHTML;
      const segments = htmlWithTokens.split(/(%%IMG:[^%]+%%|%%ACTION_BTN:[^%]+%%|%%NAV_BTN:[^%]+%%)/);
      for (const seg of segments) {
        if (!seg) continue;
        if (/^%%IMG:/.test(seg)) {
          const id = seg.replace(/^%%IMG:/,'').replace(/%%$/,'');
          narrativeIds.push(id);
        } else if (/^%%ACTION_BTN:/.test(seg)) {
          const id = seg.replace(/^%%ACTION_BTN:/,'').replace(/%%$/,'');
          narrativeIds.push(id);
        } else if (/^%%NAV_BTN:/.test(seg)) {
          const id = seg.replace(/^%%NAV_BTN:/,'').replace(/%%$/,'');
          narrativeIds.push(id);
        } else {
          if (!this.isNonEmptyHtmlSegment(seg)) continue; // skip blank/whitespace-only segments
          const processedSeg = this.processHtmlColorsPreserveHtml(seg);
          // If segment contains multiple top-level paragraph tags, split into separate rich text nodes.
          const paraMatches = processedSeg.match(/<p[^>]*>[\s\S]*?<\/p>/gi);
          const multipleParas = paraMatches && paraMatches.length > 1;
          if (multipleParas) {
            for (const pHtml of paraMatches) {
              // Skip empty or &nbsp; only paragraphs
              const inner = pHtml.replace(/^<p[^>]*>|<\/p>$/gi,'').trim();
              const innerStripped = inner.replace(/&nbsp;|\s+/g,'').trim();
              if (!innerStripped) continue;
              // Strip outer <p> wrapper; viewer will wrap as paragraph automatically
              const richId = this.builder.createRichTextNode(inner, 'paragraph');
              if (pHtml.includes('data-storymaps')) {
                for (const stub of navigateInlineStubs) {
                  if (!stub.richNodeId && pHtml.includes(`data-storymaps="${stub.actionId}"`)) stub.richNodeId = richId;
                }
              }
              narrativeIds.push(richId);
            }
          } else {
            // Single segment: if wrapped in <p> remove wrapper so we store only inner markup
            let singleContent = processedSeg;
            const singleMatch = /^<p[^>]*>[\s\S]*?<\/p>$/.exec(processedSeg.trim());
            if (singleMatch) {
              singleContent = processedSeg.trim().replace(/^<p[^>]*>|<\/p>$/gi,'').trim();
            }
            const richId = this.builder.createRichTextNode(singleContent, 'paragraph');
            if (processedSeg.includes('data-storymaps')) {
              for (const stub of navigateInlineStubs) {
                if (!stub.richNodeId && processedSeg.includes(`data-storymaps="${stub.actionId}"`)) stub.richNodeId = richId;
              }
            }
            narrativeIds.push(richId);
          }
        }
      }
      return;
    }
    if (el.tagName === 'IFRAME') {
      const src = el.getAttribute('src');
      if (src) {
        const providerInfo = this.detectVideoProvider(src);
        if (providerInfo.provider !== 'unknown') {
          narrativeIds.push(this.builder.createVideoEmbedNode(src, providerInfo.provider, providerInfo.id));
          this.videoEmbedCount++;
        } else {
          narrativeIds.push(this.builder.createEmbedNode(src));
        }
      }
      return;
    }
    const fallback = el.textContent?.trim();
    if (fallback) narrativeIds.push(this.builder.createTextNode(fallback, 'paragraph'));
  }

  // Fallback parser for Node (preserves approximate order of major block elements and inline media/action anchors)
  private parseOrderedFallback(
    html: string,
    narrativeIds: string[],
    actionStubs: Array<{ actionId: string; text: string; buttonNodeId: string }>,
    navigateButtonStubs: Array<{ actionId: string; buttonNodeId: string }>,
    navigateInlineStubs: Array<{ actionId: string; richNodeId: string }>
  ): void {
    // Extract style blocks first so they aren't lost
    const styleRegex = /<style[^>]*>([\s\S]*?)<\/style>/gi;
    let sm: RegExpExecArray | null;
    while ((sm = styleRegex.exec(html)) !== null) {
      const css = sm[1].trim();
      if (css) this.styleBlocks.push(css);
    }
    const blockRegex = /(<figure[\s\S]*?<\/figure>)|(<img[^>]*>)|(<p[\s\S]*?<\/p>)|(<div[\s\S]*?<\/div>)|(<iframe[\s\S]*?<\/iframe>)/gi;
    let match: RegExpExecArray | null;
    while ((match = blockRegex.exec(html)) !== null) {
      const fragment = match[0];
      const tagStart = fragment.slice(0, 10).toLowerCase();
      if (tagStart.startsWith('<style')) {
        const css = fragment.replace(/^<style[^>]*>|<\/style>$/gi, '').trim();
        if (css) this.styleBlocks.push(css);
        continue;
      }
      if (tagStart.startsWith('<figure')) {
        const imgTag = /<img[^>]*>/i.exec(fragment)?.[0];
        if (imgTag) {
          const src = /src=["']([^"'>]+)["']/i.exec(imgTag)?.[1];
          if (src) {
            const alt = /alt=["']([^"'>]*)["']/i.exec(imgTag)?.[1];
            const cap = /<figcaption[^>]*>([\s\S]*?)<\/figcaption>/i.exec(fragment)?.[1];
            const resId = this.builder.addImageResource(src);
            narrativeIds.push(this.builder.createImageNode(resId, cap ? this.stripHtml(cap).trim() : undefined, alt, 'standard'));
            this.media.add(src);
          }
        }
        continue;
      }
      if (tagStart.startsWith('<img')) {
        const src = /src=["']([^"'>]+)["']/i.exec(fragment)?.[1];
        if (src) {
          const alt = /alt=["']([^"'>]*)["']/i.exec(fragment)?.[1];
          const resId = this.builder.addImageResource(src);
          narrativeIds.push(this.builder.createImageNode(resId, undefined, alt, 'standard'));
          this.media.add(src);
        }
        continue;
      }
      if (tagStart.startsWith('<iframe')) {
        const src = /src=["']([^"'>]+)["']/i.exec(fragment)?.[1];
        if (src) {
          const providerInfo = this.detectVideoProvider(src);
          if (providerInfo.provider !== 'unknown') {
            narrativeIds.push(this.builder.createVideoEmbedNode(src, providerInfo.provider, providerInfo.id));
            this.videoEmbedCount++;
          } else {
            narrativeIds.push(this.builder.createEmbedNode(src));
          }
        }
        continue;
      }
      if (tagStart.startsWith('<p') || tagStart.startsWith('<div')) {
        const inner = fragment.replace(/^<p[^>]*>|^<div[^>]*>|<\/p>$|<\/div>$/gi, '');
        // Replace images and anchors with tokens to preserve order
        let working = inner;
        // Images
        const imgRegex = /<img[^>]*src=["']([^"'>]+)["'][^>]*>/gi;
        let im: RegExpExecArray | null;
        while ((im = imgRegex.exec(inner)) !== null) {
          const tag = im[0];
          const src = im[1];
          const alt = /alt=["']([^"'>]*)["']/i.exec(tag)?.[1];
          const rId = this.builder.addImageResource(src);
          const imgNodeId = this.builder.createImageNode(rId, undefined, alt, 'standard');
          this.media.add(src);
          working = working.replace(tag, `%%IMG:${imgNodeId}%%`);
        }
        // Anchors
        const aRegex = /<a[^>]*data-storymaps=["']([^"'>]+)["'][^>]*>[\s\S]*?<\/a>/gi;
        let am: RegExpExecArray | null;
        while ((am = aRegex.exec(inner)) !== null) {
          const full = am[0];
          const actionId = am[1];
          const actionType = /data-storymaps-type=["']([^"'>]+)["']/i.exec(full)?.[1] || '';
          const labelRaw = full.replace(/<a[^>]*>|<\/a>/gi, '');
          const label = this.stripHtml(labelRaw).trim() || 'View';
          const classAttr = /class=["']([^"'>]+)["']/i.exec(full)?.[1] || '';
          const hasButtonClass = classAttr.split(/\s+/).some(c => this.BUTTON_CLASS_REGEX.test(c));
          if (actionType === 'media') {
            const btnId = this.builder.createActionButtonNode(label, 'wide');
            actionStubs.push({ actionId, text: label, buttonNodeId: btnId });
            working = working.replace(full, `%%ACTION_BTN:${btnId}%%`);
          } else if (actionType === 'navigate') {
            if (hasButtonClass) {
              const btnId = this.builder.createButtonNode(label, 'wide');
              navigateButtonStubs.push({ actionId, buttonNodeId: btnId });
              working = working.replace(full, `%%NAV_BTN:${btnId}%%`);
            } else {
              navigateInlineStubs.push({ actionId, richNodeId: '' });
            }
          }
        }
        const segments = working.split(/(%%IMG:[^%]+%%|%%ACTION_BTN:[^%]+%%|%%NAV_BTN:[^%]+%%)/);
        for (const seg of segments) {
          if (!seg) continue;
          if (/^%%IMG:/.test(seg)) {
            narrativeIds.push(seg.replace(/^%%IMG:/,'').replace(/%%$/,''));
          } else if (/^%%ACTION_BTN:/.test(seg)) {
            narrativeIds.push(seg.replace(/^%%ACTION_BTN:/,'').replace(/%%$/,''));
          } else if (/^%%NAV_BTN:/.test(seg)) {
            narrativeIds.push(seg.replace(/^%%NAV_BTN:/,'').replace(/%%$/,''));
          } else {
            if (!this.isNonEmptyHtmlSegment(seg)) continue; // skip blank/whitespace-only segments
            const processedSeg = this.processHtmlColorsPreserveHtml(seg);
            const paraMatches = processedSeg.match(/<p[^>]*>[\s\S]*?<\/p>/gi);
            const multipleParas = paraMatches && paraMatches.length > 1;
            if (multipleParas) {
              for (const pHtml of paraMatches) {
                const inner = pHtml.replace(/^<p[^>]*>|<\/p>$/gi,'').trim();
                const innerStripped = inner.replace(/&nbsp;|\s+/g,'').trim();
                if (!innerStripped) continue;
                const richId = this.builder.createRichTextNode(inner, 'paragraph');
                if (pHtml.includes('data-storymaps')) {
                  for (const stub of navigateInlineStubs) {
                    if (!stub.richNodeId && pHtml.includes(`data-storymaps="${stub.actionId}"`)) stub.richNodeId = richId;
                  }
                }
                narrativeIds.push(richId);
              }
            } else {
              let singleContent = processedSeg;
              const singleMatch = /^<p[^>]*>[\s\S]*?<\/p>$/.exec(processedSeg.trim());
              if (singleMatch) singleContent = processedSeg.trim().replace(/^<p[^>]*>|<\/p>$/gi,'').trim();
              const richId = this.builder.createRichTextNode(singleContent, 'paragraph');
              if (processedSeg.includes('data-storymaps')) {
                for (const stub of navigateInlineStubs) {
                  if (!stub.richNodeId && processedSeg.includes(`data-storymaps="${stub.actionId}"`)) stub.richNodeId = richId;
                }
              }
              narrativeIds.push(richId);
            }
          }
        }
        continue;
      }
      // Fallback plain text
      const text = this.stripHtml(fragment).trim();
      if (text) narrativeIds.push(this.builder.createTextNode(text, 'paragraph'));
    }
  }

  // Detect YouTube or Vimeo video provider and extract canonical video id
  private detectVideoProvider(url: string): { provider: 'youtube' | 'vimeo' | 'unknown'; id?: string } {
    if (!url) return { provider: 'unknown' };
    const ytMatch = /(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})(?:[&#?].*)?$/i.exec(url);
    if (ytMatch) {
      return { provider: 'youtube', id: ytMatch[1] };
    }
    const vimeoMatch = /(?:vimeo\.com\/(?:video\/)?)(\d+)(?:[&#?].*)?$/i.exec(url);
    if (vimeoMatch) {
      return { provider: 'vimeo', id: vimeoMatch[1] };
    }
    return { provider: 'unknown' };
  }
}
