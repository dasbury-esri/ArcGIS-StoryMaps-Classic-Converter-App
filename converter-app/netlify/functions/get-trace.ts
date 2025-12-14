import type { Handler } from "@netlify/functions";
import fs from "node:fs";
import path from "node:path";

// Reads a trace.json from a repository-relative path and returns its JSON.
// This avoids Netlify dev static root differences by serving through a function.
export const handler: Handler = async (event) => {
  try {
    const qPath = event.queryStringParameters?.path || "";
    if (!qPath) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Missing 'path' query parameter" }),
        headers: { "content-type": "application/json" },
      };
    }
    // Normalize and prevent path traversal
    const safeRel = qPath.replace(/^\/+/, "");
    if (safeRel.includes("..")) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Invalid path" }),
        headers: { "content-type": "application/json" },
      };
    }

    // Resolve repo root robustly by walking up until we find the repo folder
    const findDirUp = (start: string, targetName: string): string => {
      let cur = start;
      for (let i = 0; i < 8; i++) {
        const name = path.basename(cur);
        if (name === targetName) return cur;
        const next = path.resolve(cur, "..");
        if (next === cur) break;
        cur = next;
      }
      // Fallback to two-up
      return path.resolve(start, "..", "..");
    };
    const repoRoot = findDirUp(process.cwd(), "ArcGIS-StoryMaps-Classic-Converter-App");
    const absPath = path.join(repoRoot, safeRel);

    if (!fs.existsSync(absPath)) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: "Trace not found", path: safeRel }),
        headers: { "content-type": "application/json" },
      };
    }

    const content = fs.readFileSync(absPath, "utf8");
    // Basic JSON validation
    try {
      const parsed = JSON.parse(content);
      return {
        statusCode: 200,
        body: JSON.stringify(parsed),
        headers: { "content-type": "application/json" },
      };
    } catch {
      return {
        statusCode: 415,
        body: JSON.stringify({ error: "File content is not valid JSON", path: safeRel }),
        headers: { "content-type": "application/json" },
      };
    }
  } catch (err: unknown) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: String((err as Error)?.message || err) }),
      headers: { "content-type": "application/json" },
    };
  }
};
