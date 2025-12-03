/**
 * Classic StoryMap to ArcGIS StoryMaps Converter UI
 * Minimal form interface for conversion
 */

import { useState, useEffect, useRef, useCallback } from "react";
// Refactor pipeline imports (feature-flagged)
// import { useRefactorFlagReactive } from "../util/featureFlag";
// import { convertClassicToJsonRefactored } from "../index";
// Backend/refactor legacy pipeline no longer used
import { validateWebMaps, type EndpointCheck } from "../services/WebMapValidator";
import { detectClassicTemplate } from "../util/detectTemplate";
import { useAuth } from "../auth/useAuth";
import { MapJournalConverter } from "../converters/MapJournalConverter";
import { SwipeConverter } from "../converters/SwipeConverter";
import {
  getItemData,
  getItemDetails,
  findDraftResourceName,
  removeResource,
  addResource,
  updateItemKeywords,
} from "../api/arcgis-client";
import { createDraftStoryMap } from "../legacy-converter/storymap-draft-creator";
// Legacy pipeline disabled
// Legacy image transfer no longer used


type Status =
  | "idle"
  | "fetching"
  | "converting"
  | "transferring"
  | "updating"
  | "success"
  | "error";

export default function Converter() {
  const [publishing, setPublishing] = useState(false);
  // retain state only for UI style and tooltip logic; reading ref for actual cancellation
  const [cancelRequested, setCancelRequested] = useState(false); // track user-originated cancellation (used for disabling mobile button)
  const cancelRequestedRef = useRef(false);
  const [hoverCancel, setHoverCancel] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  // Reactively reflects current URL (?refactor=1)
  // const useRefactor = useRefactorFlagReactive();
  // Declare core status-related state early to avoid TDZ access in effects
  const { token, userInfo } = useAuth();
  const [classicItemId, setClassicItemId] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");
  const [convertedUrl, setConvertedUrl] = useState("");
  // Refactor debug banner removed; no longer used
  // buttonLabel retained for future extended messaging but currently unused
  const [buttonLabel, setButtonLabel] = useState("Convert");
  // // Manual refactor pipeline override (UI toggle) persisted across auth redirects
  // const [refactorOverride, setRefactorOverride] = useState<boolean>(() => {
  //   try { return localStorage.getItem('converter-refactor-pref') === '1'; } catch { return false; }
  // });
  // Final flag: either URL param (?refactor=1) or manual override checkbox
  // Legacy/refactor pipeline disabled entirely (flag removed)
  // Cancellation helper + handler declared early to avoid TDZ in effects
  const checkCancelled = () => {
    if (cancelRequestedRef.current) {
      throw new Error("Conversion cancelled by user intervention");
    }
  };
  const handleCancel = useCallback(() => {
    if (cancelRequestedRef.current) return;
    const confirmed = window.confirm('Cancel conversion in progress? This will stop further processing.');
    if (!confirmed) return;
    cancelRequestedRef.current = true;
    setCancelRequested(true);
    setStatus("error");
    setMessage("Conversion cancelled by user intervention");
    setPublishing(false);
    setButtonLabel("Convert");
  }, [setButtonLabel, setMessage, setStatus, setPublishing, setCancelRequested]);
  // useEffect(() => {
  //   console.info(`[Converter] Pipeline selected: ${refactorActive ? 'refactor' : 'legacy'} (override=${refactorOverride})`);
  // }, [refactorActive, refactorOverride]);

  // Persist override changes
  // useEffect(() => {
  //   try { localStorage.setItem('converter-refactor-pref', refactorOverride ? '1' : '0'); } catch {/* ignore */}
  // }, [refactorOverride]);


  // Mobile detection (simplistic: width threshold + touch capability)
  useEffect(() => {
    const detect = () => {
      const w = window.innerWidth;
      const touch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
      setIsMobile(w < 768 || touch);
    };
    detect();
    window.addEventListener('resize', detect);
    return () => window.removeEventListener('resize', detect);
  }, []);

  // Keyboard accessible cancel via Escape
  useEffect(() => {
    const active = !cancelRequestedRef.current && ['fetching','converting','transferring','updating'].includes(status);
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleCancel();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [status, handleCancel]);
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
  const [endpointChecks, setEndpointChecks] = useState<EndpointCheck[]>([]);
  const [endpointCategorySummary, setEndpointCategorySummary] = useState<Record<string, number> | null>(null);
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
    } catch { /* ignore */ }
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
      // HTTP endpoints present
      if (/HTTP URL|http:\/\//i.test(msg)) {
        const formatted = `Unsupported protocol: You must update the web map to use https service urls. You can do this by opening the web map item's <a href="${baseUsed}/home/item.html?id=${id}#settings" target="_blank" rel="noopener noreferrer">settings page</a> scrolling down to the Web map section and clicking the "Update layers to HTTPS" button`;
        return { ...w, message: formatted };
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
      // Only update if we have a token (signed-in) and the base differs
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
      } catch { /* ignore */ }
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
      } catch { /* ignore */ }
    }
    if (candidate && candidate !== orgBase) setOrgBase(candidate);
    return candidate;
  }, [orgBase, token, getOrgHostname]);
    const handleConvert = async () => {
      //console.debug('[Converter] refactorActive?', refactorActive, 'override?', refactorOverride, 'urlFlag?', useRefactor);
      // Reset state
      setStatus("idle");
      setMessage("");
      setConvertedUrl("");
      setButtonLabel("Convert");
      cancelRequestedRef.current = false;
      setCancelRequested(false);
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
          setDetectedTemplate(runtimeTemplate);
          setMessage(`Detected template: ${runtimeTemplate}. Preparing resources...`);
        } catch {
          runtimeTemplate = null;
          setDetectedTemplate(null);
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
        const targetStoryId = await createDraftStoryMap(username, token, itemTitle);
        checkCancelled();

        // Determine base theme (summit/obsidian) will be applied inline with overrides during conversion
        setMessage("Mapping theme overrides (inline resource)...");

        // Gather webmap ids for validation (from classic JSON and embedded swipes)
        const webmapIds: string[] = [];
        if (classicData.values?.webmap) webmapIds.push(classicData.values.webmap);
        try {
          const sections = (classicData.values?.story?.sections || classicData.sections || []) as Array<{ media?: { webmap?: { id?: string }, webpage?: { url?: string } } }>;
          for (const s of sections) {
            if (s?.media?.webmap?.id) webmapIds.push(s.media!.webmap!.id as string);
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
                  for (const wid of wm) if (typeof wid === 'string') webmapIds.push(wid);
                }
              } catch {
                // ignore
              }
            }
          }
        } catch { /* ignore */ }

        // Validate webmaps client-side first (may be limited by CORS)
        let localWarnings: typeof webmapWarnings = [];
        try {
          // Resolve org base synchronously for this run
          const baseForRun = await ensureOrgBaseResolved();
          const { warnings, endpointChecks, endpointCategorySummary } = await validateWebMaps(webmapIds, token);
          localWarnings = warnings.map(w => ({ itemId: w.itemId, level: w.level as string, message: w.message, details: (w && typeof w === 'object' && 'details' in w ? (w as unknown as { details?: { webmapTitle?: string; failures?: Array<{ url: string; status?: number; error?: string; title?: string; layerItemId?: string; layerTitle?: string }> } }).details : undefined) }));
          // Apply formatting for version/protocol warnings using cached org base
          localWarnings = normalizeWebmapWarnings(localWarnings, baseForRun);
          setWebmapWarnings(localWarnings);
          setEndpointChecks(endpointChecks);
          setEndpointCategorySummary(endpointCategorySummary || null);
          if (localWarnings.length > 0) {
            // If we already have warnings, no need for backend diagnostics phase gating
            setWebmapChecksFinalized(true);
          }
        } catch { /* ignore */ }

        // If no failures detected locally, attempt backend diagnostics (serverless avoids CORS and gathers full layer info)
        if (!cancelRequestedRef.current && localWarnings.length === 0) {
          try {
            setMessage("Running backend diagnostics...");
            const diagUrl = `/.netlify/functions/convert-mapjournal?itemId=${classicItemId}&diagnostics=1${token ? `&token=${encodeURIComponent(token)}` : ''}`;
            const resp = await fetch(diagUrl);
            if (resp.ok) {
              const json = await resp.json();
              const v = json?.validation || {};
              const backendWarnings = Array.isArray(v.warnings) ? v.warnings : [];
              const backendEndpointChecks: EndpointCheck[] = Array.isArray(v.endpointChecks) ? v.endpointChecks : [];
              const backendSummary: Record<string, number> | null = v.endpointCategorySummary || null;
              if (backendWarnings.length || backendEndpointChecks.some(ec => !ec.ok)) {
                  const baseForRun = await ensureOrgBaseResolved();
                const formattedWarnings = normalizeWebmapWarnings(
                  backendWarnings.map((w: { itemId: string; level: string; message: string; details?: { webmapTitle?: string; failures?: Array<{ url: string; status?: number; error?: string; title?: string; layerItemId?: string; layerTitle?: string }> } }) => ({ itemId: w.itemId, level: w.level, message: w.message, details: w.details })),
                    baseForRun
                );
                setWebmapWarnings(formattedWarnings);
                setEndpointChecks(backendEndpointChecks);
                setEndpointCategorySummary(backendSummary);
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

        let newStorymapJson: unknown;
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
        if (detectedTemplate === 'MAPJOURNAL') {
          const conv = new MapJournalConverter({
            classicJson: classicData,
            themeId: 'summit',
            progress,
            token
          });
          const result = conv.convert();
          newStorymapJson = result.storymapJson;
        } else if (detectedTemplate === 'SWIPE') {
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
        const draftResourceName = findDraftResourceName(targetDetails);
        if (!draftResourceName) {
          throw new Error("Could not find draft resource in target storymap. Make sure it is a draft storymap.");
        }

        // Remove old draft resource
        setMessage(`Removing old draft resource (${draftResourceName})...`);
        await removeResource(targetStoryId, username, draftResourceName, token);
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
        } catch { /* ignore cleanup failures */ }
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
        } catch {/* ignore */}

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
        } catch (e) {
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
      {/* refactor debug banner removed */}
      <h2>Classic StoryMap Converter</h2>
      <p>Convert Classic StoryMaps to ArcGIS StoryMaps</p>
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
                {webmapWarnings.map((w, i) => (
                  <li key={`${w.itemId}-${i}`}>
                    {/^\s*(ERROR|WARNING|INFO):/i.test(w.message)
                      ? (<span dangerouslySetInnerHTML={{ __html: w.message }} />)
                      : (<>
                          {w.level.toUpperCase()}: [{w.itemId}] <span dangerouslySetInnerHTML={{ __html: w.message }} />
                        </>)}
                    {w.details?.webmapTitle && (
                      <div>Title: {w.details.webmapTitle}</div>
                    )}
                    {Array.isArray(w.details?.failures) && w.details!.failures!.length > 0 && (
                      <div>
                        <button
                          className="converter-details-toggle-btn"
                          onClick={() => setExpandedWarnings(prev => ({ ...prev, [w.itemId]: !prev[w.itemId] }))}
                        >
                          {expandedWarnings[w.itemId] ? 'Hide details' : `Show details (${w.details!.failures!.length})`}
                        </button>
                        {expandedWarnings[w.itemId] && (
                          <ul>
                            {w.details!.failures!.map((f, j) => (
                              <li key={`${w.itemId}-fail-${j}`}>
                                {f.layerTitle ? `${f.layerTitle}` : ''}
                                {f.layerItemId ? (
                                  <>
                                    {' '}
                                    [<a href={makeItemUrl(f.layerItemId)} target="_blank" rel="noopener noreferrer">{f.layerItemId}</a>]
                                    {' '}
                                  </>
                                ) : ''}
                                {f.error ? ` — ${f.error}` : ''}
                                {typeof f.status === 'number' ? ` (status ${f.status})` : ''}
                                {f.url ? (
                                  <>
                                    {' '}
                                    — <a href={f.url} target="_blank" rel="noopener noreferrer">URL</a>
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
                ))}
              </ul>
              <span>These issues won’t stop conversion, but may prevent maps from loading. Please fix with <a href="https://assistant.esri-ps.com/">ArcGIS Assistant</a> or in ArcGIS Online.</span>
              {endpointChecks.length > 0 && (
                <div className="converter-endpoint-checks">
                  <hr />
                  <strong>Endpoint Health Summary:</strong>
                  {endpointCategorySummary && (
                    <div className="endpoint-summary-row">
                      {Object.entries(endpointCategorySummary).map(([k,v]) => (
                        <span key={k} className="endpoint-summary-chip">{k}: {v}</span>
                      ))}
                    </div>
                  )}
                  <details>
                    <summary>Failing endpoints ({endpointChecks.filter(ec => !ec.ok).length})</summary>
                    <ul>
                      {endpointChecks.filter(ec => !ec.ok).map((ec,i) => (
                        <li key={`ep-${i}`}>
                          {ec.webmapTitle ? <span className="ep-webmap">{ec.webmapTitle}:</span> : ''}{' '}
                          {ec.layerTitle ? <span className="ep-layer">{ec.layerTitle}</span> : ''}{ec.layerItemId ? (
                            <>
                              {' '}[<a href={makeItemUrl(ec.layerItemId)} target="_blank" rel="noopener noreferrer">{ec.layerItemId}</a>]
                            </>
                          ) : ''}
                          {ec.errorCategory ? ` — ${ec.errorCategory}` : ''}
                          {ec.status ? ` (status ${ec.status})` : ''}
                          {ec.url ? (
                            <>
                              {' '}<a href={ec.url} target="_blank" rel="noopener noreferrer">endpoint</a>
                            </>
                          ) : ''}
                          {ec.errorMessage ? ` – ${ec.errorMessage}` : ''}
                        </li>
                      ))}
                    </ul>
                  </details>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}