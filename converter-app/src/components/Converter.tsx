/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Classic StoryMap to ArcGIS StoryMaps Converter UI
 * Minimal form interface for conversion
 */

import { useState } from "react";
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
// Refactor pipeline imports (feature-flagged)
import { useRefactorFlag } from "../refactor/util/featureFlag";
import { convertClassicToJsonRefactored } from "../refactor";
import { detectClassicTemplate } from "../refactor/util/detectTemplate";

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
  const useRefactor = useRefactorFlag(); // Reflects current URL (?refactor=1)
  const [detectedTemplate, setDetectedTemplate] = useState<string | null>(null);
  const [customCssInfo, setCustomCssInfo] = useState<{ css: string; url: string } | null>(null);
  // Classic item id must be 32 hex characters
  const isValidClassicId = (id: string): boolean => /^[a-f0-9]{32}$/i.test(id.trim());
    const handleConvert = async () => {
      // Reset state
      setStatus("idle");
      setMessage("");
      setConvertedUrl("");
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
        // 1. Get username
        setStatus("fetching");
        setMessage("Getting user information...");
        const username = userInfo?.username || "";

        // 2. Fetch classic item data
        setMessage("Fetching classic story data...");
        const classicData = await getItemData(classicItemId, token);

        // 2.2 Detect template type early for messaging
        try {
          const template = detectClassicTemplate(classicData);
          setDetectedTemplate(template);
          setMessage(`Detected template: ${template}. Preparing resources...`);
        } catch {
          setDetectedTemplate(null);
        }

        // 2.5 Fetch classic webmap data
        if (classicData.values.webmap) {
          setMessage("Fetching classic webmap data...");
          const webmapId = classicData.values.webmap;
          classicData.webmapJson = await getItemData(webmapId, token);
        }

        // 3. Create an empty draft StoryMap
        setMessage("Creating new StoryMap draft...");
        const coverTitle = classicData.values?.title || "Untitled Story";
        const itemTitle = `(Converted) ${coverTitle}`;
        const targetStoryId = await createDraftStoryMap(username, token, itemTitle);

        // 3.a Determine base theme (summit/obsidian) will be applied inline with overrides during conversion
        setMessage("Mapping theme overrides (inline resource)...");

        // 3.5 Convert to new JSON (legacy or refactored pipeline)
        setStatus("converting");
        const templateLabel = detectedTemplate ? detectedTemplate : "Classic";
        setMessage(
          useRefactor
            ? `[Refactor][${templateLabel}] Converting ${templateLabel} story via new pipeline...`
            : `Converting ${templateLabel} story to new format...`
        );

        let newStorymapJson: any;
        if (useRefactor) {
          const uploader = async (url: string, storyId: string, user: string, tk: string) => {
            const res = await transferImage(url, storyId, user, tk);
            return { originalUrl: url, resourceName: res.resourceName, transferred: !!res.isTransferred };
          };

          const pipelineResult = await convertClassicToJsonRefactored({
            classicJson: classicData,
            storyId: targetStoryId,
            classicItemId,
            username,
            token,
            themeId: "summit",
            progress: (e) => {
              switch (e.stage) {
                case 'media':
                  setStatus('transferring');
                  setMessage(`${e.message}${e.total ? ` (${e.current}/${e.total})` : ''}`);
                  break;
                case 'convert':
                  setStatus('converting');
                  setMessage(e.message);
                  break;
                case 'finalize':
                  setStatus('updating');
                  setMessage(e.message);
                  break;
                case 'error':
                  setStatus('error');
                  setMessage(e.message);
                  break;
                case 'done':
                  setStatus('success');
                  setMessage(e.message);
                  break;
                default:
                  setMessage(e.message);
              }
            },
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

        // Extract custom CSS (if any) from converter-metadata decisions
        try {
          const metadataRes = newStorymapJson?.resources && Object.values<any>(newStorymapJson.resources).find((r: any) => r.type === 'converter-metadata');
          const cssCombined = metadataRes?.data?.classicMetadata?.mappingDecisions?.customCss?.combined;
          if (cssCombined) {
            const blob = new Blob([cssCombined], { type: 'text/css' });
            const url = URL.createObjectURL(blob);
            setCustomCssInfo({ css: cssCombined, url });
          }
        } catch {
          // ignore
        }

        // Theme resource already constructed during conversion with base theme + overrides.

        // // Skip image transfer if resources already have item-resource references
        // const needsTransfer = Object.values<any>(newStorymapJson.resources || {})
        //   .some(r => r.type === "image" && r.data?.src);

        // // 4. Transfer images from classic to target story
        // if (needsTransfer) {
        //   const imageUrls = collectImageUrls(newStorymapJson);
        //   if (imageUrls.length > 0) {
        //     setStatus("transferring");
        //     setMessage(`Transferring ${imageUrls.length} image(s) from classic story...`);

        //     const transferResultsArray = await transferImages(
        //       imageUrls,
        //       targetStoryId,
        //       username,
        //       token,
        //       (current, total, msg) => {
        //         setMessage(`Transferring images (${current}/${total}): ${msg}`);
        //       }
        //     );

        //     // Convert array to mapping
        //     const transferResults: Record<string, string> = {};
        //     for (const result of transferResultsArray) {
        //       transferResults[result.originalUrl] = result.resourceName;
        //     }

        //     // Update JSON to use proper resource structure
        //     newStorymapJson = updateImageUrlsInJson(
        //       newStorymapJson,
        //       transferResults
        //     );
        //   }
        // }

        // 5. Fetch target draft details
        setStatus("updating");
        setMessage("Fetching target storymap details...");
        const targetDetails = await getItemDetails(targetStoryId, token);

        // 6. Find draft resource name
        const draftResourceName = findDraftResourceName(targetDetails);
        if (!draftResourceName) {
          throw new Error("Could not find draft resource in target storymap. Make sure it is a draft storymap.");
        }

        // 7. Remove old draft resource
        setMessage(`Removing old draft resource (${draftResourceName})...`);
        await removeResource(targetStoryId, username, draftResourceName, token);

        // 8. Upload new draft resource (same name)
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

        // 9. Update keywords to add smconverter:online-app
        setMessage("Updating keywords...");
        const currentKeywords = targetDetails.typeKeywords || [];
        if (!currentKeywords.includes("smconverter:online-app")) {
          const newKeywords = [...currentKeywords, "smconverter:online-app"];
          await updateItemKeywords(targetStoryId, username, newKeywords, token);
        }

        // Success!
        setStatus("success");
        setMessage("Conversion complete!");
        setConvertedUrl(`https://storymaps.arcgis.com/stories/${targetStoryId}/edit`);
        setPublishing(true);
      } catch (error: any) {
        setStatus("error");
        setMessage(`Error: ${error.message || "An unknown error occurred"}`);
        setPublishing(false);
      }
    };
  const { token, userInfo } = useAuth();
  const [classicItemId, setClassicItemId] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");
  const [convertedUrl, setConvertedUrl] = useState("");
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
      <button
        className="converter-btn"
        onClick={handleConvert}
        disabled={publishing || (status !== "idle" && status !== "error" && status !== "success")}
      >
        {status === "idle" || status === "error" || status === "success" ? "Convert" : "Converting..."}
      </button>
      {message && (
        <div className={`converter-message converter-message-${status}`}>
          <strong>
            {status === "error"
              ? "Error:"
              : status === "success"
              ? "Success:"
              : "Status:"}
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
        </div>
      )}
    </div>
  );
}