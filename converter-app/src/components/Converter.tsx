/**
 * Classic StoryMap to ArcGIS StoryMaps Converter UI
 * Minimal form interface for conversion
 */

import { useState, useEffect, useRef, useCallback } from "react";
// Refactor pipeline imports (feature-flagged)
import { useRefactorFlagReactive } from "../refactor/util/featureFlag";
import { convertClassicToJsonRefactored } from "../refactor";
import { detectClassicTemplate } from "../refactor/util/detectTemplate";
import { useAuth } from "../auth/useAuth";
import {
  getItemData,
  getItemDetails,
  findDraftResourceName,
  removeResource,
  addResource,
  updateItemKeywords,
} from "../api/arcgis-client";
import { convertClassicToJson } from "../converter/converter-factory";
import { createDraftStoryMap } from "../converter/storymap-draft-creator";
import { transferImage } from "../api/image-transfer";


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
  const useRefactor = useRefactorFlagReactive(); // Reactively reflects current URL (?refactor=1)
  // Declare core status-related state early to avoid TDZ access in effects
  const { token, userInfo } = useAuth();
  const [classicItemId, setClassicItemId] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");
  const [convertedUrl, setConvertedUrl] = useState("");
  const [copiedUrl, setCopiedUrl] = useState(false);
  // buttonLabel retained for future extended messaging but currently unused
  const [buttonLabel, setButtonLabel] = useState("Convert");
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
  useEffect(() => {
    console.info(`[Converter] Pipeline selected: ${useRefactor ? 'refactor' : 'legacy'}`);
  }, [useRefactor]);

  // Ephemeral copied notice timeout
  useEffect(() => {
    if (!copiedUrl) return;
    const t = setTimeout(() => setCopiedUrl(false), 2000);
    return () => clearTimeout(t);
  }, [copiedUrl]);

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
  // Classic item id must be 32 hex characters
  const isValidClassicId = (id: string): boolean => /^[a-f0-9]{32}$/i.test(id.trim());
    const handleConvert = async () => {
      console.debug('[Converter] useRefactor?', useRefactor);
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
        if (classicData.values.webmap) {
          setMessage("Fetching classic webmap data...");
          const webmapId = classicData.values.webmap;
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

        // Convert to new JSON (legacy or refactored pipeline)
        setStatus("converting");
        const templateLabel = runtimeTemplate || detectedTemplate || "story";
        setButtonLabel(`Converting ${templateLabel}: ${coverTitle}...`);
        setMessage(
          useRefactor
            ? `[Refactor][${templateLabel}] Converting ${templateLabel}: "${coverTitle}" via new pipeline...`
            : `Converting ${templateLabel} story to new format...`
        );

        let newStorymapJson: unknown;
        if (useRefactor) {
          const uploader = async (url: string, storyId: string, user: string, tk: string) => {
            if (cancelRequestedRef.current) throw new Error("Conversion cancelled by user intervention");
            const res = await transferImage(url, storyId, user, tk);
            return { originalUrl: url, resourceName: res.resourceName, transferred: !!res.isTransferred };
          };
          // Progress callback will compute count suffix dynamically per event
          const pipelineResult = await convertClassicToJsonRefactored({
            classicJson: classicData,
            storyId: targetStoryId,
            classicItemId,
            username,
            token,
            themeId: "summit",
            progress: (e) => {
              if (cancelRequestedRef.current) return; // suppress updates post-cancel
              const alreadyHasCount = /\(\s*\d+\s*\/\s*\d+\s*\)\s*$/.test(e.message);
              const msg = e.total && !alreadyHasCount
                ? `${e.message} (${e.current}/${e.total})`
                : e.message;
              switch (e.stage) {
                case 'media':
                  setStatus('transferring');
                  setMessage(msg);
                  break;
                case 'convert':
                  setStatus('converting');
                  setMessage(msg);
                  break;
                case 'finalize':
                  setStatus('updating');
                  setMessage(msg);
                  break;
                case 'error':
                  setStatus('error');
                  setMessage(msg);
                  break;
                case 'done':
                  setStatus('success');
                  setMessage(msg);
                  break;
                default:
                  setMessage(msg);
              }
            },
            isCancelled: () => cancelRequestedRef.current,
            uploader
          });
          newStorymapJson = pipelineResult.storymapJson;
        } else {
          newStorymapJson = await convertClassicToJson(
            classicData,
            "summit",
            username,
            token,
            targetStoryId
          );
        }
        checkCancelled();

        // Extract custom CSS (if any) from converter-metadata decisions
        try {
          const metadataRes = newStorymapJson?.resources && Object.values<unknown>(newStorymapJson.resources).find((r: unknown) => r.type === 'converter-metadata');
          const cssCombined = metadataRes?.data?.classicMetadata?.mappingDecisions?.customCss?.combined;
          if (cssCombined) {
            const blob = new Blob([cssCombined], { type: 'text/css' });
            const url = URL.createObjectURL(blob);
            setCustomCssInfo({ css: cssCombined, url });
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
      } catch (error: unknown) {
        if (error?.message === "Conversion cancelled by user intervention") {
          // Already set via handleCancel; ensure status stays error
          setStatus("error");
          setMessage(error.message);
        } else {
          setStatus("error");
          setMessage(error?.message || "An unknown error occurred");
        }
        // Log stack for debugging if available
        if (error?.stack) {
          console.debug('[ConverterCatch]', error.stack);
        }
        setPublishing(false);
      }
    };
  return (
    <div className="converter-container">
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
            if (status === 'success') return 'Success';
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
            onContextMenu={(e) => {
              e.preventDefault();
              if (!convertedUrl) return;
              navigator.clipboard.writeText(convertedUrl).then(() => setCopiedUrl(true)).catch(() => {});
            }}
            disabled={!publishing}
          >
            Click to Finish Publishing →
          </button>
          <div className="converter-url-row">
            <span className="converter-url-label">Converted URL:</span>{' '}
            <a href={convertedUrl} target="_blank" rel="noopener noreferrer" className="converter-url-link">{convertedUrl}</a>
            <button
              className="converter-copy-btn"
              onClick={() => {
                if (!convertedUrl) return;
                navigator.clipboard.writeText(convertedUrl).then(() => setCopiedUrl(true)).catch(() => {});
              }}
            >
              Copy URL
            </button>
            {copiedUrl && (
              <span className="converter-copy-hint">Copied!</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}