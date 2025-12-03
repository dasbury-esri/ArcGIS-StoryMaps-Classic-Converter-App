/* Service interfaces for ArcGIS item operations (refactor side). */

export interface ItemDataService {
  fetchItemData(itemId: string, token: string): Promise<unknown>; // Classic JSON raw
}

export interface ItemDraftService {
  createDraftStory(username: string, token: string, title: string): Promise<string>; // returns storyId
  getItemDetails(itemId: string, token: string): Promise<unknown>;
  findDraftResourceName(details: unknown): string | undefined;
  removeResource(itemId: string, username: string, resourceName: string, token: string): Promise<void>;
  addResource(itemId: string, username: string, blob: Blob, resourceName: string, token: string): Promise<void>;
  updateItemKeywords(itemId: string, username: string, keywords: string[], token: string): Promise<void>;
}
