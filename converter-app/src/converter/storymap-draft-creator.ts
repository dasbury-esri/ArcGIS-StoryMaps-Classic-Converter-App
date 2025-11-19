/**
 * Empty StoryMap Creator
 * Uses the ArcGIS REST API to create a draft story
 * to be used as the container for the conversion
 */
import { createBaseStorymapJson } from "./storymap-schema";

export async function createDraftStoryMap(username: string, token: string, title: string) {
  const timestamp = Date.now();
  const draftResourceName = `draft_${timestamp}.json`;
  const typeKeywords = [
    "StoryMap",
    `smdraftresourceid:${draftResourceName}`,
    "smstatusdraft",
    "smeditorapp:converter-v3alpha"
  ];

  // Generate minimal valid StoryMap JSON
  const minimalStoryMapJson = createBaseStorymapJson();  

  const params = new URLSearchParams({
    f: "json",
    type: "StoryMap",
    title,
    text: JSON.stringify(minimalStoryMapJson),
    typeKeywords: typeKeywords.join(","),
    token,
  });

  const response = await fetch(
    `https://www.arcgis.com/sharing/rest/content/users/${username}/addItem`,
    {
      method: "POST",
      body: params,
    }
  );
  const data = await response.json();
  if (!data.success) throw new Error(data.error?.message || "Failed to create StoryMap");
  return data.id;
}