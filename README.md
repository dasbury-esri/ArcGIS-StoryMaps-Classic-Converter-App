

# Classic StoryMap to ArcGIS StoryMaps Converter

Convert Classic ArcGIS StoryMaps (MapJournal, MapSeries, Cascade) to the new ArcGIS StoryMaps format.

## How to Use

**API-Based Conversion:**
Edit config in `converter_v2.py` and run:
```powershell
python converter_v2.py
```

**JSON-to-JSON Conversion:**
Import and use `convert_classic_to_json` and `save_json_to_file` in Python.

**Testing:**
```powershell
python test_converter.py
```

**Web App:**
```powershell
cd converter-app
npm install
npm run dev
```
Open `http://localhost:5173` and follow the UI instructions.

## Requirements

- Python 3.11
- arcgis >= 2.1.0.2 (for API-based conversion)
- beautifulsoup4
- python-dotenv (optional)

## License

[Add license information here]


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
    "map": "r-abc123",
    "extent": {...},
    "viewpoint": {...}
  }
}
```

Map resources use `type: "minimal"` with only `itemId` and `itemType` to avoid duplication between resource-level and node-level configurations (per consultation with Kuan).

### Conversion Logic Insights

1. **Sidecar Structure**

   ```
   sidecar (immersive)
   └── slide (immersive-slide)
       └── narrative (immersive-narrative-panel)
           └── content nodes (text, images, etc.)
   ```

2. **Node ID Generation**

   - Format: `n-{uuid.uuid4().hex[:6]}` (e.g., `n-a1b2c3`)
   - Resource IDs: `r-{uuid.uuid4().hex[:6]}`

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
Found that /converter-app/index.html contained hardcoded references to the ./assets folder which is only
created after a production build. Edited those lines to point to /src/main.tsx so Vite can run successfully
### davi6569/AGO-oath2-integration
To ease user workflow, added a button to do authentication via ArcGIS Online OAuth2. Removed the token input field and its references from index.html and Converter.tsx also updated .gitignore to exclude the node_modules folder
### davi6569/minimal-test
- Changed "Open Converted Story" to "Click to Finish Publishing" and modified the url to point to the story builder instead of the story viewer. This process won't work for integration into AGSM, but want to get it working for testing. 
- Added folders to test_data/classics to ease identification of json files for testing.
- Hard coded test json file in Converter.tsx
### davi6569/create-draft-story-via-REST-api
- Added storymap-draft-creator.ts and modified Converter.tsx to ease user friction by creating the target story via the ArcGIS REST api.
- Normalized image resource urls during mapping when transferring images in image-transfer.ts
- Modified transferResults in Converter.tsx to handle the array
- Preserve original story title while creating a unique AGO item name to prevent REST api errors
### davi6569/maptour-converter-python
- attempting to create a converter for classic Map Tours
- testing first with Python before converting to React
- added a few json samples from Classic Map Tours
- tweaked create_base_storymap_json() to match json schema from AGSM builder
- tweaked create_image_node() to add isExpandable and attribution keys
- tweaked default conver config (changed from "full" to "minimal")
- noticed that return patterns for functions is inconsistent within storymap_json_schema.py. Not sure how much that matters, just makes it easier to read when consistent
- added helper functions to create MapTour nodes and added to schema validation
- added helper function to create a carousel node for media in MapTour
- temporarily using the ArcGIS Python API to create a target story. to be removed after testing
- created a MapTourJSONConverter class and edited convert_classic_to_json() and JSONConverterFactory class to accommodate
- added MapTourConverter notebook for testing
- Conversion is _mostly_ working but there seems to be an issue with how the map instantiates and updates. Need to closely review json schema.
- Guessing we'll need to add a secondary config page in the React app to allow users to modify AGSM MapTour layouts
### davi6569/maptour-converter
- converted python workflow to typescript/React
- handling images from Classic Map Tours is significantly more complex than just copying from one item to another
- So maptour-converter.ts convert() uses its own method to download images from the classic app and upload them to the target story
- modified transferImage() and transferIamges() within image-transfer.ts to take username/token variables. This may be unnecessary, but I did it awhile ago and don't remember at the moment why.
- Modified order of operations in Converter.tsx to accomodate Map Tour specific needs. This was also done awhile ago and may have little actual impact
- Added local downloads for json files for debugging 
- Added MapTourConverter to converter-factory
- Modified getConverter() to accept username, token and targetStoryId. Required by MapTourConverter
- Added createCarouselNode() to utils.ts
- modified storymap-schema.ts to mimic the AGSM Builder json schema exactly, including a createCreditsNode(). Some of this may be unnecessary, but wanted to see if the issues I was having were caused by malformed json.
- Added Map Tour specific node creators 
- added a few helper functions to utils for Map Tour
- added a Node proxy server to handle CORS errors
- Commented out local downloads

## Environment Notes

- **Operating System**: Windows 10+
- **Python Version**: 3.11 (required by project configuration)
- **Shell**: PowerShell (preferred, per user preference)
- **Authentication**: Uses environment variables or ArcGIS "home" authentication

## License

[Add license information here]

## Support

For issues or questions:

1. Check CONVERTER_LOGIC.md for detailed behavior documentation
2. Review CONVERTER_LOGIC_DIAGRAM.md for visual process flow
3. Consult IMPROVEMENTS.md for known issues and workarounds

---

**Note**: This is a development tool for migrating classic stories. Always review converted stories before publishing to ensure content accuracy and completeness.
