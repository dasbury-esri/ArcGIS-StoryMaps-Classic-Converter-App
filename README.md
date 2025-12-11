# Classic StoryMap to ArcGIS StoryMaps Converter

Convert Classic Esri Story Maps (Map Tour, Map Journal, Map Series, Cascade, Shortlist, Crowdsource, Swipe, Basic) to the new ArcGIS StoryMaps format.

## How to Use

**Web App:**

```powershell
cd converter-app
npm install
npm run dev
```
Open `http://localhost:5173` and follow the UI instructions.

## Security & Sample Data

This repository includes upstream Classic StoryMap configuration samples under `test_data/classics/` for conversion fidelity testing. One upstream file (`MapJournalConfig.js`) originally contained public YouTube and Flickr API keys used by Esri-hosted demo apps. These have been sanitized:

```javascript
YOUTUBE_API_KEY: "REDACTED_SAMPLE_KEY"
FLICKR_API_KEY: "REDACTED_SAMPLE_FLICKR_KEY"
```

If you need YouTube or Flickr API functionality in your own deployment, supply keys via environment variables (e.g. `VITE_YOUTUBE_API_KEY`, `VITE_FLICKR_API_KEY`) or a local non-committed config file. Do not hardcode live secrets in source-controlled test fixtures.

To further reduce secret scanning noise, consider adding a `.gitleaks.toml` allowlist entry for `REDACTED_SAMPLE_KEY`.

## Requirements

- beautifulsoup4

## License

Licensed under the MIT License. See the `LICENSE` file for details.


## Schema Compliance

This project adheres to official ArcGIS StoryMaps JSON schemas. Key schema compliance notes:

### Property Name Corrections

All converters use `alt` (not `altText`) per official schema:

- **Images**: `node.data.alt` for alternative text
- **Embeds**: `node.data.alt` for embed descriptions
- **Galleries**: `node.data.alt` on individual image nodes

### Embed Structure

Embeds store URLs directly in node data (no resources):

```json
{
  "type": "embed",
  "config": { "size": "standard" },
  "data": {
    "url": "https://example.com/video",
    "display": "inline",
    "embedType": "video",
    "isEmbedSupported": true
  }
}
```

### Gallery Structure

Gallery children are image **node IDs** (not resource IDs):

```json
{
  "type": "gallery",
  "data": {
    "galleryLayout": "square-dynamic" // REQUIRED: square-dynamic, jigsaw, or filmstrip
  },
  "children": ["n-abc123", "n-def456"] // Image node IDs
}
```

### Map Nodes
Map nodes use type `webmap` with minimal resource configuration:

```json
{
  "type": "webmap",
  "config": {"size": "wide"},
  "data": {
    "extent": {...},
    "viewpoint": {...}
  }
```

Map resources use `type: "minimal"` with only `itemId` and `itemType` to avoid duplication between resource-level and node-level configurations (per consultation with Kuan).


1. **Sidecar Structure**

   ```text
   sidecar (immersive)
   └── slide (immersive-slide)
       └── content nodes (text, images, etc.)
   ```

2. **Node ID Generation**

   - Format: `n-{uuid.uuid4().hex[:6]}` (e.g., `n-a1b2c3`)
3. **Map Processing**

   - Scale calculated from extent using coefficient 4.4 (Web Mercator approximation)
   - Layer visibility matched by ID or ID prefix
   - Viewpoint includes targetGeometry and scale
   - Resources set to "minimal" type to reduce payload

4. **Image Processing**

   - AGO resources downloaded locally with UUID filenames
   - Uploaded as StoryMap item resources
   - External URLs passed through as-is
   - Protocol-neutral URLs converted to https://

5. **HTML Content Processing**
   - BeautifulSoup parses classic HTML
   - Iterates through child elements
   - Extracts images, text, embeds
   - Cleans styling and non-essential tags
   - Creates appropriate StoryMap nodes

### Performance Characteristics

**API-Based Converter:**

- Journal with 10 sections: ~30-45 seconds
- Cascade with 5 immersive sections: ~45-60 seconds
- Bottleneck: Multiple API save/reload cycles for maps

**JSON-to-JSON Converter:**

- Same stories: ~5-10 seconds (no API calls)
- Bottleneck: Image downloads (if AGO resources present)
- Note: Excludes final upload time to create item

### Future Development Priorities

Based on IMPROVEMENTS.md analysis:

**Phase 1 (High Priority):**

- Fix critical bugs in converter_v2.py
- Extract utilities to shared module
- Add input validation

**Phase 2 (Medium Priority):**

- Create base converter class hierarchy
- Implement batch map processing
- Enhanced error handling with context

**Phase 3 (Low Priority):**

- Parallel image downloads
- Layer caching for repeated maps
- Transaction-based rollback mechanism

## Testing

Currently, testing is manual. Recommended test cases:

1. **Journal with maps**: Test map extent/layer preservation
2. **Journal with images**: Test AGO image download
3. **Series with embeds**: Test video/webpage conversion
4. **Cascade with cover**: Test theme detection
5. **Cascade with immersive**: Test floating sidecar creation
6. **Mixed content**: Test all media types in one story

Compare output between API and JSON converters for consistency.

## Contributing

When making changes:

1. Update this README with discoveries and changes
2. Document logic in CONVERTER_LOGIC.md if modifying conversion process
3. Update IMPROVEMENTS.md if identifying new issues or solutions
4. Maintain backward compatibility with existing conversions

### davi6569/fix-npm-run-dev

Found that `/converter-app/index.html` contained hardcoded references to the `./assets` folder which is only
created after a production build. Edited those lines to point to `/src/main.tsx` so Vite can run successfully.

### davi6569/AGO-oath2-integration

To ease user workflow, added a button to do authentication via ArcGIS Online OAuth2. Removed the token input field and its references from `index.html` and `Converter.tsx`; also updated `.gitignore` to exclude the `node_modules` folder.

### davi6569/minimal-test

- Changed "Open Converted Story" to "Click to Finish Publishing" and modified the URL to point to the story builder instead of the story viewer. This process won't work for integration into AGSM, but want to get it working for testing.
- Added folders to `test_data/classics` to ease identification of JSON files for testing.
- Hard coded test JSON file in `Converter.tsx`.

### davi6569/create-draft-story-via-REST-api

- Added `storymap-draft-creator.ts` and modified `Converter.tsx` to ease user friction by creating the target story via the ArcGIS REST API.
- Normalized image resource URLs during mapping when transferring images in `image-transfer.ts`.
- Modified `transferResults` in `Converter.tsx` to handle the array.
- Preserve original story title while creating a unique AGO item name to prevent REST API errors.

### davi6569/maptour-converter-python

- Attempting to create a converter for classic Map Tours.
- Testing first with Python before converting to React.
- Added a few JSON samples from Classic Map Tours.
- Tweaked `create_base_storymap_json()` to match JSON schema from AGSM builder.
- Tweaked `create_image_node()` to add `isExpandable` and `attribution` keys.
- Tweaked default converter config (changed from "full" to "minimal").
- Noticed that return patterns for functions are inconsistent within `storymap_json_schema.py`. Improves readability when consistent.
- Added helper functions to create Map Tour nodes and added to schema validation.
- Added helper function to create a carousel node for media in Map Tour.
- Temporarily using the ArcGIS Python API to create a target story (to be removed after testing).
- Created a `MapTourJSONConverter` class and edited `convert_classic_to_json()` and `JSONConverterFactory` class to accommodate.
- Added MapTourConverter notebook for testing.
- Conversion is mostly working but there seems to be an issue with how the map instantiates and updates. Need to closely review JSON schema.
- May need to add a secondary config page in the React app to allow users to modify AGSM Map Tour layouts.

### davi6569/maptour-converter

- Converted Python workflow to TypeScript/React.
- Handling images from Classic Map Tours is significantly more complex than just copying from one item to another.
- `maptour-converter.ts` `convert()` uses its own method to download images from the classic app and upload them to the target story.
- Modified `transferImage()` and `transferImages()` within `image-transfer.ts` to take `username`/`token` variables.
- Modified order of operations in `Converter.tsx` to accommodate Map Tour specific needs.
- Added local downloads for JSON files for debugging.
- Added `MapTourConverter` to converter-factory.
- Modified `getConverter()` to accept `username`, `token` and `targetStoryId` (required by `MapTourConverter`).
- Added `createCarouselNode()` to `utils.ts`.
- Modified `storymap-schema.ts` to mimic the AGSM Builder JSON schema exactly, including a `createCreditsNode()`.
- Added Map Tour specific node creators.
- Added a few helper functions to `utils` for Map Tour.
- Added a Node proxy server to handle CORS errors.
- Commented out local downloads.

## Environment Notes

- **Operating System**: Windows 10+
- **Python Version**: 3.11 (required by project configuration)
- **Shell**: PowerShell (preferred, per user preference)
- **Authentication**: Uses environment variables or ArcGIS "home" authentication

## Support

For issues or questions:

1. Check CONVERTER_LOGIC.md for detailed behavior documentation
2. Review CONVERTER_LOGIC_DIAGRAM.md for visual process flow
3. Consult IMPROVEMENTS.md for known issues and workarounds

---

**Note**: This is a development tool for migrating classic stories. Always review converted stories before publishing to ensure content accuracy and completeness.
