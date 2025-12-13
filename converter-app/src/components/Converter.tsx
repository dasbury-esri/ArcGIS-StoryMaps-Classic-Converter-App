/**
 * Classic StoryMap to ArcGIS StoryMaps Converter UI
 * Minimal form interface for conversion
 */
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { clearFetchCache, getFetchCacheSize, onFetchCacheChange, offFetchCacheChange } from "../utils/fetchCache";
import type { StoryMapJSON } from "../types/core";
import { validateWebMaps, type EndpointCheck } from "../services/WebMapValidator";
import { detectClassicTemplate } from "../util/detectTemplate";
import { useAuth } from "../auth/useAuth";
import { MapJournalConverter } from "../converters/MapJournalConverter";
import { SwipeConverter } from "../converters/SwipeConverter";
import { MapTourConverter } from "../converters/MapTourConverter";
import { MapSeriesConverter } from "../converters/MapSeriesConverter";
import { MediaTransferService } from "../media/MediaTransferService";
import { ResourceMapper } from "../media/ResourceMapper";
import { collectImageUrls, transferImage } from "../api/image-transfer";
import { jsonSchemaToValidator } from "../utils/jsonSchemaValidation";
import "./Converter.css";
import draftSchema from "../../../schemas/draft-story.json";
import { isClassicTemplateEnabled } from "./enabledTemplates";
import {
  getItemData,
  getItemDetails,
  findDraftResourceName,
  removeResource,
  addResource,
  updateItemKeywords,
  createDraftStory,
  getUsername,
  createCollectionDraft,
  updateItemThumbnailUrl,
} from "../api/arcgis-client";
import { getOrgBase } from "../lib/orgBase";

type Status =
  | "idle"
  | "fetching"
  | "converting"
  | "transferring"
  | "updating"
  | "error";

export default function Converter() {
  const [publishing, setPublishing] = useState(false);
  // Disable by default; user can enable explicitly
  const [useLocalJson, setUseLocalJson] = useState<boolean>(false);
  const [localJsonPath, setLocalJsonPath] = useState<string>('');
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
  // Map Series MVP state: per-entry builder links and collection readiness
  const [mapSeriesLinks, setMapSeriesLinks] = useState<Array<{ title: string; href: string }>>([]);
  const mapSeriesDraftIds = useRef<string[]>([]);
  const mapSeriesThumbUrls = useRef<string[]>([]);
  const [mapSeriesPublished, setMapSeriesPublished] = useState<boolean[]>([]);
  const mapSeriesPublishedRef = useRef<boolean[]>([]);
  const mapSeriesPublishedByIdRef = useRef<Record<string, boolean>>({});
  const [mapSeriesReadyToCollect, setMapSeriesReadyToCollect] = useState<boolean>(false);
  const [convertedUrl, setConvertedUrl] = useState("");
  const [collectionEditUrl, setCollectionEditUrl] = useState<string>("");
  // Legacy interval ref removed; consolidated polling handles timers internally
  // const mapSeriesPollIntervalRef = useRef<number | null>(null);
    // UI toggle: suppress converter-metadata resources
    const [suppressMetadata, setSuppressMetadata] = useState<boolean>(() => {
      try {
        const saved = localStorage.getItem('suppressConverterMetadata');
        // Default: metadata enabled (not suppressed) → suppress=false
        return saved ? String(saved).toLowerCase() === 'true' : false;
      } catch {
        return false;
      }
    });
    useEffect(() => {
      try {
        // Persist the suppress flag
        localStorage.setItem('suppressConverterMetadata', String(suppressMetadata));
      } catch { /* ignore */ }
      // Global flag expects "suppress"; true means suppress metadata, false means emit
      (globalThis as unknown as { __SUPPRESS_CONVERTER_METADATA?: boolean }).__SUPPRESS_CONVERTER_METADATA = suppressMetadata;
    }, [suppressMetadata]);
  // buttonLabel retained for future extended messaging but currently unused
  const [buttonLabel, setButtonLabel] = useState("Convert");
  // Dynamically update Convert button when a valid id is entered
  useEffect(() => {
    let cancelled = false;
    const id = (classicItemId || '').trim();
    // Simple validity heuristic: AGO IDs are usually 32 chars hex-ish; accept length >= 8
    if (id.length < 8) { setButtonLabel('Convert'); return; }
    (async () => {
      try {
        // Fetch item details for name
        const details = await getItemDetails(id, token);
        const title = String(details?.title || details?.name || '').trim();
        // Try to detect template from classic data
        let template: string | null = null;
        try {
          const data = await getItemData(id, token);
          template = detectClassicTemplate(data);
        } catch { /* ignore */ }
        if (!template || template.toLowerCase() === 'unknown') {
          // Fallback to type keywords
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
          if (mapped) template = mapped;
        }
        const tmplName = template || '';
        const storyTitle = title || '';
        const label = tmplName && storyTitle
          ? `Convert classic ${tmplName}: "${storyTitle}"`
          : 'Convert';
        if (!cancelled) setButtonLabel(label);
      } catch {
        if (!cancelled) setButtonLabel('Convert');
      }
    })();
    return () => { cancelled = true; };
  }, [classicItemId, token]);
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

  // Compile draft schema validator once for client-side pre-upload validation
  const validateDraft = useMemo(() => jsonSchemaToValidator(draftSchema as Record<string, unknown>), []);
  // Invalidate orgBase cache when token is removed or changes to force re-resolution on next conversion
  useEffect(() => {
    if (!token) {
      setOrgBase(DEFAULT_ORG_BASE);
      try { (globalThis as unknown as { __ORG_BASE?: string }).__ORG_BASE = DEFAULT_ORG_BASE; } catch { /* ignore */ }
      prevTokenRef.current = null;
      portalResolvedRef.current = false;
      return;
    }
    if (prevTokenRef.current && prevTokenRef.current !== token) {
      setOrgBase(DEFAULT_ORG_BASE);
      try { (globalThis as unknown as { __ORG_BASE?: string }).__ORG_BASE = DEFAULT_ORG_BASE; } catch { /* ignore */ }
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
        try { (globalThis as unknown as { __ORG_BASE?: string }).__ORG_BASE = resolved; } catch { /* ignore */ }
      }
    } catch {
      // ignore resolution errors
    }
    // Re-run when auth changes or org info updates
  }, [token, userInfo, orgBase, getOrgHostname]);

  // ... UI rendering continues below; insert checkbox into controls panel

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
          try { (globalThis as unknown as { __ORG_BASE?: string }).__ORG_BASE = resolvedOrg; } catch { /* ignore */ }
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
    if (candidate && candidate !== orgBase) {
      setOrgBase(candidate);
      try { (globalThis as unknown as { __ORG_BASE?: string }).__ORG_BASE = candidate; } catch { /* ignore */ }
    }
    return candidate;
  }, [orgBase, token, getOrgHostname]);
  // Reset UI state for a fresh run (used by Clear Cache)
  const resetForNewRun = useCallback(() => {
    setPublishing(false);
    setStatus("idle");
    setMessage("");
    setConvertedUrl("");
    setButtonLabel("Convert");
    cancelRequestedRef.current = false;
    setCancelRequested(false);
    setWebmapWarnings([]);
    setWebmapChecksFinalized(false);
    setExpandedWarnings({});
    setDetectedTemplate(null);
    if (customCssInfo?.url) URL.revokeObjectURL(customCssInfo.url);
    setCustomCssInfo(null);
    // Clear any Map Series publishing UI state so the panel disappears
    setMapSeriesLinks([]);
    mapSeriesDraftIds.current = [];
    mapSeriesThumbUrls.current = [];
    setMapSeriesPublished([]);
    mapSeriesPublishedRef.current = [];
    mapSeriesPublishedByIdRef.current = {};
    setMapSeriesReadyToCollect(false);
  }, [customCssInfo]);

  // (Removed legacy polling effect; using the consolidated MapSeriesPoll effect below)
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

        // Strengthen detection: Map Series classic JSON exposes values.entries
        if (!runtimeTemplate || runtimeTemplate.toLowerCase() === 'unknown') {
          try {
            const hasEntries = Array.isArray(classicData?.values?.entries) && classicData.values.entries.length > 0;
            if (hasEntries) {
              runtimeTemplate = 'Map Series';
              setDetectedTemplate('Map Series');
              setMessage('Detected template: Map Series. Preparing resources...');
            }
          } catch {
            // ignore
          }
        }

        // Early error messaging for non-classic items or disabled classic types
        try {
          const details = await getItemDetails(classicItemId, token);
          const itemType = String(details?.type || '').trim();
          const classicType = (runtimeTemplate || '').toLowerCase();
          // If detector returned unknown, treat as non-classic
          if (!classicType || classicType === 'unknown') {
            // Final guard: if entries exist, this is Map Series
            try {
              const hasEntries = Array.isArray(classicData?.values?.entries) && classicData.values.entries.length > 0;
              if (hasEntries) {
                runtimeTemplate = 'Map Series';
              }
            } catch { /* ignore */ }
            if (!runtimeTemplate || runtimeTemplate.toLowerCase() === 'unknown') {
            setStatus('error');
            setMessage(`Error: The item id you entered is not for a Classic Esri Story Map. It is a ${itemType || 'non-classic ArcGIS item'}`);
            return;
            }
          }
          // If classic type is recognized but currently disabled in UI feature gating
          if (!isClassicTemplateEnabled(runtimeTemplate)) {
            const label = runtimeTemplate || 'unknown';
            setStatus('error');
            setMessage(`Error: The item id you entered is not yet available for conversion. It is a ${label}`);
            return;
          }
        } catch {
          // If item details fail, continue and let downstream errors surface
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
        // Collect TWO_WEBMAPS ids from top-level classic JSON if present
        try {
          const topWm = Array.isArray(classicData.values?.webmaps) ? classicData.values.webmaps : [];
          for (const wid of topWm) {
            if (typeof wid === 'string') {
              webmapIdsUnfiltered.push(wid);
            } else {
              const obj = wid as unknown as { id?: unknown };
              if (obj && typeof obj.id === 'string') webmapIdsUnfiltered.push(obj.id);
            }
          }
        } catch { /* ignore parse errors */ }
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
                  for (const wid of wm) {
                    if (typeof wid === 'string') {
                      webmapIdsUnfiltered.push(wid);
                    } else {
                      const obj = wid as unknown as { id?: unknown };
                      if (obj && typeof obj.id === 'string') webmapIdsUnfiltered.push(obj.id);
                    }
                  }
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
                      for (const wid of wm) {
                        if (typeof wid === 'string') {
                          webmapIdsUnfiltered.push(wid);
                        } else {
                          const obj = wid as unknown as { id?: unknown };
                          if (obj && typeof obj.id === 'string') webmapIdsUnfiltered.push(obj.id);
                        }
                      }
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
        // Defensive guard: if Map Series entries were derived, force template
        if ((!runtimeTemplate || runtimeTemplate.toLowerCase() === 'unknown')) {
          // If we already collected draft IDs, it's Map Series
          if ((mapSeriesDraftIds.current?.length || 0) > 0) {
            runtimeTemplate = 'Map Series';
          } else {
            // Additional guard: classic JSON has entries → Map Series
            try {
              const entries = Array.isArray(classicData?.values?.entries) ? classicData.values.entries : [];
              if (entries.length > 0) {
                runtimeTemplate = 'Map Series';
              }
            } catch {
              // ignore
            }
          }
        }
        const resolvedTmpl = (detectedTemplate || runtimeTemplate || '').toLowerCase();
        if (resolvedTmpl === 'map journal' || resolvedTmpl === 'mapjournal') {
          const conv = new MapJournalConverter({
            classicJson: classicData,
            themeId: 'summit',
            progress,
            token
          });
            const result = conv.convert();
            newStorymapJson = result.storymapJson;
        } else if (resolvedTmpl === 'map tour' || resolvedTmpl === 'tour') {
          const result = MapTourConverter.convert({
            classicJson: classicData,
            themeId: 'summit',
            progress
          });
          newStorymapJson = result.storymapJson;
        } else if (resolvedTmpl === 'swipe') {
          const conv = new SwipeConverter({
            classicJson: classicData,
            themeId: 'summit',
            progress,
            token
          });
            const result = await conv.convert();
            newStorymapJson = result.storymapJson;
        } else if (resolvedTmpl === 'map series' || resolvedTmpl === 'mapseries') {
          // Map Series: build one draft per entry and surface builder links
                const series = await MapSeriesConverter.convertSeries({
            classicJson: classicData,
            themeId: 'summit',
            progress,
            token
          });
                const entries = Array.isArray(series.entryTitles) ? series.entryTitles : [];
                const hrefs = Array.isArray(series.builderLinks) ? series.builderLinks : [];
                const thumbs = Array.isArray(series.thumbnailUrls) ? series.thumbnailUrls : [];
                const draftsRaw = Array.isArray(series.draftItemIds) ? series.draftItemIds : [];
                const validId = (s: unknown) => typeof s === 'string' && /^[a-f0-9]{32}$/i.test(s);
                const drafts = draftsRaw.filter(validId);
                mapSeriesDraftIds.current = drafts;
                if (import.meta.env.DEV) {
                  console.debug('[MapSeries] draft IDs', { total: draftsRaw.length, valid: drafts.length });
                }
                mapSeriesThumbUrls.current = thumbs;
                const linkPairs = entries.map((t, i) => {
                  const id = drafts[i];
                  const hrefDefault = hrefs[i] || '#';
                  const href = (id && id.length)
                    ? `https://storymaps.arcgis.com/stories/${id}/edit`
                    : hrefDefault;
                  return { title: t, href };
                }).filter(lp => lp.href && lp.href !== '#');
                if (linkPairs.length > 0) {
                  setConvertedUrl('Map Series conversion complete. See links below.');
                  setMapSeriesLinks(linkPairs);
                }
          // Map Series flow does not produce a single story JSON; stop here
          return;
        }
        checkCancelled();

        // UI-side safeguard: if cover title is generic ("Swipe"/"Spyglass"), replace with AGO item title
        try {
          const story = newStorymapJson as unknown as { nodes?: Record<string, { type?: string; data?: { title?: string } }> };
          const nodes = story.nodes || {};
          const coverEntry = Object.entries(nodes).find(([, n]) => n && n.type === 'storycover');
          if (coverEntry) {
            const [coverId, coverNode] = coverEntry as [string, { type?: string; data?: { title?: string } }];
            const currentTitle = (coverNode.data?.title || '').trim();
            const isGeneric = !currentTitle || /^(swipe|spyglass)$/i.test(currentTitle);
            if (isGeneric && classicItemId) {
              try {
                const detailsClassic = await getItemDetails(classicItemId, token);
                const agoTitle = String(detailsClassic?.title || '').trim();
                if (agoTitle) {
                  coverNode.data = { ...(coverNode.data || {}), title: agoTitle };
                  nodes[coverId] = coverNode;
                  (newStorymapJson as StoryMapJSON).nodes = nodes as unknown as StoryMapJSON['nodes'];
                  console.debug('[CoverTitle][UI] Replaced generic cover title with AGO item title:', agoTitle);
                }
              } catch {
                // ignore title replacement failures
              }
            }
          }
        } catch {
          // ignore UI-side title safeguard errors
        }

        // Transfer images to target story resources and rewrite resource entries
        try {
          setStatus('transferring');
          setMessage('Transferring images to story resources...');
          const imageUrls = collectImageUrls(newStorymapJson);
          if (imageUrls.length) {
            const uploader = async (url: string, storyId: string, username: string, token: string) => {
              const original = url;
              let resolved = url;
              try {
                const isAbsolute = /^https?:\/\//i.test(url) || url.startsWith('//');
                if (!isAbsolute) {
                  const trimmed = url.replace(/^\.\/?/, '');
                  const needsResourcesPrefix = !/^resources\//i.test(trimmed);
                  const path = needsResourcesPrefix ? `resources/${trimmed}` : trimmed;
                  const id = (classicItemId || '').trim();
                  if (id) {
                    resolved = `https://www.arcgis.com/sharing/rest/content/items/${id}/${path}`;
                  }
                }
              } catch {
                // fall back to original url
                resolved = url;
              }
              const r = await transferImage(resolved, storyId, username, token);
              // Important: return the mapping key as the original src value so ResourceMapper can match
              return { originalUrl: original, resourceName: r.resourceName, transferred: r.isTransferred };
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
          const storyJson = newStorymapJson as unknown as { nodes?: Record<string, { type?: string; data?: { title?: string } }>; resources?: Record<string, MinimalConverterMetadataResource | { type?: string }> };
          const metadataRes = storyJson.resources && (Object.values(storyJson.resources).find((r) => r.type === 'converter-metadata') as MinimalConverterMetadataResource | undefined);
          const cssCombined = metadataRes?.data?.classicMetadata?.mappingDecisions?.customCss?.combined;
          if (cssCombined) {
            const blob = new Blob([cssCombined], { type: 'text/css' });
            const url = URL.createObjectURL(blob);
            // Derive filename from story cover title if present: <storytitle-custom>.css
            let fileName = 'custom-css.css';
            try {
              const coverEntry = storyJson.nodes && Object.values(storyJson.nodes).find(n => n && n.type === 'storycover');
              const title = (coverEntry?.data?.title || '').trim();
              if (title) {
                const safe = title
                  .toLowerCase()
                  .replace(/[^a-z0-9\s-_]/g, '')
                  .replace(/\s+/g, '-')
                  .replace(/-+/g, '-')
                  .replace(/^-|-$/g, '');
                if (safe) fileName = `${safe}-custom.css`;
              }
            } catch { /* ignore filename derivation errors */ }
            setCustomCssInfo({ css: cssCombined, url, fileName });
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

        // Ensure converter-metadata always contains classicItemId and classicType
        try {
          const storyJson = newStorymapJson as unknown as { resources?: Record<string, { type?: string; data?: Record<string, unknown> }> };
          const resources = storyJson.resources || (storyJson.resources = {} as Record<string, { type?: string; data?: Record<string, unknown> }>);
          const itemIdTrimmed = (classicItemId || '').trim();
          const typeDetected = (detectedTemplate || '').trim();
          let metaEntry = Object.entries(resources).find(([, r]) => r && r.type === 'converter-metadata');
          if (!metaEntry) {
            const rid = `r-${Date.now()}`;
            resources[rid] = { type: 'converter-metadata', data: {} };
            metaEntry = [rid, resources[rid]] as [string, { type?: string; data?: Record<string, unknown> }];
          }
          const [metaId, metaRes] = metaEntry as [string, { type?: string; data?: Record<string, unknown> }];
          const data = (metaRes.data || (metaRes.data = {}));
          if (itemIdTrimmed) data.classicItemId = itemIdTrimmed;
          if (typeDetected) data.classicType = typeDetected;
          // Force converter-metadata to the end
          delete resources[metaId];
          resources[metaId] = metaRes;
          storyJson.resources = resources;
        } catch {
          // ignore metadata injection errors
        }

        // Persist webmap warnings into converter-metadata resource for later visibility
        try {
          if (!suppressMetadata && Array.isArray(webmapWarnings) && webmapWarnings.length) {
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

        // Client-side schema validation before upload (fast feedback)
        try {
          const ok = validateDraft(newStorymapJson as unknown as Record<string, unknown>);
          if (!ok) {
            const errs = Array.isArray((validateDraft as unknown as { errors?: unknown[] }).errors)
              ? ((validateDraft as unknown as { errors?: unknown[] }).errors as Array<Record<string, unknown>>)
              : [];
            const firstMsg = errs.length ? (String(errs[0]?.message ?? JSON.stringify(errs[0]))) : 'Schema validation failed';
            throw new Error(`Draft JSON failed client-side schema validation: ${firstMsg}`);
          }
        } catch (e) {
          throw e instanceof Error ? e : new Error(String(e));
        }

        // Validate JSON against schema via Netlify Function before upload (server-side gate)
        try {
          setMessage('Validating draft JSON schema...');
          const vRes = await fetch('/.netlify/functions/validate-draft', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(newStorymapJson)
          });
          if (!vRes.ok) {
            const details = await vRes.json().catch(() => ({}));
            const errs = Array.isArray(details?.errors) ? details.errors : [];
            const firstMsg = errs.length ? (errs[0]?.message || JSON.stringify(errs[0])) : `HTTP ${vRes.status}`;
            throw new Error(`Draft JSON failed schema validation: ${firstMsg}`);
          }
        } catch (e) {
          throw e instanceof Error ? e : new Error(String(e));
        }

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

        // Save local copies to tmp-converted via Netlify function (during netlify dev)
        try {
          const cid = String(classicItemId || '').trim();
          // Create a timestamped run folder: <classicId-MM-ddTHH-MM>
          const now = new Date();
          const pad = (n: number) => String(n).padStart(2, '0');
          const runStamp = `${pad(now.getMonth()+1)}-${pad(now.getDate())}T${pad(now.getHours())}-${pad(now.getMinutes())}`;
          const runFolder = cid ? `${cid}-${runStamp}` : `converted-app-${runStamp}`;
          // Always save the immediate draft JSON
          {
            const res = await fetch('/.netlify/functions/save-converted', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({
                filename: `${runFolder}/draft.json`,
                storyId: targetStoryId,
                classicItemId,
                json: newStorymapJson
              })
            });
            if (res.ok) {
              const info = await res.json();
              const savedPath = info?.path || info?.fileName || 'ok';
              console.info('[LocalSave] Converted JSON saved:', savedPath);
              if (import.meta.env.DEV) {
                setToast(`Saved draft.json to: ${savedPath}`);
                setTimeout(() => setToast(''), 3000);
              }
            } else {
              console.warn('[LocalSave] Failed to save converted JSON locally:', res.status);
              if (import.meta.env.DEV) {
                setToast(`Save draft.json failed (status ${res.status})`);
                setTimeout(() => setToast(''), 3000);
              }
            }
          }
          // If Map Series, save each entry JSON and a collection placeholder into a classic-id subfolder
          if ((detectedTemplate || runtimeTemplate || '').toLowerCase().includes('map series')) {
            try {
              // Access last Map Series links/titles if present (not strictly needed for saving)
              // @ts-expect-error allow reading local state without usage
              void (mapSeriesLinks || []);
              // Save entry JSONs if the converter returned them
              // Since only the first entry JSON was uploaded, attempt to regenerate via converter for saving
              try {
                const series = await MapSeriesConverter.convertSeries({
                  classicJson: classicData,
                  themeId: 'auto',
                  progress,
                  token
                });
                const entries = Array.isArray(series.storymapJsons) ? series.storymapJsons : [];
                for (let i = 0; i < entries.length; i++) {
                  const entryJson = entries[i];
                  const filename = `${runFolder}/entry-${i + 1}.json`;
                  const res = await fetch('/.netlify/functions/save-converted', {
                    method: 'POST',
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify({
                      filename,
                      storyId: targetStoryId,
                      classicItemId,
                      json: entryJson
                    })
                  });
                  if (res.ok) {
                    const info = await res.json();
                    const savedPath = info?.path || info?.fileName || `entry-${i+1}.json`;
                    if (import.meta.env.DEV) {
                      setToast(`Saved entry ${i+1} to: ${savedPath}`);
                      setTimeout(() => setToast(''), 2500);
                    }
                  } else {
                    console.warn('[LocalSave] Failed to save Map Series entry JSON locally:', i + 1, res.status);
                    if (import.meta.env.DEV) {
                      setToast(`Save entry ${i+1} failed (status ${res.status})`);
                      setTimeout(() => setToast(''), 2500);
                    }
                  }
                }
                // Save collection placeholder draft JSON, including layoutId for collection type and panel defaults
                const seriesSettings = (classicData as { values?: { settings?: Record<string, unknown> } }).values?.settings || {} as Record<string, unknown>;
                const layoutId = (seriesSettings as { layout?: { id?: string } }).layout?.id;
                const panel = (seriesSettings as { layoutOptions?: { panel?: { position?: string; size?: string } } }).layoutOptions?.panel || {};
                const collectionDraft = {
                  type: 'collection-draft',
                  classicItemId: cid,
                  collectionType: layoutId,
                  panelDefaults: { position: panel.position, size: panel.size },
                  entries: (series.entryTitles || []).map((t, i) => ({ index: i + 1, title: t }))
                };
                {
                  const res = await fetch('/.netlify/functions/save-converted', {
                    method: 'POST',
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify({
                      filename: `${runFolder}/collection-draft.json`,
                      storyId: targetStoryId,
                      classicItemId,
                      json: collectionDraft
                    })
                  });
                  if (res.ok) {
                    const info = await res.json();
                    const savedPath = info?.path || info?.fileName || 'collection-draft.json';
                    if (import.meta.env.DEV) {
                      setToast(`Saved collection-draft to: ${savedPath}`);
                      setTimeout(() => setToast(''), 2500);
                    }
                  } else {
                    console.warn('[LocalSave] Failed to save Map Series collection draft locally:', res.status);
                    if (import.meta.env.DEV) {
                      setToast(`Save collection-draft failed (status ${res.status})`);
                      setTimeout(() => setToast(''), 2500);
                    }
                  }
                }
              } catch (err) {
                console.warn('[LocalSave] Error saving Map Series entries locally:', err);
              }
            } catch {
              // ignore
            }
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
  // Auto-poll for published_data.json whenever Map Series links change
  useEffect(() => {
    if (import.meta.env.DEV) {
      console.debug('[MapSeriesPoll] effect run', {
        linksCount: mapSeriesLinks.length,
        orgBase,
        host: getOrgHostname()
      });
    }
    if (!mapSeriesLinks.length) {
      if (import.meta.env.DEV) console.debug('[MapSeriesPoll] no links; skipping setup');
      return;
    }
    let interval: number | undefined;
    let initialTimeout: number | undefined;
    let cancelled = false;
    (async () => {
      try {
        // Initialize ID-keyed map preserving any previous true values
        const prevMap = { ...mapSeriesPublishedByIdRef.current };
        for (const id of (mapSeriesDraftIds.current || []).filter(id => typeof id === 'string' && /^[a-f0-9]{32}$/i.test(id))) {
          if (typeof prevMap[id] !== 'boolean') prevMap[id] = false;
        }
        mapSeriesPublishedByIdRef.current = prevMap;
        // Project to UI array order from draftIds
        const uiArray = (mapSeriesDraftIds.current || []).filter(id => typeof id === 'string' && /^[a-f0-9]{32}$/i.test(id)).map(id => Boolean(prevMap[id]));
        mapSeriesPublishedRef.current = uiArray;
        setMapSeriesPublished(uiArray);
        if (import.meta.env.DEV) {
          console.debug('[MapSeriesPoll] setup', {
            linksCount: mapSeriesLinks.length,
            orgBase,
          });
        }
        const tkn = token;
        if (!tkn) {
          if (import.meta.env.DEV) console.debug('[MapSeriesPoll] no token; skipping');
          return;
        }
        const draftIdsAll = (mapSeriesDraftIds.current || []).slice();
        const draftIds = draftIdsAll.filter(id => typeof id === 'string' && /^[a-f0-9]{32}$/i.test(id));
        if (!draftIds.length) {
          if (import.meta.env.DEV) console.debug('[MapSeriesPoll] no draftIds; skipping');
          return;
        }
        const pollOnce = async () => {
          if (cancelled) return;
          const next = mapSeriesPublishedRef.current.slice();
          for (let i = 0; i < draftIds.length; i++) {
            const itemId = draftIds[i];
            if (!itemId || next[i]) continue;
            try {
              const baseHost = (orgBase && orgBase.length) ? orgBase : `https://${getOrgHostname()}`;
              // Prefer item-level resources endpoint which does not require owner in path
              const url = `${baseHost}/sharing/rest/content/items/${encodeURIComponent(itemId)}/resources?f=json&token=${encodeURIComponent(tkn)}`;
              if (import.meta.env.DEV) console.debug('[MapSeriesPoll] fetch resources', { itemId, url });
              const res = await fetch(url);
              if (!res.ok) continue;
              const json = await res.json();
              const resources = Array.isArray(json?.resources) ? json.resources : [];
              const hasPublishedData = resources.some((r: { resource?: string }) => String(r?.resource || '').toLowerCase().endsWith('published_data.json'));
              if (import.meta.env.DEV) {
                console.debug('[MapSeriesPoll]', {
                  itemId,
                  url,
                  resourceCount: resources.length,
                  hasPublishedData
                });
              }
              if (hasPublishedData) {
                next[i] = true;
                mapSeriesPublishedByIdRef.current[itemId] = true;
              }
            } catch {
              // ignore per-entry polling errors
            }
          }
          // Re-project from ID map to UI-order array
          const nextUi = (mapSeriesDraftIds.current || []).filter(id => typeof id === 'string' && /^[a-f0-9]{32}$/i.test(id)).map(id => Boolean(mapSeriesPublishedByIdRef.current[id]));
          if (import.meta.env.DEV) {
            console.debug('[MapSeriesPoll] projection', {
              draftIds,
              publishedById: { ...mapSeriesPublishedByIdRef.current },
              projectedArray: nextUi
            });
          }
          mapSeriesPublishedRef.current = nextUi;
          setMapSeriesPublished(nextUi);
          const allChecked = nextUi.length > 0 && nextUi.every(Boolean);
          setMapSeriesReadyToCollect(allChecked);
          if (allChecked && interval) {
            clearInterval(interval);
            interval = undefined;
          }
        };
        // Run one immediate poll, then start interval after a short debounce
        if (!cancelled) {
          if (import.meta.env.DEV) console.debug('[MapSeriesPoll] immediate poll');
          await pollOnce();
        }
        initialTimeout = window.setTimeout(async () => {
          if (!cancelled) {
            if (import.meta.env.DEV) console.debug('[MapSeriesPoll] start interval (10s)');
            interval = window.setInterval(async () => {
              if (import.meta.env.DEV) console.debug('[MapSeriesPoll] interval tick');
              await pollOnce();
            }, 10000);
          }
        }, 1500);
      } catch {
        // ignore polling setup errors
      }
    })();
    return () => {
      cancelled = true;
      if (initialTimeout) clearTimeout(initialTimeout);
      if (import.meta.env.DEV) console.debug('[MapSeriesPoll] cleanup: clearing timers');
      if (interval) clearInterval(interval);
    };
  }, [mapSeriesLinks, getOrgHostname, orgBase, token]);

  return (
    <div className="converter-container">
      
      <h2>Classic Story Map Converter</h2>
      <p>Convert Classic Esri Story Maps to <a href="https://storymaps.arcgis.com" target="_blank" rel="noopener noreferrer">ArcGIS StoryMaps</a></p>
      <div className="converter-instructions">
        <h3>Instructions:</h3>
        <ol>
          <li>Sign in to ArcGIS Online using the sign-in button above</li>
          <li>Enter the Item ID of your Classic Story</li>
          <li>Click Convert to transform your classic story into the new format</li>
          <li>Click Finishing Publishing to open the converted story. Review and publish when ready</li>
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
      <div className="converter-input-group">
        <label className="converter-label">
          <input
            type="checkbox"
            checked={!suppressMetadata}
            onChange={(e) => setSuppressMetadata(!e.target.checked)}
          />{' '}
          Enable metadata output
          {' '}
          <span
            role="button"
            aria-label="Metadata output info"
            title="When enabled, adds a resource node to the output json recording the original classic story's parameters and other diagnostics"
            onClick={() => alert("When enabled, adds a resource node to the output json recording the original classic story's parameters and other diagnostics")}
            className="metadata-info-icon"
          >
            <span className="metadata-info-fallback">ℹ️</span>
          </span>
        </label>
      </div>
      {cacheSize > 0 && (
        <div className="converter-controls-row">
          <button
            className={`converter-btn secondary`}
            onClick={() => {
              clearFetchCache();
              resetForNewRun();
              setToast('Cache cleared');
              setTimeout(() => setToast(''), 2000);
            }}
            title={'Clear in-memory fetch cache'}
          >
            Clear cached data
          </button>
        </div>
      )}
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
            // When idle or after an error, prefer dynamic buttonLabel if available
            if (status === 'idle' || status === 'error') return buttonLabel || 'Convert';
            if (hoverCancel && ['fetching','converting','transferring','updating'].includes(status)) return 'Cancel';
            return buttonLabel || 'Convert';
          })()}
        </button>
      ) : (
        <div className="converter-message converter-message-success">
          <button
            className="converter-btn secondary"
            onClick={() => { if (convertedUrl) { window.open(convertedUrl, '_blank'); } }}
            title="Open in ArcGIS StoryMaps to finish publishing"
          >
            Click to Finish Publishing →
          </button>
          {convertedUrl && (
            <div className="converter-help-text publishing-url-block">
              <strong>Publishing URL:</strong> <a href={convertedUrl} target="_blank" rel="noopener noreferrer">{convertedUrl}</a>
            </div>
          )}
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
          <strong>Custom CSS Detected!</strong> Your classic story used custom CSS settings. To recreate your custom styles you should create a new ArcGIS StoryMaps Theme <a href="https://storymaps.arcgis.com/themes/new" target="_blank" rel="noopener noreferrer">here</a> with your custom colors and styles, then apply the new Theme within the ArcGIS StoryMaps Builder (under the Design tab). <a href={customCssInfo.url} download={customCssInfo.fileName || 'custom-css.css'}>Click this link</a> to download a copy of your custom CSS.
        </div>
      )}
      {/* DEV local JSON controls moved below warnings */}
      {/* converter-publish section removed */}
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
      {/* Map Series publishing panel with auto-check when published_data.json exists */}
      {mapSeriesLinks.length > 0 && (
        <div className="mapseries-publish">
          <h3>Publish Map Series Entries</h3>
          {/* Initialize and poll for published_data.json per entry */}
          {(() => {
            // Lazy inline setup: establish published-state length when links render
            try {
              if (!Array.isArray(mapSeriesPublished) || mapSeriesPublished.length !== mapSeriesLinks.length) {
                const ids = mapSeriesDraftIds.current || [];
                const init = ids.map(id => Boolean(mapSeriesPublishedByIdRef.current[id]));
                // If ids length differs from links length, pad with false
                const padded = init.length === mapSeriesLinks.length
                  ? init
                  : Array.from({ length: mapSeriesLinks.length }, (_, i) => Boolean(init[i]));
                setMapSeriesPublished(padded);
              }
            } catch {
              // ignore initialization errors
            }
            return null;
          })()}
          <ul>
            {mapSeriesLinks.map((l, idx) => (
              <li key={idx}>
                <a href={l.href} target="_blank" rel="noopener">Open Builder: {l.title}</a>
                <label className="mapseries-publish-label">
                  <input
                    type="checkbox"
                    checked={mapSeriesPublished[idx] === true}
                    onChange={(e) => {
                      const next = [...mapSeriesPublished];
                      next[idx] = e.currentTarget.checked;
                      setMapSeriesPublished(next);
                      const allChecked = next.length > 0 && next.every(Boolean);
                      setMapSeriesReadyToCollect(allChecked);
                    }}
                  /> Published
                </label>
              </li>
            ))}
          </ul>
          {isValidClassicId(classicItemId) && (
            <>
            <button className={`mapseries-collection-publish-btn`} disabled={!mapSeriesReadyToCollect} onClick={async () => {
              try {
                setToast('Creating Collection...');
                const tkn = token;
                if (!tkn) { setToast('No token available'); setTimeout(() => setToast(''), 2000); return; }
                const username = await getUsername(tkn);
                // Derive collection title from classic item details and prefix with (Converted)
                const classicDetails = await getItemDetails(classicItemId, tkn);
                const classicTitleResolved = String((classicDetails as { title?: string })?.title || '').trim();
                const title = classicTitleResolved ? `(Converted) ${classicTitleResolved}` : '(Converted) Map Series';
                // Detect accordion layout from typeKeywords when available
                const tk = (classicDetails as { typeKeywords?: unknown })?.typeKeywords;
                const typeKeywords = Array.isArray(tk) ? tk.filter((s): s is string => typeof s === 'string') : [];
                const isAccordion = typeKeywords.some(k => /accordion/i.test(k));
                // Prefer explicit layout id from classic JSON values if present
                let layoutType = isAccordion ? 'tab' : undefined;
                try {
                  const explicitLayoutId = String(((classicData as unknown as { values?: { settings?: { layout?: { id?: string } } } })?.values?.settings?.layout?.id) || '').trim();
                  if (explicitLayoutId) layoutType = explicitLayoutId;
                } catch { /* ignore layout detection errors */ }
                // Detect theme base + overrides from classic JSON
                let themeBase: 'summit' | 'obsidian' = 'summit';
                let themeOverrides: Record<string, unknown> = {};
                try {
                  const colors = ((classicData as unknown as { values?: { settings?: { theme?: { colors?: Record<string, unknown> } } } })?.values?.settings?.theme?.colors) || {};
                  const group = String((colors as { group?: string })?.group || '').toLowerCase();
                  themeBase = group === 'dark' ? 'obsidian' : 'summit';
                  themeOverrides = colors || {};
                } catch { /* ignore theme detection errors */ }
                // Build entries from last conversion result stored in state
                const entries = mapSeriesLinks.map((l, idx) => ({
                  itemId: (mapSeriesDraftIds.current?.[idx] || ''),
                  title: l.title,
                  thumbnailUrl: (mapSeriesThumbUrls.current?.[idx] || '')
                }));
                const collectionId = await createCollectionDraft(username, tkn, title, entries, { byline: '', themeBase, themeOverrides, layoutType });
                // Attempt to set the collection's thumbnail to the classic story's thumbnail
                const classicThumbName = (classicDetails as { thumbnail?: string })?.thumbnail;
                if (classicThumbName) {
                  const classicThumbUrl = `${getOrgBase()}/sharing/rest/content/items/${classicItemId}/info/${classicThumbName}?token=${tkn}`;
                  try {
                    await updateItemThumbnailUrl(collectionId, username, tkn, classicThumbUrl);
                  } catch (thumbErr) {
                    console.warn('[CreateCollection] Thumbnail update failed:', thumbErr);
                  }
                }
                const editUrl = `https://storymaps.arcgis.com/stories/${collectionId}/edit`;
                setCollectionEditUrl(editUrl);
                setToast(`Collection created: ${collectionId}`);
                setTimeout(() => setToast(''), 3000);
              } catch (e) {
                console.error('[CreateCollection] Failed:', e);
                setToast('Failed to create Collection');
                setTimeout(() => setToast(''), 3000);
              }
            }}>
              Create Collection
            </button>
            {collectionEditUrl ? (
              <div className="converter-message converter-message-success publishing-url-block collection-publish-block">
                <button
                  className="converter-btn secondary"
                  onClick={() => { window.open(collectionEditUrl, '_blank'); }}
                  title="Open Collection in ArcGIS StoryMaps to finish publishing"
                >
                  Click to Finish Publishing →
                </button>
                <div className="converter-help-text collection-publish-url">
                  <strong>Publishing URL:</strong> <a href={collectionEditUrl} target="_blank" rel="noopener noreferrer">{collectionEditUrl}</a>
                </div>
              </div>
            ) : null}
            </>
          )}
        </div>
      )}
      {import.meta.env.DEV && (
        <div className="converter-input-group dev-extra-margin">
          <label className="converter-label">
            <input type="checkbox" checked={useLocalJson} onChange={e => setUseLocalJson(e.target.checked)} /> Use a local JSON file
          </label>
          {useLocalJson && (
            <input
              type="text"
              value={localJsonPath}
              onChange={e => setLocalJsonPath(e.target.value)}
              placeholder="tmp-converted/converted-app-...-stdout.json"
              className="converter-input"
            />
          )}
          <div className="converter-controls-row">
            <button
              className="converter-btn"
              onClick={async () => {
                if (!localJsonPath) return;
                try {
                  const url = `/.netlify/functions/publish-draft-from-file?file=${encodeURIComponent(localJsonPath)}`;
                  const res = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : undefined });
                  const j = await res.json();
                  if (!j.ok) throw new Error(j.error || 'Publish from file failed');
                  const editUrl = j.editUrl as string | undefined;
                  if (editUrl) {
                    setConvertedUrl(editUrl);
                    window.open(editUrl, '_blank');
                    setToast(`Published draft. Edit: ${editUrl}`);
                  } else {
                    setToast('Published draft (no edit URL returned)');
                  }
                  setTimeout(() => setToast(''), 5000);
                } catch (e) {
                  setToast((e as Error)?.message || 'Publish from file failed');
                  setTimeout(() => setToast(''), 3000);
                }
              }}
            >Publish from local JSON</button>
          </div>
        </div>
      )}
    </div>
  );
}