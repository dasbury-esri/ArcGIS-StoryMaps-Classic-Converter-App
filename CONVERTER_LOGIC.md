# Classic StoryMap Converter - Logic Documentation

## Overview

The `converter_v2.py` script converts Classic ArcGIS StoryMaps (MapJournal, MapSeries, and Cascade) to the new ArcGIS StoryMaps format. It uses the ArcGIS Python API to create new StoryMap items with equivalent content from classic stories.

**Supported Classic Types:**

- **MapJournal**: Side panel navigation with main stage media
- **MapSeries**: Tab-based navigation (treated identically to Journal)
- **Cascade**: Scrolling narrative with immersive sections

**Output Format:**

- All classic types convert to ArcGIS StoryMaps with sidecar layouts
- Journal/Series → Docked-panel sidecars
- Cascade immersive sections → Floating-panel sidecars

---

## Key Design Decisions

### Map Resource Configuration (Consultation with Kuan)

**Decision:** All map resources use `type: "minimal"` with reduced properties.

**Rationale:** This approach, established in consultation with Kuan, ensures that StoryMap map resources only contain essential metadata (itemId and itemType). Individual map nodes specify their own extent, viewpoint, zoom, and layer visibility settings. This pattern:

- Prevents duplication between resource-level and node-level configurations
- Avoids conflicts when different slides need different map states
- Reduces payload size in the JSON structure
- Aligns with ArcGIS StoryMaps best practices

**Implementation:** See "Post-Processing: Resource Cleanup" in both Journal/Series (line 515) and Cascade (line 1148) conversion flows.

### Video and Embed Resources

**Decision:** Videos and embeds are always stored as URL references, never as uploaded resources.

**Rationale:** Unlike images, video content is not downloaded or stored as StoryMap item resources. Videos and webpage embeds:

- Reference external URLs (YouTube, Vimeo, etc.)
- Are not embedded or base64 encoded
- Remain as URL strings in the embed resource data
- Ensure lightweight StoryMap items that don't store large video files

**Technical Note:** The converter ensures all video/webpage URLs have `https://` protocol and are stored in embed nodes with appropriate `embedType` (video or link) and `display` mode (inline or card).

**Implementation:** See "Process video/webpage embed media" in Journal/Series (line 324-331) and Cascade embed processing.

## Architecture

### Entry Point

**Function:** `convert_classic(itemid, theme_id='summit')` (Line 1163)

This is the main dispatcher function that:

1. Fetches the classic story item by ID
2. Examines `typeKeywords` to determine story type
3. Routes to appropriate converter:
   - MapJournal/MapSeries → `convert_series_or_journal()`
   - Cascade → `convert_cascade()`
4. Passes theme_id for styling

**Known Bug:** Line 1164 uses `classic_story_id` (global variable) instead of the `itemid` parameter.

---

## Utility Functions

### Image Processing

**`process_img_tag(src)`** (Lines 170-197)

Handles image URLs from classic stories:

**Purpose:** Download ArcGIS Online resource images locally to preserve them in the new story item.

**Logic:**

1. If URL starts with `https://<org>.maps.arcgis.com/sharing/rest/content` (or your Enterprise portal base):
   - Appends authentication token
   - Downloads to local file with UUID filename
   - Returns local path
2. If URL starts with `//<org>.maps.arcgis.com/sharing/rest/content`:
   - Prepends `https:` protocol
   - Downloads with token
   - Returns local path
3. Otherwise:
   - Returns URL as-is (external images)
   - Adds `https:` protocol if missing

**Returns:** Local file path (for AGO images) or URL (for external images)

### Sidecar Creation

**`add_empty_sidecar(agsm_storymap, type="docker-panel")`** (Lines 89-125)

Creates the JSON node structure for a sidecar (immersive content with slides).

**Purpose:** The ArcGIS Python API v2.1.0.2 doesn't have built-in sidecar creation, so this manually constructs the node hierarchy.

**Process:**

1. Generate three unique node IDs using UUID:
   - `side_car_node`: The immersive container
   - `slide_node`: Individual slide wrapper
   - `narrative_node`: Narrative panel for content
2. Insert sidecar node into story's root children (position -2, before credits)
3. Create node structure:
   ```
   sidecar (immersive)
   └── slide (immersive-slide)
       └── narrative (immersive-narrative-panel)
   ```

**Node Structures:**

- **Narrative Panel:** `{"type": "immersive-narrative-panel", "data": {"panelStyle": "themed"}}`
- **Slide:** `{"type": "immersive-slide", "data": {"transition": "fade"}, "children": [narrative_node]}`
- **Sidecar:** `{"type": "immersive", "data": {"type": "sidecar", "subtype": type}, "children": [slide_node]}`

**Returns:** `(side_car_node, slide_node, narrative_node)` tuple

### Map Scale Calculation

**`determine_scale_level(given_extent, scale_cofficient=4.4)`** (Lines 127-146)

Converts geographic extent to appropriate map scale enum.

**Purpose:** ArcGIS StoryMaps requires discrete scale levels (Scales enum), not arbitrary zoom levels.

**Logic:**

1. Calculate extent height: `ymax - ymin`
2. Apply scale coefficient (4.4 is approximate for Web Mercator)
3. Find closest matching Scale enum value
4. Returns scale enum and integer scale value

**Returns:** `(scale_enum, scale_int)`

**`determine_scale_zoom_level(given_extent, scale_cofficient=4.4)`** (Lines 147-168)

Similar to above but also returns zoom level.

**Improvements needed:** Both functions have similar logic and could be consolidated.

### String Cleaning

**`remove_span_tags(data)`** (Lines 71-87)

Recursively removes non-essential HTML tags from content.

**Accepted Tags:** `strong`, `em`, `ol`, `li`, `ul`, `a`, `img`

**Logic:**

- Unwraps (removes but keeps content) any tag not in accepted list
- Handles strings, dicts, and lists recursively
- Removes newlines from HTML strings

**`replace_single_quotes(json_obj)`** (Lines 50-63)

Recursively replaces single quotes with double quotes in JSON-like objects.

**Purpose:** Ensures JSON compatibility when properties contain quoted strings.

**`is_nonempty_string(string)`** (Lines 65-69)

Checks if a string has non-whitespace content.

**`force_valid_python_string(input_string)`** (Lines 41-48)

Escapes special characters and wraps in quotes (appears unused in current code).

---

## Journal/Series Conversion

**Function:** `convert_series_or_journal(classic_story_id, theme_id="summit")` (Lines 199-567)

### Overview

Converts MapJournal and MapSeries classic stories to ArcGIS StoryMaps with docked-panel sidecars. Both types use identical conversion logic since they share the same data structure.

### Conversion Flow

#### 1. Initialization (Lines 214-238)

**Setup tracking dictionaries:**

```python
map_setting_dict = {}      # Store map extent, scale, layers, legend settings
embed_settings_dict = {}   # Store embed type (video/link) and display mode
image_settings_dict = {}   # (Defined but unused)
local_images = []          # Track downloaded images for cleanup
```

**Create base story:**

- Initialize empty StoryMap
- Add empty docked-panel sidecar using `add_empty_sidecar()`
- Get sidecar reference for adding slides

#### 2. Fetch Classic Story Data (Lines 241-262)

- Get Item object from ArcGIS
- Validate type (MapJournal or MapSeries)
- Extract title from `values.title`
- Get sections:
  - Journal: `values.story.sections`
  - Series: `values.story.entries`

#### 3. Process Sections Loop (Lines 266-473)

**For each section:**

##### A. Determine Slide Media (Lines 268-346)

Media types: `webmap`, `image`, `video`, `webpage`

**If webmap:**

- Extract settings: legend, extent, layers, map ID
- Create `sc.Map(item=map_id)` node
- Calculate scale from extent using `determine_scale_level()`
- Store settings in `map_setting_dict[map_node.node]`
- If no extent in classic data, fetch from WebMap item's initialState

**If image/video/webpage:**

- Get URL from section media
- If image is AGO resource, download locally using `process_img_tag()`

  > [!warning]
  > Not sure if embedly types is the safest way to do the following steps. Originally I didn't understand our embed logic well enough. Maybe we should treat all these as non embedly embeds if possible

- Convert video/webpage to embed type

  > [!note]
  > All classic videos handled here are represented as URLs, not as uploaded video files. So we just need to set the correct embedly type.

- Set embedlyType: 'video' or 'link'
- Create appropriate content node (Image, Video, or Embed)
- Store embed settings in `embed_settings_dict[embed_node.node]`
- Ensure URL has `https://` protocol

##### B. Process Narrative Content (Lines 348-472)

Initialize `section_content_for_slide` list.

**Add title:**

- Parse section title HTML with BeautifulSoup
- Create Text node with HEADING style
- Add to slide content list

**Parse description/content HTML:**

- Use BeautifulSoup to parse section content
- Iterate through child elements

**Element handling:**

- **`<p>` tags:** Clean HTML, remove styling, create Text with PARAGRAPH style
- **Caption classes:** Extract images and text from figure/caption structures
- **`<img>` tags:** Process URL, download if AGO resource, create Image node
- **`iframe-container` classes:** Extract embed URL, create Embed node with settings
- **`<div>` tags:** Extract text content, create Text node

**HTML cleaning:**

- Remove span tags and styling
- Strip paragraph tag wrappers
- Replace quotes
- Check for non-empty strings before adding

**Error handling:**

- Individual sections wrapped in try-catch
- Prints error and skips problematic section
- Continues processing remaining sections

##### C. Add Slide to Sidecar (Line 473)

```python
story_sidecar.add_slide(contents=section_content_for_slide, media=slide_media)
```

#### 4. Initial Save and Cleanup (Lines 474-478)

- Set empty cover (placeholder)
- Clean single quotes from properties
- Remove span tags from all properties
- Save story to ArcGIS

#### 5. Post-Processing: Map Settings (Lines 482-510)

**Why needed:** ArcGIS Python API 2.2 has recursive map media issues requiring save/reload per map.

**For each map node:**

1. Reload story: `StoryMap(new_storymap._itemid)`
2. Get map node reference through sidecar
3. Fetch actual map item and extract layers
4. Build `mapLayers` array: `[{"id":layer.id, "title":layer.title, "visible":layer.visibility}]`
5. Apply viewpoint using `map_node.set_viewpoint(extent, scale)`
6. Match classic layer visibility to new map layers by ID (or ID prefix)
7. Remove zoom/center properties to allow extent-based positioning
8. Save story

**Performance issue:** This loop saves the story multiple times (once per map).

#### 6. Post-Processing: Resource Cleanup (Lines 515-531)

**For all resources:**

- If webmap resource:
  - Set `type` to "minimal" (reduces total datamodel requirement)
  - Remove redundant properties: zoom, center, viewpoint, mapLayers, extent
- If story-theme resource:
  - Set theme based on theme_id parameter
  - Standard themes: use `themeId`
  - Custom themes: use `themeItemId`

#### 7. Post-Processing: Embed Settings (Lines 535-541)

**For each embed node:**

- Set `embedType` from stored settings (video/link)
- Set `display` mode (card/inline)
- Set `isEmbedSupported` to true

#### 8. Final Cleanup (Lines 546-564)

1. Delete local image files using `os.remove()`
2. Remove empty initial slide from sidecar children
3. Set story item title: `"(COPY) " + journal_title`
4. Set cover title: `"(COPY) " + journal_title`
5. Add conversion tracking keyword: `smconverted:converter-v2`
6. Final save (unpublished draft)
7. Print completion message and URL

---

## Cascade Conversion

**Function:** `convert_cascade(itemid, theme_id="summit")` (Lines 569-1161)

### Overview

Converts Cascade classic stories to ArcGIS StoryMaps. Cascade stories have more complex structure with multiple section types and immersive views.

### Nested Helper Functions

The converter uses nested functions to encapsulate block-specific logic. This creates scope issues but keeps related code together.

#### Section Processing

**`process_section(section, storymap)`** (Lines 583-643)

Main section dispatcher based on section type:

##### Cover Section (Lines 585-606)

- Extracts title and subtitle from foreground
- Handles background media (image or video)
- Image: Downloads and sets as cover image
- Video: Prints warning (not supported by API)
- Sets story title and cover

##### Sequence Section (Lines 607-613)

- Contains narrative blocks (text, images, maps, etc.)
- Iterates through blocks and calls `process_block()` for each
- Blocks added directly to story (not in sidecar)

##### Immersive Section (Line 615)

- Calls `handle_immersive_section()` (see below)
- Converts to floating-panel sidecar

##### Title Section (Lines 616-641)

- Creates centered heading text
- Optionally adds floating image
- Adds separator line if no image

##### Credits Section (Lines 642-643)

- Calls `handle_credit_section()`
- Currently returns early (line 779) due to API bug

#### Immersive Section Conversion

**`handle_immersive_section(section, storymap)`** (Lines 713-775)

Converts Cascade immersive sections to floating-panel sidecars.

**Process:**

1. Create empty floating-panel sidecar
2. Initialize tracking dicts:
   - `side_car_map_layer_visibility`: Map layer settings per node
   - `side_car_map_extent`: Map extents per node
   - `side_car_map_resources`: Resource IDs
3. Iterate through views (each becomes a slide)

**Per view:**

- **Background media** (slide media):
  - Image: Download and create Image node
    > [!Note] In classic stories, background media is always a link rather than an uploaded asset.
  - Video/webpage: Create Embed node (handles protocol)
  - Webmap: Create Map node, capture layers and extent
  - Webscene: Create Map node, capture layers and extent
- **Foreground panels** (narrative content):
  - Extract title from first view (once, since we are only interested in the title for the first view in cascade)
  - Iterate through panel blocks
  - Process each block with `process_block(return_as_content=True)`
  - Build narrative content list
- **Add slide** with media and narrative content
- **Fix map properties** using `fix_webmap_props()`

1. Remove initial empty slide

**`fix_webmap_props(node_visibility_dict, map_resources_dict, map_extents, storymap)`** (Lines 673-711)

Post-processes map nodes to apply correct settings.

**For each map node:**

1. Build modified layer list with visibility settings
2. Get actual map layers from WebMap/WebScene
3. Merge classic layer settings with actual layers
4. Set `mapLayers` property on node
5. Set extent on node
6. Calculate and set viewpoint and zoom (for WebMaps only)

**For each map resource:**

1. Set type to "minimal"
2. Remove redundant properties

#### Block Processing

**`process_block(block, storymap, **kwargs)`\*\* (Lines 1057-1076)

Dispatcher for block types. Can either add to story or return as content object.

**Block types:**

- `text` → `handleTextBlock()`
- `video`, `webpage` → `handle_embed_blocks()`
- `image` → `handle_image_blocks()`
- `image-gallery` → `handle_gallery_block()`
- `webscene` → `handle_webscene_block()`
- `webmap` → `handle_webmap_block()`

**Modes:**

- Default: Adds content directly to story. Was added in preperation of potentially in future adding as part of a sidecar.
- `return_as_content=True`: Returns content object for sidecars

##### Text Blocks

**`handleTextBlock(block, storymap, **kwargs)`\*\* (Lines 810-881)

Converts HTML text blocks to Text nodes.

**Process:**

1. Parse HTML with BeautifulSoup
2. Find outermost tag (h1, h2, p, blockquote)
3. Map to TextStyle: `textStyleMapping = {h1: HEADING, h2: SUBHEADING, p: PARAGRAPH, blockquote: QUOTE}`
4. Extract text-align style attribute
5. Map to alignment: `alignmentMapping = {left: start, center: center, right: end}`
6. Remove color span tags (styling not supported)
7. Replace `<br>` with newlines
8. Remove style attributes
9. Replace `<b>` with `<strong>`, `<i>` with `<em>` (normalize tags)
10. Create Text node with style
11. Set textAlignment property
12. Add to story or return as content

##### Embed Blocks

**`handle_embed_blocks(block, storymap, **kwargs)`\*\* (Lines 887-917)

Handles video and webpage embeds.

**Process:**

1. Extract URL from block type (video or webpage)
2. Ensure URL has `https://` protocol
3. Handle protocol-neutral URLs (`//example.com` → `https://example.com`)
4. Create Embed node
5. Set caption and altText if available
6. Add to story or return as content

##### Image Blocks

**`handle_image_blocks(block, storymap, **kwargs)`\*\* (Lines 919-942)

Handles image blocks.

**Process:**

1. Extract image URL
2. Process with `process_img_tag()` (downloads if AGO resource)
3. Create Image node
4. Set caption and altText (remove quotes from caption)
5. Add to story or return as content

##### Gallery Blocks

**`handle_gallery_block(block, storymap, **kwargs)`\*\* (Lines 944-959)

Handles image gallery blocks.

**Process:**

1. Extract images array
2. Process each image with `handle_image_blocks()`
3. Create Gallery node
4. Add all images to gallery
5. Set gallery caption and altText

##### WebMap Blocks

**`handle_webmap_block(block, storymap, **kwargs)`\*\* (Lines 1009-1055)

Handles webmap embeds.

**Two modes:**

**Content mode (for sidecars):**

1. Create Map node with item ID
2. Capture layer list and extent in tracking dicts
3. Return Map content object

**Direct mode:**

1. Create Map node and add to story
2. Get map resource and item ID
3. Fetch actual map layers
4. Build modified layer list (classic settings + actual layers)
5. Set mapLayers property
6. Calculate viewpoint and zoom from extent
7. Set extent, viewpoint, zoom properties
8. Set caption and altText

##### WebScene Blocks

**`handle_webscene_block(block, storymap, **kwargs)`\*\* (Lines 961-1007)

Similar to webmap handling but for 3D scenes.

**Differences:**

- Fetches layers from WebScene instead of WebMap
- Does not set viewpoint/zoom on scene nodes (line 1000 commented out)
- Only sets extent property

#### Credits Section (Currently Disabled)

**`handle_credit_section(section, storymap)`** (Lines 777-808)

**Returns early at line 779 due to Python API bug (to be fixed mid-2023).**

**Intended logic:**

1. Extract credit description from first panel block
2. Process as text block
3. Create or find credits node
4. Set description
5. Iterate through attributions
6. Add links inline to attribution text
7. Add each credit with content and attribution

**Issue:** Hardcoded node ID `"n-BWRGem"` at line 793.

#### Helper Functions

**`add_link_to_text(text, href)`** (Lines 649-652)

Wraps text in anchor tag with proper attributes.

**`get_layers(webmapid)`** (Lines 653-660)

Fetches layers from WebMap or WebScene item.

**`get_viewpoint(extent)`** (Lines 661-670)

Converts extent to viewpoint dict with scale.

### Main Conversion Flow

#### 1. Initialization (Lines 1080-1095)

Similar to Journal/Series:

- Define type_dict mapping
- Initialize tracking dictionaries
- Note: Unlike Journal/Series, Cascade doesn't pre-create sidecar

#### 2. Fetch Classic Story (Lines 1106-1133)

- Get Item and typeKeywords
- Validate type is Cascade
- Get item data
- **Theme detection:** Extract theme from cascade settings
  - `dark` → `obsidian`
  - `light` → `summit`
  - Falls back to script parameter
- Get sections array

#### 3. Process Sections (Lines 1134-1135)

Simple loop: `process_section(section, new_storymap)` for each section.

#### 4. Cleanup Downloaded Images (Lines 1139-1145)

Remove all local image files (_.jpg, _.png, _.gif, _.jpeg).

Uses glob pattern matching and `os.remove()`.

#### 5. Set Theme Resource (Lines 1148-1154)

Same as Journal/Series: set themeId or themeItemId based on theme_id.

#### 6. Final Save (Lines 1155-1161)

- Add conversion tracking keyword
- Save story
- Print completion message and URL

---

## Key Design Patterns

### Deferred Settings Pattern

**Problem:** The ArcGIS Python API requires nodes to be created before their properties can be fully configured.

**Solution:**

1. Create nodes with minimal data
2. Store additional settings in tracking dictionaries
3. Apply settings in post-processing phase
4. Save multiple times as needed due to python issues.

**Used in:**

- Map extent and layer visibility (Journal/Series, Cascade)
- Embed display types (Journal/Series)

### Two-Phase Conversion

**Phase 1: Structure Creation**

- Create base StoryMap
- Add all content nodes
- Initial save

**Phase 2: Property Refinement**

- Reload story (if needed)
- Update node properties
- Clean up resources
- Final save

### HTML Parsing Strategy

**BeautifulSoup for HTML content:**

1. Parse entire content block
2. Iterate through child elements
3. Detect element type and attributes
4. Extract text/media/URLs
5. Clean and normalize HTML
6. Create appropriate content nodes

**Challenges:**

- Classic stories have inconsistent HTML structure
- Many custom classes and nested elements
- Need to preserve some HTML (links, lists, formatting)
- Need to remove other HTML (spans, divs, styling)

---

## Known Issues and Limitations

### Bugs

1. **Line 1164:** `convert_classic()` uses global `classic_story_id` instead of `itemid` parameter
2. **Line 793:** Hardcoded node ID for credits
3. **Line 1111:** Incorrect boolean logic: `if 'Cascade'or 'cascade'` always true

### Performance Issues

1. **Multiple story reloads:** Journal/Series converter reloads story for each map (line 484)
2. **Sequential image downloads:** Images downloaded one at a time
3. **No resource pre-validation:** May fail partway through conversion

### Error Handling

1. **Minimal validation:** No upfront validation of item ID or structure
2. **Generic error catching:** Section processing catches all exceptions, prints, continues
3. **No rollback:** Failed conversions leave partial story items
4. **Silent failures:** Some errors only print messages, don't halt

### API Limitations

1. **Sidecar creation:** Must manually create node structure (add_empty_sidecar)
2. **Video covers:** Not supported in Python API (Cascade covers)
3. **Credits section:** Disabled due to API bug (line 779)
4. **Map recursive issue:** Requires story reload when processing maps

### Code Quality

1. **Duplicate code:** Type mappings, tracking dicts, resource cleanup duplicated
2. **Large nested functions:** Cascade converter has deeply nested helper functions
3. **Inconsistent naming:** Some functions use snake_case, some camelCase
4. **No type hints:** Parameters and returns not typed
5. **Magic numbers:** Scale coefficient 4.4, node insertion position -2

---

## Data Flow Summary

### Journal/Series Flow

```
Classic Item (AGO)
  ↓ Fetch data
Classic JSON {values: {story: {sections: [...]}}}
  ↓ Parse sections
For each section:
  - Determine media type (map/image/video/embed)
  - Parse HTML description
  - Extract images, text, embeds
  - Create slide with media + narrative
  ↓ Post-process
  - Fix map settings (extent, layers)
  - Clean resources
  - Set embed types
  ↓ Save
New StoryMap Item (AGO) with docked-panel sidecar
```

### Cascade Flow

```
Classic Item (AGO)
  ↓ Fetch data
Classic JSON {values: {sections: [...]}}
  ↓ Detect theme
Apply theme from cascade settings
  ↓ Process sections
For each section type:
  - Cover → set title, image, subtitle
  - Sequence → add blocks directly
  - Immersive → create floating sidecar with views
  - Title → add heading + image/separator
  - Credits → (disabled)
  ↓ For blocks: parse HTML, extract content, create nodes
  ↓ Post-process maps
  ↓ Cleanup & Save
New StoryMap Item (AGO) with mixed content
```

---

## Dependencies

**External Libraries:**

- `arcgis`: StoryMap, TextStyles, Scales, story_content, GIS, Item, WebMap, WebScene
- `bs4`: BeautifulSoup, NavigableString, Tag
- `urllib`: URL retrieval for images
- `uuid`: Generate unique node IDs
- `json`: JSON serialization
- `os`: File operations
- `glob`: File pattern matching
- `html`: HTML utilities
- `re`: Regular expressions for text parsing

**ArcGIS Connection:**

- Uses global `gis_conn` object
- Authenticated via portal/username/password or "home" profile
- Required for: fetching items, getting data, downloading resources, saving new items

---

## Configuration

**Global Variables (Lines 1-6):**

```python
classic_story_id = ""              # Input: classic story item ID
theme_id = "summit"                # Output: theme for new story
portal = "https://<org>.maps.arcgis.com"  # Prefer org/enterprise portal URL
username = ""                      # Authentication (optional)
password = ""                      # Authentication (optional)
```

**Standard Themes:** summit, obsidian, mesa, ridgeline, tidal, slate

**Custom Themes:** Use theme item ID from organization

---

## Output Structure

**New StoryMap Item:**

- Title: "(COPY) [Original Title]"
- Type: "StoryMap"
- Status: Draft (unpublished)
- TypeKeywords: includes "smconverted:converter-v2"

**Content Structure:**

- Journal/Series: Single docked-panel sidecar with all sections as slides
- Cascade: Mixed content (text, images, maps, floating sidecars)

**Resources:**

- Downloaded AGO images attached to item
- Map references (minimal resource data)
- Theme reference

---

This documentation reflects the current state of converter_v2.py and highlights areas for improvement in code organization, performance, and error handling.
