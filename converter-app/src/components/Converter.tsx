/**
 * Classic StoryMap to ArcGIS StoryMaps Converter UI
 * Minimal form interface for conversion
 */
import { useState, useEffect, useRef, useCallback } from "react";
import { clearFetchCache, getFetchCacheSize, onFetchCacheChange, offFetchCacheChange } from "../utils/fetchCache";
import type { StoryMapJSON } from "../types/core";
import { validateWebMaps, type EndpointCheck } from "../services/WebMapValidator";
import { detectClassicTemplate } from "../util/detectTemplate";
import { useAuth } from "../auth/useAuth";
import { MapJournalConverter } from "../converters/MapJournalConverter";
import { SwipeConverter } from "../converters/SwipeConverter";
import { MediaTransferService } from "../media/MediaTransferService";
import { ResourceMapper } from "../media/ResourceMapper";
import { collectImageUrls, transferImage } from "../api/image-transfer";
import {
  getItemData,
  getItemDetails,
  findDraftResourceName,
  removeResource,
  addResource,
  updateItemKeywords,
  createDraftStory,
} from "../api/arcgis-client";

type Status =
  | "idle"
  | "fetching"
  | "converting"
  | "transferring"
  | "updating"
  | "error";

export default function Converter() {
  const [publishing, setPublishing] = useState(false);
  // retain state only for UI style and tooltip logic; reading ref for actual cancellation
  const cancelRequestedRef = useRef(false);
  const [hoverCancel, setHoverCancel] = useState(false);
  const [isMobile] = useState(false);
  // Declare core status-related state early to avoid TDZ access in effects
  const { token, userInfo } = useAuth();
  const [classicItemId, setClassicItemId] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");
  const [toast, setToast] = useState<string>("");
  const [convertedUrl, setConvertedUrl] = useState("");
  // buttonLabel retained for future extended messaging but currently unused
  const [buttonLabel, setButtonLabel] = useState("Convert");
  // Track cache presence reactively via fetchCache event emitter
  const [cacheSize, setCacheSize] = useState<number>(getFetchCacheSize());
  useEffect(() => {
    const listener = (size: number) => setCacheSize(size);
    onFetchCacheChange(listener);
    // Set initial in case of stale state
    setCacheSize(getFetchCacheSize());
    return () => offFetchCacheChange(listener);
  }, []);
  // Cancellation helper + handler declared early to avoid TDZ in effects
  const checkCancelled = () => {
    if (cancelRequestedRef.current) {
      throw new Error("Conversion cancelled by user intervention");
    }
  };
  const [cancelRequested, setCancelRequested] = useState(false);
  const handleCancel = useCallback(() => {
    if (cancelRequestedRef.current) return;
    const confirmed = window.confirm('Cancel conversion in progress? This will stop further processing.');
    // If user confirms, mark cancellation; otherwise do nothing
    if (confirmed) {
      cancelRequestedRef.current = true;
      setCancelRequested(true);
      setHoverCancel(false);
    }
  }, []);
  // Use real draft creation from API
  const [detectedTemplate, setDetectedTemplate] = useState<string | null>(null);
  const [customCssInfo, setCustomCssInfo] = useState<{ css: string; url: string } | null>(null);
  const [webmapWarnings, setWebmapWarnings] = useState<Array<{ itemId: string; level: string; message: string; details?: { webmapTitle?: string; failures?: Array<{ url: string; status?: number; error?: string; title?: string; layerItemId?: string; layerTitle?: string }> } }>>([]);
  // Cached organization base URL for building dynamic help links (resolved once per conversion)
  const DEFAULT_ORG_BASE = 'https://www.arcgis.com';
  const [orgBase, setOrgBase] = useState(DEFAULT_ORG_BASE);
  const prevTokenRef = useRef<string | null>(null);
  const portalResolvedRef = useRef<boolean>(false);
  // Indicates full validation cycle (client + optional backend diagnostics) is complete
  const [webmapChecksFinalized, setWebmapChecksFinalized] = useState(false);
  // Endpoint diagnostics are gathered but not displayed; omit state to avoid lint noise
  const [expandedWarnings, setExpandedWarnings] = useState<Record<string, boolean>>({});
  // Minimal type for converter-metadata resource access to avoid any casts
  type MinimalClassicMetadata = {
    mappingDecisions?: { customCss?: { combined?: string } };
    webmapVersionWarnings?: Array<{ itemId: string; message: string }>;
    webmapProtocolWarnings?: Array<{ itemId: string; message: string }>;
  };
  type MinimalConverterMetadataResource = { type: 'converter-metadata'; data: { classicMetadata?: MinimalClassicMetadata } };
  type WebmapWarning = { itemId: string; level: string; message: string; details?: { webmapTitle?: string; failures?: Array<{ url: string; status?: number; error?: string; title?: string; layerItemId?: string; layerTitle?: string }> } };
  const getOrgHostname = useCallback(() => {
    const ui = (typeof userInfo === 'object' && userInfo) ? (userInfo as unknown as { orgUrl?: string; org?: { url?: string } }) : {};
    const orgUrl = ui.orgUrl || ui.org?.url || '';
    // orgUrl may look like https://<org>.maps.arcgis.com
    try {
      if (typeof orgUrl === 'string' && orgUrl.length) {
        const u = new URL(orgUrl);
        const host = u.hostname;
        const m = /^(.*)\.maps\.arcgis\.com$/i.exec(host);
        if (m && m[1]) return `${m[1]}.maps.arcgis.com`;
        return host;
      }
    } catch {
      // ignore parse errors
    }
    return 'www.arcgis.com';
  }, [userInfo]);
  const normalizeWebmapWarnings = useCallback((
    warnings: Array<WebmapWarning>,
    base: string
  ): Array<WebmapWarning> => {
    // Prefer a resolved org base; fall back to hostname from userInfo
    const fallbackHost = getOrgHostname();
    const baseUsed = (base && base !== DEFAULT_ORG_BASE) ? base : `https://${fallbackHost}`;
    return warnings.map(w => {
      const id = w.itemId;
      const msg = w.message || '';
      // Version <2.0 pattern
      if (/version\s*([0-9]+(?:\.[0-9]+)?)\s*<\s*2\.0/i.test(msg)) {
        const formatted = `ERROR: Item [${id}] Unsupported web map version: You must update the web map to the latest version. You can do this by opening the map in <a href="${baseUsed}/home/webmap/viewer.html?webmap=${id}" target="_blank" rel="noopener noreferrer">Map Viewer Classic</a> and save it. No other changes are necessary to resolve this error.`;
        return { ...w, level: 'error', message: formatted };
      }
      // HTTP endpoints present → add actionable guidance
      if (/HTTP URL|http:\/\//i.test(msg)) {
        const guidance = `You must update the web map to use https service urls. You can do this by opening the web map item's <a href="${baseUsed}/home/item.html?id=${id}#settings" target="_blank" rel="noopener noreferrer">settings page</a> scrolling down to the Web map section and clicking the "Update layers to HTTPS" button`;
        const formatted = `WARNING: Webmap [${id}] uses http services.`;
        // Return combined message block with guidance below
        return { ...w, message: `${formatted}\n${guidance}` };
      }
      // Generic pattern: replace 'Map Viewer Classic <link = URL>' with anchor
      const linkMatch = /Map Viewer Classic\s*<\s*link\s*=\s*(https?:[^\s>]+)\s*>/i.exec(msg);
      if (linkMatch) {
        const url = linkMatch[1];
        const replaced = msg.replace(linkMatch[0], `<a href="${url}" target="_blank" rel="noopener noreferrer">Map Viewer Classic</a>`);
        return { ...w, message: replaced };
      }
      // Replace org placeholder if present
      if (/https:\/\/<org_url>\.arcgis\.com/i.test(msg)) {
        const replaced = msg.replace(/https:\/\/<org_url>\.arcgis\.com/gi, baseUsed);
        return { ...w, message: replaced };
      }
      // Replace default base with org base if still present
      if (/https:\/\/www\.arcgis\.com/i.test(msg) && baseUsed && baseUsed !== DEFAULT_ORG_BASE) {
        const replaced = msg.replace(/https:\/\/www\.arcgis\.com/gi, baseUsed);
        return { ...w, message: replaced };
      }
      return w;
    });
  }, [getOrgHostname]);
  const makeItemUrl = (itemId?: string) => {
    if (!itemId) return '';
    const host = getOrgHostname();
    if (/^[a-f0-9]{32}$/i.test(itemId)) return `https://${host}/home/item.html?id=${itemId}`;
    return '';
  };
  // Invalidate orgBase cache when token is removed or changes to force re-resolution on next conversion
  useEffect(() => {
    if (!token) {
      setOrgBase(DEFAULT_ORG_BASE);
      prevTokenRef.current = null;
      portalResolvedRef.current = false;
      return;
    }
    if (prevTokenRef.current && prevTokenRef.current !== token) {
      setOrgBase(DEFAULT_ORG_BASE);
      portalResolvedRef.current = false;
    }
    prevTokenRef.current = token;
  }, [token]);

  // Resolve organization base URL from userInfo immediately when available (prevents default base in warnings)
  useEffect(() => {
    try {
      // Compute host from userInfo (e.g., story.maps.arcgis.com or <org>.maps.arcgis.com)
      const host = getOrgHostname();
      const resolved = `https://${host}`;
      // Respect explicit override first
      if (token && resolved && orgBase !== resolved) {
        setOrgBase(resolved);
      }
    } catch {
      // ignore resolution errors
    }
    // Re-run when auth changes or org info updates
  }, [token, userInfo, orgBase, getOrgHostname]);

  // Prefer portal-derived base (urlKey.customBaseUrl) when available; resolve once per auth session
  useEffect(() => {
    if (!token || portalResolvedRef.current) return;
    (async () => {
      try {
        // Respect explicit override; skip portal resolution if provided
        const resp = await fetch(`https://www.arcgis.com/sharing/rest/portals/self?f=json&token=${encodeURIComponent(token)}`);
        if (!resp.ok) return;
        const portalJson = await resp.json();
        const urlKey = portalJson?.urlKey;
        const customBaseUrl = portalJson?.customBaseUrl;
        let resolvedOrg = '';
        if (urlKey && customBaseUrl) {
          resolvedOrg = `https://${urlKey}.${customBaseUrl}`;
        } else if (portalJson?.portalHostname) {
          const ph = portalJson.portalHostname as string;
          resolvedOrg = /^https?:/i.test(ph) ? ph : `https://${ph}`;
        }
        if (resolvedOrg && orgBase !== resolvedOrg) {
          setOrgBase(resolvedOrg);
        }
      } catch {
        // ignore portal self fetch errors
      }
      finally {
        portalResolvedRef.current = true;
      }
    })();
  }, [token, orgBase]);

  // Re-normalize existing warnings once orgBase resolves to an org domain
  useEffect(() => {
    if (!webmapWarnings.length) return;
    if (orgBase && orgBase !== DEFAULT_ORG_BASE) {
      setWebmapWarnings(prev => prev.map(w => ({
        ...w,
        message: (w.message || '').replace(/https:\/\/www\.arcgis\.com/gi, orgBase)
      })));
    }
  }, [orgBase, webmapWarnings.length]);
  // Classic item id must be 32 hex characters
  const isValidClassicId = (id: string): boolean => /^[a-f0-9]{32}$/i.test(id.trim());
  // Ensure org base is resolved before producing warnings (synchronous guard)
  const ensureOrgBaseResolved = useCallback(async (): Promise<string> => {
    // If already resolved away from default, use it
    if (orgBase && orgBase !== DEFAULT_ORG_BASE) return orgBase;
    // Try userInfo-derived host immediately
    const host = getOrgHostname();
    let candidate = `https://${host}`;
    // If still default and we have a token, resolve via portals/self
    if (token && /www\.arcgis\.com$/i.test(host)) {
      try {
        const resp = await fetch(`https://www.arcgis.com/sharing/rest/portals/self?f=json&token=${encodeURIComponent(token)}`);
        if (resp.ok) {
          const portalJson = await resp.json();
          const urlKey = portalJson?.urlKey;
          const customBaseUrl = portalJson?.customBaseUrl;
          if (urlKey && customBaseUrl) {
            candidate = `https://${urlKey}.${customBaseUrl}`;
          } else if (portalJson?.portalHostname) {
            const ph = portalJson.portalHostname as string;
            candidate = /^https?:/i.test(ph) ? ph : `https://${ph}`;
          }
        }
      } catch {
        // ignore portal self fetch errors
      }
    }
    if (candidate && candidate !== orgBase) setOrgBase(candidate);
    return candidate;
  }, [orgBase, token, getOrgHostname]);
    const handleConvert = async () => {
      // Reset state
      setStatus("idle");
      setMessage("");
      setConvertedUrl("");
      setButtonLabel("Convert");
      cancelRequestedRef.current = false;
      setCancelRequested(false);
      // Clear previous webmap checks UI state so it doesn't persist into new run
      setWebmapWarnings([]);
      setWebmapChecksFinalized(false);
      setExpandedWarnings({});
      if (customCssInfo?.url) URL.revokeObjectURL(customCssInfo.url);
      setCustomCssInfo(null);

      // Validate classic item id format first
      if (!isValidClassicId(classicItemId)) {
        setStatus("error");
        setMessage("Incorrect Classic Story Map item id format - please enter a 32 character hex string");
        return;
      }

      // Validate token
      if (!token) {
        setStatus("error");
        setMessage("You must be signed in to ArcGIS Online or ArcGIS Enterprise");
        return;
      }

      try {
        // Get username
        setStatus("fetching");
        setMessage("Getting user information...");
        const username = userInfo?.username || "";

        // Fetch classic item data
        setMessage("Fetching classic story data...");
        const classicData = await getItemData(classicItemId, token);
        checkCancelled();

        // Soft guard: proceed even if shape varies; downstream checks use optional chaining

        // Detect template type early for messaging (store in local runtime variable to avoid stale state)
        let runtimeTemplate: string | null = null;
        try {
          runtimeTemplate = detectClassicTemplate(classicData);
        } catch {
          runtimeTemplate = null;
        }
        // Fallback: if detector returns 'unknown', try item details keywords
        if (!runtimeTemplate || runtimeTemplate.toLowerCase() === 'unknown') {
          try {
            const details = await getItemDetails(classicItemId, token);
            const kws: string[] = Array.isArray(details?.typeKeywords) ? details.typeKeywords : [];
            const typeStr = String(details?.type || '').toLowerCase();
            const text = [typeStr, ...(kws.map(k => String(k).toLowerCase()))].join(' ');
            const mapName = () => {
              if (/journal/.test(text)) return 'Map Journal';
              if (/swipe/.test(text)) return 'Swipe';
              if (/tour/.test(text)) return 'Map Tour';
              if (/series/.test(text)) return 'Map Series';
              if (/cascade/.test(text)) return 'Cascade';
              if (/shortlist/.test(text)) return 'Shortlist';
              if (/crowdsource/.test(text)) return 'Crowdsource';
              if (/basic/.test(text)) return 'Basic';
              return null;
            };
            const mapped = mapName();
            if (mapped) runtimeTemplate = mapped;
          } catch {
            // ignore fallback errors
          }
        }
        setDetectedTemplate(runtimeTemplate);
        if (runtimeTemplate) {
          setMessage(`Detected template: ${runtimeTemplate}. Preparing resources...`);
        }

        // Fetch classic webmap data
        if (classicData.values?.webmap) {
          setMessage("Fetching classic webmap data...");
          const webmapId = classicData.values?.webmap;
          classicData.webmapJson = await getItemData(webmapId, token);
          checkCancelled();
        }

        // Create an empty draft StoryMap
        setMessage("Creating new StoryMap draft...");
        const coverTitle = classicData.values?.title || "Untitled Story";
        const itemTitle = `(Converted) ${coverTitle}`;
        const targetStoryId = await createDraftStory(username, token, itemTitle);
        checkCancelled();

        // Determine base theme (summit/obsidian) will be applied inline with overrides during conversion
        setMessage("Converting theme...");

        // Gather webmap ids for validation (from classic JSON and embedded swipes)
        const webmapIdsUnfiltered: string[] = [];
        if (classicData.values?.webmap) webmapIdsUnfiltered.push(classicData.values.webmap);
        // Initialize progress UI for webmap fetching/validation
        const webmapLabel = runtimeTemplate || detectedTemplate || "webmap";
        setStatus("fetching");
        setButtonLabel(`Fetching ${webmapLabel}...`);
        try {
          const sections = (classicData.values?.story?.sections || classicData.sections || []) as Array<{ media?: { webmap?: { id?: string }, webpage?: { url?: string } }, contentActions?: Array<{ id: string; type: string; media?: { webpage?: { url?: string } } }> }>;
          for (const s of sections) {
            if (s?.media?.webmap?.id) webmapIdsUnfiltered.push(s.media!.webmap!.id as string);
            const url = s?.media?.webpage?.url || '';
            // Parse appid from embedded classic swipe
            const m = /[?&#](?:appid|appId)=([a-f0-9]{32})/i.exec(String(url));
            const appId = m?.[1];
            if (appId) {
              try {
                const base = `https://www.arcgis.com/sharing/rest/content/items/${appId}/data?f=json`;
                const swipeUrl = token ? `${base}&token=${encodeURIComponent(token)}` : base;
                const resp = await fetch(swipeUrl);
                if (resp.ok) {
                  const swipeJson = await resp.json();
                  const wm = Array.isArray(swipeJson?.values?.webmaps) ? swipeJson.values.webmaps : [];
                  for (const wid of wm) if (typeof wid === 'string') webmapIdsUnfiltered.push(wid);
                  // Cache embedded swipe JSON for converter to build inline swipe in browser
                  try {
                    const key = String(appId);
                    const container = classicData as unknown as { __embeddedSwipes?: Record<string, unknown> };
                    if (!container.__embeddedSwipes) container.__embeddedSwipes = {} as Record<string, unknown>;
                    container.__embeddedSwipes[key] = swipeJson as unknown as object;
                  } catch { /* ignore cache errors */ }
                }
              } catch {
                // ignore
              }
            }

            // Also prefetch classic Swipe JSON referenced in contentActions (media actions)
            const acts = Array.isArray(s?.contentActions) ? s.contentActions : [];
            for (const act of acts) {
              if (act && act.type === 'media' && act.media && act.media.webpage && act.media.webpage.url) {
                const aUrl = String(act.media.webpage.url || '');
                const ma = /[?&#](?:appid|appId)=([a-f0-9]{32})/i.exec(aUrl);
                const aAppId = ma?.[1];
                if (aAppId) {
                  try {
                    const base = `https://www.arcgis.com/sharing/rest/content/items/${aAppId}/data?f=json`;
                    const swipeUrl = token ? `${base}&token=${encodeURIComponent(token)}` : base;
                    const resp = await fetch(swipeUrl);
                    if (resp.ok) {
                      const swipeJson = await resp.json();
                      const wm = Array.isArray(swipeJson?.values?.webmaps) ? swipeJson.values.webmaps : [];
                      for (const wid of wm) if (typeof wid === 'string') webmapIdsUnfiltered.push(wid);
                      try {
                        const key = String(aAppId);
                        const container = classicData as unknown as { __embeddedSwipes?: Record<string, unknown> };
                        if (!container.__embeddedSwipes) container.__embeddedSwipes = {} as Record<string, unknown>;
                        container.__embeddedSwipes[key] = swipeJson as unknown as object;
                      } catch { /* ignore cache errors */ }
                    }
                  } catch {
                    // ignore
                  }
                }
              }
            }
          }
        } catch {
          // ignore section parse errors
        }

        // Dedupe webmap IDs while preserving first-seen order
        const seen = new Set<string>();
        const webmapIds: string[] = [];
        for (const wid of webmapIdsUnfiltered) {
          const id = String(wid);
          if (!seen.has(id)) { seen.add(id); webmapIds.push(id); }
        }

        // Validate webmaps client-side with per-item progress updates
        let localWarnings: typeof webmapWarnings = [];
        try {
          const baseForRun = await ensureOrgBaseResolved();
          if (webmapIds.length > 0) {
            for (let i = 0; i < webmapIds.length; i++) {
              // Respect user cancellation promptly
              if (cancelRequestedRef.current) throw new Error('Conversion cancelled by user intervention');
              const wid = webmapIds[i];
              setMessage(`Fetching webmap ${wid} ${i + 1} of ${webmapIds.length}...`);
              const { warnings } = await validateWebMaps([wid], token);
              const formatted = warnings.map(w => ({ itemId: w.itemId, level: w.level as string, message: w.message, details: (w && typeof w === 'object' && 'details' in w ? (w as unknown as { details?: { webmapTitle?: string; failures?: Array<{ url: string; status?: number; error?: string; title?: string; layerItemId?: string; layerTitle?: string }> } }).details : undefined) }));
              const normalized = normalizeWebmapWarnings(formatted, baseForRun);
              if (normalized.length) {
                localWarnings = [...localWarnings, ...normalized];
                setWebmapWarnings([...localWarnings]);
              }
            }
          }
          // Mark checks finalized if any warnings were found or if we processed all items
          setWebmapChecksFinalized(true);
        } catch {
          // ignore local validation errors
        }

        // If no failures detected locally, attempt backend diagnostics (serverless avoids CORS and gathers full layer info)
        // Temporarily disabled when Netlify function responds 501 locally; continue conversion without backend diagnostics
        const enableBackendDiagnostics = false;
        if (!cancelRequestedRef.current && localWarnings.length === 0 && enableBackendDiagnostics) {
          try {
            setMessage("Running backend diagnostics...");
            const diagUrl = `/.netlify/functions/convert-mapjournal?itemId=${classicItemId}&diagnostics=1${token ? `&token=${encodeURIComponent(token)}` : ''}`;
            const resp = await fetch(diagUrl);
            if (resp.ok) {
              const json = await resp.json();
              const v = json?.validation || {};
              const backendWarnings = Array.isArray(v.warnings) ? v.warnings : [];
              const backendEndpointChecks: EndpointCheck[] = Array.isArray(v.endpointChecks) ? v.endpointChecks : [];
              // const backendSummary: Record<string, number> | null = v.endpointCategorySummary || null;
              if (backendWarnings.length || backendEndpointChecks.some(ec => !ec.ok)) {
                  const baseForRun = await ensureOrgBaseResolved();
                const formattedWarnings = normalizeWebmapWarnings(
                  backendWarnings.map((w: { itemId: string; level: string; message: string; details?: { webmapTitle?: string; failures?: Array<{ url: string; status?: number; error?: string; title?: string; layerItemId?: string; layerTitle?: string }> } }) => ({ itemId: w.itemId, level: w.level, message: w.message, details: w.details })),
                    baseForRun
                );
                setWebmapWarnings(formattedWarnings);
                // Endpoint diagnostics are not rendered in UI
              }
            }
          } catch {
            // ignore backend diagnostics failure
          } finally {
            setWebmapChecksFinalized(true);
          }
        }
        if (localWarnings.length > 0) {
          // Ensure finalized if we skipped backend diagnostics due to existing warnings
          setWebmapChecksFinalized(true);
        }

        // Convert to new JSON via new converters
        setStatus("converting");
        const templateLabel = runtimeTemplate || detectedTemplate || "story";
        setButtonLabel(`Converting ${templateLabel}: ${coverTitle}...`);
        setMessage(`Converting ${templateLabel} story to new format...`);

        let newStorymapJson: StoryMapJSON;
        const progress = (e: { stage: 'fetch' | 'detect' | 'draft' | 'convert' | 'media' | 'finalize' | 'done' | 'error'; message: string; current?: number; total?: number }) => {
          const alreadyHasCount = /\(\s*\d+\s*\/\s*\d+\s*\)\s*$/.test(e.message);
          const msg = (typeof e.total === 'number' && typeof e.current === 'number' && !alreadyHasCount)
            ? `${e.message} (${e.current}/${e.total})`
            : e.message;
          switch (e.stage) {
            case 'media': setStatus('transferring'); setMessage(msg); break;
            case 'convert': setStatus('converting'); setMessage(msg); break;
            case 'finalize': setStatus('updating'); setMessage(msg); break;
            case 'error': setStatus('error'); setMessage(msg); break;
            case 'done': setStatus('success'); setMessage(msg); break;
            default: setMessage(msg);
          }
        };
        const tmpl = (detectedTemplate || runtimeTemplate || '').toLowerCase();
        if (tmpl === 'map journal' || tmpl === 'mapjournal') {
          const conv = new MapJournalConverter({
            classicJson: classicData,
            themeId: 'summit',
            progress,
            token
          });
            const result = conv.convert();
            newStorymapJson = result.storymapJson;
        } else if (tmpl === 'swipe') {
          const conv = new SwipeConverter({
            classicJson: classicData,
            themeId: 'summit',
            progress,
            token
          });
            const result = conv.convert();
            newStorymapJson = result.storymapJson;
        } else {
          throw new Error(`Unsupported template for new converters: ${detectedTemplate ?? 'unknown'}`);
        }
        checkCancelled();

        // Transfer images to target story resources and rewrite resource entries
        try {
          setStatus('transferring');
          setMessage('Transferring images to story resources...');
          const imageUrls = collectImageUrls(newStorymapJson);
          if (imageUrls.length) {
            const uploader = async (url: string, storyId: string, username: string, token: string) => {
              const r = await transferImage(url, storyId, username, token);
              return { originalUrl: r.originalUrl, resourceName: r.resourceName, transferred: r.isTransferred };
            };
            const mediaMapping = await MediaTransferService.transferBatch({
              urls: imageUrls,
              storyId: targetStoryId,
              username,
              token,
              progress,
              uploader
            });
            newStorymapJson = ResourceMapper.apply(newStorymapJson, mediaMapping);
          }
        } catch (err) {
          console.warn('[Converter] Image transfer step failed or skipped:', err);
        }

        // Extract custom CSS (if any) from converter-metadata decisions
        try {
          const storyJson = newStorymapJson as unknown as { resources?: Record<string, MinimalConverterMetadataResource | { type?: string }> };
          const metadataRes = storyJson.resources && (Object.values(storyJson.resources).find((r) => r.type === 'converter-metadata') as MinimalConverterMetadataResource | undefined);
          const cssCombined = metadataRes?.data?.classicMetadata?.mappingDecisions?.customCss?.combined;
          if (cssCombined) {
            const blob = new Blob([cssCombined], { type: 'text/css' });
            const url = URL.createObjectURL(blob);
            setCustomCssInfo({ css: cssCombined, url });
          }
          // Surface webmap version warnings (added during enrichment) if present.
          const versionWarnings = metadataRes?.data?.classicMetadata?.webmapVersionWarnings;
          const protocolWarnings = metadataRes?.data?.classicMetadata?.webmapProtocolWarnings;
          const allWarnings: Array<{ itemId: string; message: string }> = [];
          // Use cached orgBase resolved earlier (portal-derived when available)
          const resolvedOrgBase = orgBase;
          if (Array.isArray(versionWarnings)) allWarnings.push(...versionWarnings);
          if (Array.isArray(protocolWarnings)) allWarnings.push(...protocolWarnings);
          if (allWarnings.length) {
            // Replace placeholder base in messages
            const replaced = allWarnings.map(w => ({
              itemId: w.itemId,
              message: w.message.replace(/https:\/\/<org_url>\.arcgis\.com/gi, resolvedOrgBase)
            }));
            setWebmapWarnings(prev => {
              const merged = [...prev];
              for (const w of replaced) {
                if (!merged.some(existing => existing.itemId === w.itemId && existing.message === w.message)) {
                  merged.push({ itemId: w.itemId, level: 'warning', message: w.message });
                }
              }
              return merged;
            });
          }
        } catch {
          // ignore
        }

        // Persist webmap warnings into converter-metadata resource for later visibility
        try {
          if (Array.isArray(webmapWarnings) && webmapWarnings.length) {
            const storyJson = newStorymapJson as unknown as { resources?: Record<string, { type?: string; data?: Record<string, unknown> }> };
            const resources = storyJson.resources || {};
            const foundEntry = Object.entries(resources).find(([, r]) => r && r.type === 'converter-metadata');
            if (foundEntry) {
              const [resId, resObj] = foundEntry as [string, { type?: string; data?: Record<string, unknown> }];
              const data = (resObj.data || {}) as Record<string, unknown>;
              const classicMeta = ((data.classicMetadata || {}) as Record<string, unknown>);
              classicMeta.webmapChecks = webmapWarnings.map(w => ({ itemId: w.itemId, level: w.level, message: w.message }));
              data.classicMetadata = classicMeta;
              resObj.data = data;
              resources[resId] = resObj;
              storyJson.resources = resources;
            } else {
              const resId = `r-converter-metadata-${Date.now()}`;
              const resource: { type: string; data: Record<string, unknown> } = {
                type: 'converter-metadata',
                data: {
                  classicMetadata: {
                    webmapChecks: webmapWarnings.map(w => ({ itemId: w.itemId, level: w.level, message: w.message }))
                  }
                }
              };
              resources[resId] = resource;
              storyJson.resources = resources;
            }
          }
        } catch {
          // ignore
        }

        // Fetch target draft details
        setStatus("updating");
        setMessage("Fetching target storymap details...");
        const targetDetails = await getItemDetails(targetStoryId, token);
        checkCancelled();

        // Find draft resource name
        let draftResourceName = findDraftResourceName(targetDetails);
        if (!draftResourceName) {
          // Initialize a draft resource name and attach keyword for first-time items created via addItem
          draftResourceName = 'draft.json';
          try {
            const currentKeywords = Array.isArray((targetDetails as { typeKeywords?: string[] }).typeKeywords)
              ? (targetDetails as { typeKeywords?: string[] }).typeKeywords!
              : [];
            const withDraft = currentKeywords.some(k => /^smdraftresourceid:/.test(String(k)))
              ? currentKeywords
              : [...currentKeywords, `smdraftresourceid:${draftResourceName}`];
            await updateItemKeywords(targetStoryId, username, withDraft, token);
          } catch {
            // ignore keyword update failure; upload will still proceed
          }
        }

        // Remove old draft resource
        // Attempt removal; if resource doesn't exist yet, ignore errors
        setMessage(`Removing old draft resource (${draftResourceName})...`);
        try {
          await removeResource(targetStoryId, username, draftResourceName, token);
        } catch {
          // Ignore missing resource errors on first draft initialization
        }
        checkCancelled();

        // Upload new draft resource (same name)
        setMessage(`Uploading new draft resource (${draftResourceName})...`);
        // Schema cleanup: strip temporary dependents added for swipe content retention
        try {
          const storyJson = newStorymapJson as unknown as { nodes?: Record<string, { type?: string; data?: Record<string, unknown>; config?: Record<string, unknown>; dependents?: Record<string, string> }> };
          const nodes = storyJson.nodes || {};
          for (const [, node] of Object.entries(nodes)) {
            if (node?.type === 'action-button' && node.dependents) {
              for (const k of Object.keys(node.dependents)) {
                if (/^actionMedia_content_/.test(k)) {
                  delete node.dependents[k];
                }
              }
              if (Object.keys(node.dependents).length === 0) delete (node as { dependents?: Record<string, string> }).dependents;
            }
          }
        } catch {
          // ignore cleanup failures
        }
        const jsonBlob = new Blob([JSON.stringify(newStorymapJson)], {
          type: "application/json",
        });
        await addResource(
          targetStoryId,
          username,
          jsonBlob,
          draftResourceName,
          token
        );
        checkCancelled();

        // Update keywords to add smconverter:online-app
        setMessage("Updating keywords...");
        const currentKeywords = targetDetails.typeKeywords || [];
        if (!currentKeywords.includes("smconverter:online-app")) {
          const newKeywords = [...currentKeywords, "smconverter:online-app"];
          await updateItemKeywords(targetStoryId, username, newKeywords, token);
          checkCancelled();
        }

        // Success!
        checkCancelled();
        setStatus("success");
        setMessage("Classic " + templateLabel + ":  " + coverTitle);
        setConvertedUrl(`https://storymaps.arcgis.com/stories/${targetStoryId}/edit`);
        setPublishing(true);

        // Promote enrichment to top-level resource data if present in initialState (defensive guard)
        try {
          const sj = newStorymapJson as unknown as { resources?: Record<string, { type?: string; data?: Record<string, unknown> }> };
          const resources = sj.resources || {};
          for (const [rid, res] of Object.entries(resources)) {
            if (res?.type === 'webmap') {
              const d = (res.data || {}) as Record<string, unknown>;
              const ist = (d.initialState || {}) as Record<string, unknown>;
              // Copy known fields to top-level if missing
              for (const k of ['extent','center','viewpoint','mapLayers'] as const) {
                if (ist && k in ist && !(k in d)) {
                  (d as Record<string, unknown>)[k as string] = ist[k as string];
                }
              }
              res.data = d;
              resources[rid] = res;
            }
          }
          sj.resources = resources;
          newStorymapJson = sj as unknown as typeof newStorymapJson;
          console.debug('[SaveGuard] Promoted initialState fields to resource data keys');
        } catch {
          // ignore promotion failures
        }

        // Save a local copy of converted JSON to tmp-converted via Netlify function (during netlify dev)
        try {
          const res = await fetch('/.netlify/functions/save-converted', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              filename: `converted-app`,
              storyId: targetStoryId,
              classicItemId,
              json: newStorymapJson
            })
          });
          if (res.ok) {
            const info = await res.json();
            console.info('[LocalSave] Converted JSON saved:', info?.path || info?.fileName || 'ok');
          } else {
            console.warn('[LocalSave] Failed to save converted JSON locally:', res.status);
          }
        } catch {
          console.warn('[LocalSave] Error saving converted JSON locally:', (e as Error)?.message);
        }
      } catch (error: unknown) {
        if (error instanceof Error && error.message === "Conversion cancelled by user intervention") {
          // Already set via handleCancel; ensure status stays error
          setStatus("error");
          setMessage(error.message);
        } else {
          setStatus("error");
          setMessage(error instanceof Error ? error.message : "An unknown error occurred");
        }
        // Log stack for debugging if available
        if (error instanceof Error && error.stack) {
          console.debug('[ConverterCatch]', error.stack);
        }
        setPublishing(false);
      }
    };
  return (
    <div className="converter-container">
      
      <h2>Classic Story Map Converter</h2>
      <p>Convert Classic Esri Story Maps to <a href="https://storymaps.arcgis.com" target="_blank" rel="noopener noreferrer">ArcGIS StoryMaps</a></p>
      <div className="converter-instructions">
        <h3>Instructions:</h3>
        <ol>
          <li>Sign in to ArcGIS Online using the sign-in button above.</li>
          <li>Enter the Item ID of your Classic Story</li>
          <li>Click Convert to transform your classic story into the new format</li>
          <li>Review the converted story and publish when ready</li>
        </ol>
      </div>
      <div className="converter-input-group">
        <label className="converter-label">Classic Story Item ID:</label>
        <input
          type="text"
          value={classicItemId}
          onChange={(e) => setClassicItemId(e.target.value)}
          placeholder="e.g., 858c4126f0604d1a86dea06ffbdc23a3"
          className="converter-input"
        />
      </div>
      <div className="converter-controls-row">
        <button
          className={`converter-btn ${cacheSize > 0 ? 'secondary' : 'disabled'}`}
          onClick={() => { if (cacheSize > 0) { clearFetchCache(); setToast('Cache cleared'); setTimeout(() => setToast(''), 2000); } }}
          title={cacheSize > 0 ? 'Clear in-memory fetch cache' : 'Cache is empty'}
          disabled={cacheSize === 0}
        >
          Clear cached webmap/story data
        </button>
      </div>
      {status !== "success" ? (
        <button
          className={`converter-btn ${hoverCancel && ['fetching','converting','transferring','updating'].includes(status) ? 'cancel-hover' : ''}`}
          title={status === 'idle' || status === 'error' ? 'Start conversion' : (hoverCancel ? 'Cancel conversion (Esc)' : 'Conversion in progress')}
          onClick={status === 'idle' || status === 'error' ? handleConvert : handleCancel}
          onMouseEnter={() => { if (!isMobile && ['fetching','converting','transferring','updating'].includes(status)) setHoverCancel(true); }}
          onMouseLeave={() => setHoverCancel(false)}
          disabled={publishing}
        >
          {(() => {
            if (status === 'idle' || status === 'error') return 'Convert';
            if (hoverCancel && ['fetching','converting','transferring','updating'].includes(status)) return 'Cancel';
            // Restore buttonLabel behavior
            return buttonLabel;
          })()}
        </button>
      ) : (
        <div className="converter-message converter-message-success">
          <strong>Converted </strong> {message || "Conversion complete!"}
        </div>
      )}
      {isMobile && status !== 'idle' && status !== 'error' && status !== 'success' && !cancelRequestedRef.current && !cancelRequested && (
        <div className="cancel-mobile-wrapper">
          <button
            className="converter-btn cancel-mobile"
            onClick={handleCancel}
            title="Cancel conversion"
          >
            Cancel
          </button>
        </div>
      )}
      {status !== "success" && message && (
        <div className={`converter-message converter-message-${status}`}>
          <strong>
            {status === "error" ? "Error:" : "Status:"}
          </strong> {message}
        </div>
      )}
      {!!toast && (
        <div className="converter-toast" role="status" aria-live="polite">{toast}</div>
      )}
      {customCssInfo && (
        <div className="converter-warning">
          <strong>Custom CSS Detected!</strong> Your classic story used custom CSS settings. To recreate your custom styles you should create a new ArcGIS StoryMaps Theme <a href="https://storymaps.arcgis.com/themes/new" target="_blank" rel="noopener noreferrer">here</a> with your custom colors and styles, then apply the new Theme within the ArcGIS StoryMaps Builder (under the Design tab). <a href={customCssInfo.url} download="custom-css.css">Click this link</a> to download a copy of your custom CSS.
        </div>
      )}
      {convertedUrl && (
        <div className="converter-publish">
          <button
            className="converter-publish-btn"
            onClick={() => {
              window.open(convertedUrl, '_blank');
              setStatus("idle");
              setMessage("");
              setPublishing(false);
              setConvertedUrl("");
            }}
            disabled={!publishing}
          >
            Click to Finish Publishing →
          </button>
          <div className="converter-url-row">
            <span className="converter-url-label">Publishing URL:</span>{' '}
            <a href={convertedUrl} target="_blank" rel="noopener noreferrer" className="converter-url-link">{convertedUrl}</a>
          </div>
        </div>
      )}
      {(webmapWarnings.length > 0 || webmapChecksFinalized) && (
        <div className="converter-warning">
          <strong>Webmap Checks:</strong>
          {webmapWarnings.length === 0 ? (
            <div>No issues detected for referenced webmaps.</div>
          ) : (
            <>
              <ul>
                {webmapWarnings.map((w, i) => {
                  const failures = Array.isArray(w.details?.failures) ? w.details!.failures! : [];
                  const dedupMap = new Map<string, { layerTitle?: string; layerItemId?: string; url?: string; status?: number; error?: string }>();
                  for (const f of failures) {
                    const key = `${f.url ?? ''}::${f.layerTitle ?? ''}`;
                    if (!dedupMap.has(key)) dedupMap.set(key, {
                      layerTitle: f.layerTitle,
                      layerItemId: f.layerItemId,
                      url: f.url,
                      status: typeof f.status === 'number' ? f.status : undefined,
                      error: typeof f.error === 'string' ? f.error : undefined,
                    });
                  }
                  const consolidatedFailures = Array.from(dedupMap.values());
                  const hasHttpIssues = consolidatedFailures.some(f => /HTTP URL/i.test(String(f.error || '')) || /^http:\/\//i.test(String(f.url || '')));
                  const hasTimeouts = consolidatedFailures.some(f => /timeout/i.test(String(f.error || '')) || (typeof f.status === 'number' && f.status === 504));
                  const hasNotFound = consolidatedFailures.some(f => /not\s*found|404/i.test(String(f.error || '')) || (typeof f.status === 'number' && f.status === 404));
                  // Derive best org base: prefer resolved orgBase; else parse from userInfo.orgUrl; else hostname; else www
                  let hostBase = orgBase;
                  if (!hostBase || hostBase === DEFAULT_ORG_BASE) {
                    const rawOrg = (typeof userInfo === 'object' && userInfo)
                      ? ((userInfo as unknown as { orgUrl?: string; org?: { url?: string } }).orgUrl || (userInfo as unknown as { orgUrl?: string; org?: { url?: string } }).org?.url || '')
                      : '';
                    if (rawOrg) {
                      try {
                        const u = new URL(rawOrg);
                        hostBase = `${u.protocol}//${u.hostname}`;
                      } catch {
                        // fallback to hostname util
                        hostBase = `https://${getOrgHostname()}`;
                      }
                    } else {
                      hostBase = `https://${getOrgHostname()}`;
                    }
                  }
                  const guidanceHtml = `You must update the web map to use https service urls. You can do this by opening the web map item's <a href="${hostBase}/home/item.html?id=${w.itemId}#settings" target="_blank" rel="noopener noreferrer">settings page</a> scrolling down to the Web map section and clicking the "Update layers to HTTPS" button`;
                  const timeoutGuidanceHtml = `Some services did not respond (timeout). This may be temporary. Try opening the <a href="${hostBase}/home/item.html?id=${w.itemId}" target="_blank" rel="noopener noreferrer">web map</a> and checking that the layers load, or reload later. If timeouts persist, consider replacing the layer or contacting the service owner.`;
                  const notFoundGuidanceHtml = `Some services returned 404 (Not Found). Open the <a href="${hostBase}/home/item.html?id=${w.itemId}" target="_blank" rel="noopener noreferrer">web map</a> to remove broken layers, or replace with an available service.`;
                  return (
                  <li key={`${w.itemId}-${i}`}>
                    {hasHttpIssues ? (
                      <>
                        {`WARNING: Webmap [${w.itemId}] uses http services.`}
                        {w.details?.webmapTitle && (
                          <div>Title: {w.details.webmapTitle}</div>
                        )}
                        <div dangerouslySetInnerHTML={{ __html: guidanceHtml }} />
                      </>
                    ) : hasTimeouts ? (
                      <>
                        {`WARNING: Webmap [${w.itemId}] has timeout failures.`}
                        {w.details?.webmapTitle && (
                          <div>Title: {w.details.webmapTitle}</div>
                        )}
                        <div dangerouslySetInnerHTML={{ __html: timeoutGuidanceHtml }} />
                      </>
                    ) : hasNotFound ? (
                      <>
                        {`WARNING: Webmap [${w.itemId}] has missing layer(s).`}
                        {w.details?.webmapTitle && (
                          <div>Title: {w.details.webmapTitle}</div>
                        )}
                        <div dangerouslySetInnerHTML={{ __html: notFoundGuidanceHtml }} />
                      </>
                    ) : (
                      (/^\s*(ERROR|WARNING|INFO):/i.test(w.message)
                        ? (<span dangerouslySetInnerHTML={{ __html: w.message }} />)
                        : (<>
                            {w.level.toUpperCase()}: [{w.itemId}] <span dangerouslySetInnerHTML={{ __html: w.message }} />
                          </>))
                    )}
                    {consolidatedFailures.length > 0 && (
                      <div>{`WARNING: Webmap [${w.itemId}] has ${consolidatedFailures.length} failing layer(s).`}</div>
                    )}
                    {w.details?.webmapTitle && (
                      <div>Title: {w.details.webmapTitle}</div>
                    )}
                    {consolidatedFailures.length > 0 && (
                      <div>
                        <button
                          className="converter-details-toggle-btn"
                          onClick={() => setExpandedWarnings(prev => ({ ...prev, [w.itemId]: !prev[w.itemId] }))}
                        >
                          {expandedWarnings[w.itemId] ? 'Hide details' : `Show details (${consolidatedFailures.length})`}
                        </button>
                        {expandedWarnings[w.itemId] && (
                          <ul>
                            {consolidatedFailures.map((f, j) => (
                              <li key={`${w.itemId}-fail-${j}`}>
                                {f.layerTitle ? `Layer name: ${f.layerTitle}` : ''}
                                {f.layerItemId ? (
                                  <>
                                    {' '}
                                    [<a href={makeItemUrl(f.layerItemId)} target="_blank" rel="noopener noreferrer">{f.layerItemId}</a>]
                                    {' '}
                                  </>
                                ) : ''}
                                {f.error ? ` — Error: ${f.error}` : ''}
                                {typeof f.status === 'number' ? ` (status ${f.status})` : ''}
                                {f.url ? (
                                  <>
                                    {' '}
                                    — <a href={f.url} target="_blank" rel="noopener noreferrer">Link to endpoint</a>
                                    {' '}
                                  </>
                                ) : ''}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}
                  </li>
                );})}
              </ul>
              <span>These issues won’t stop conversion, but may prevent maps from loading. Please fix with <a href="https://assistant.esri-ps.com/">ArcGIS Assistant</a> or in ArcGIS Online.</span>
              
            </>
          )}
        </div>
      )}
    </div>
  );
}