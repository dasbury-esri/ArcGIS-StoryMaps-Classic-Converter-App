# Classic StoryMap Converter - Logic Flow Diagrams

This document contains visual flowcharts showing the conversion logic for all three classic StoryMap types.

---

## High-Level Conversion Flow

```mermaid
flowchart TD
    Start([User calls convert_classic]) --> GetItem[Fetch Classic Item from ArcGIS]
    GetItem --> CheckType{Check typeKeywords}

    CheckType -->|MapJournal| Journal[**convert_series_or_journal**]
    CheckType -->|MapSeries| Journal
    CheckType -->|Cascade| Cascade[**convert_cascade**]
    CheckType -->|Unknown| Error[Raise Exception]

    Journal --> JOutput[New StoryMap with Docked Sidecar]
    Cascade --> COutput[New StoryMap with Mixed Content]

    JOutput --> Done([Return URL])
    COutput --> Done
    Error --> Done

    style Journal fill:#b3d9ff,color:#000000
    style Cascade fill:#ffe4b3,color:#000000
    style Error fill:#ffb3b3,color:#000000
```

---

## Journal/Series Conversion Flow (Updated)

```mermaid
flowchart TD
    Start([convert_series_or_journal]) --> Init[Initialize tracking dicts:<br/>map_setting_dict, embed_settings_dict, local_images]

    Init --> CreateStory[Create new empty StoryMap]
    CreateStory --> AddSidecar[Add empty docked-panel sidecar]

    AddSidecar --> FetchData[Fetch classic story data]
    FetchData --> GetSections{Story Type?}

    GetSections -->|Journal| JSections[Get values.story.sections]
    GetSections -->|Series| SSections[Get values.story.entries]

    JSections --> LoopStart[For each section]
    SSections --> LoopStart

    LoopStart --> MediaType{Media Type?}

    MediaType -->|webmap| ProcessMap[Process WebMap:<br/>- Get map ID, extent, layers<br/>- Calculate scale<br/>- Store settings in map_setting_dict]
    MediaType -->|image| ProcessImage[Process Image:<br/>- Download if AGO resource<br/>- Track local images]
    MediaType -->|video/webpage| ProcessEmbed[Process Embed:<br/>- Convert to embed type<br/>- Store embedlyType in embed_settings_dict]

    ProcessMap --> ParseContent[Parse HTML content with BeautifulSoup]
    ProcessImage --> ParseContent
    ProcessEmbed --> ParseContent

    ParseContent --> ExtractElements[Extract elements:<br/>- Title → Heading text<br/>- Images → Image nodes<br/>- Paragraphs → Text nodes<br/>- iframes → Embed nodes]

    ExtractElements --> AddSlide[Add slide to sidecar:<br/>media + narrative content]

    AddSlide --> MoreSections{More sections?}
    MoreSections -->|Yes| LoopStart
    MoreSections -->|No| FirstSave[Save story]

    FirstSave --> PostProcessMaps[Post-process Maps:<br/>For each map in map_setting_dict]

    PostProcessMaps --> ReloadStory[Reload story for map]
    ReloadStory --> GetLayers[Fetch map layers from WebMap]
    GetLayers --> SetViewpoint[Set viewpoint, extent, scale]
    SetViewpoint --> SetVisibility[Apply layer visibility]
    SetVisibility --> SaveMap[Save story]
    SaveMap --> MoreMaps{More maps?}

    MoreMaps -->|Yes| PostProcessMaps
    MoreMaps -->|No| CleanResources[Clean up resources:<br/>- Set webmap type to minimal<br/>- Remove redundant properties<br/>- Set theme]

    CleanResources --> FixEmbeds[Fix embed settings:<br/>- Set embedType<br/>- Set display mode]

    FixEmbeds --> Cleanup[Final cleanup:<br/>- Delete local images<br/>- Remove empty slides<br/>- Set title and cover]

    Cleanup --> FinalSave[Final save with tracking keyword]
    FinalSave --> PersistLocal[Persist local drafts:<br/>- tmp-converted/draft.json<br/>- entry-<n>.json<br/>- collection-draft.json]
    PersistLocal --> CreateCollection[Create Collection (AGSM schema):<br/>- cover/nav/ui/root nodes<br/>- story-theme resource]
    CreateCollection --> DetectThemeLayout[Detect theme + layout from classic settings]
    DetectThemeLayout --> SetCollectionThumb[Set collection thumbnail from classic item]
    SetCollectionThumb --> FinishPublishing[Surface Finish Publishing button + URL]
    FinishPublishing --> Done([Return URL])

    style ProcessMap fill:#a8e6a8,color:#000000
    style ProcessImage fill:#ffb3b3,color:#000000
    style ProcessEmbed fill:#b3ccff,color:#000000
    style PostProcessMaps fill:#fff0a8,color:#000000
    style FinalSave fill:#a8e6a8,color:#000000
```

---

## Journal/Series: Section Content Parsing

```mermaid
flowchart TD
    Start([Parse section content]) --> GetHTML[Get content HTML]
    GetHTML --> Parse[Parse with BeautifulSoup]

    Parse --> Loop[For each child element]
    Loop --> CheckElement{Element type?}

    CheckElement -->|p with class| CheckClass{Class type?}
    CheckElement -->|p without class| CleanP[Clean HTML:<br/>- Remove spans<br/>- Strip p tags<br/>- Check non-empty]
    CheckElement -->|img| ProcessImg[Process image:<br/>- Get src URL<br/>- Download if AGO<br/>- Create Image node]
    CheckElement -->|div| CleanDiv[Clean HTML and create Text node]
    CheckElement -->|class=iframe-container| ProcessIframe[Extract iframe src<br/>Create Embed node]
    CheckElement -->|None/empty| Skip[Skip]

    CheckClass -->|caption| ProcessCaption[Extract nested:<br/>- img tags<br/>- figcaption<br/>- p tags]
    CheckClass -->|image-container| ProcessCaption
    CheckClass -->|other| CleanP

    ProcessCaption --> CreateNodes[Create Image and Text nodes]
    CleanP --> AddText[Add Text node to slide content]
    CleanDiv --> AddText
    ProcessImg --> AddImage[Add Image node to slide content]
    ProcessIframe --> AddEmbed[Add Embed node to slide content]
    CreateNodes --> AddText
    CreateNodes --> AddImage

    AddText --> MoreElements{More elements?}
    AddImage --> MoreElements
    AddEmbed --> MoreElements
    Skip --> MoreElements

    MoreElements -->|Yes| Loop
    MoreElements -->|No| ErrorHandler{Error occurred?}

    ErrorHandler -->|Yes| PrintError[Print error message<br/>Continue to next section]
    ErrorHandler -->|No| Return([Return slide content list])

    PrintError --> Return

    style ProcessImg fill:#ffb3b3,color:#000000
    style ProcessIframe fill:#b3ccff,color:#000000
    style ErrorHandler fill:#ffb3b3,color:#000000
```

---

## Cascade Conversion Flow

```mermaid
flowchart TD
    Start([convert_cascade]) --> Init[Create new empty StoryMap]

    Init --> FetchData[Fetch classic cascade data]
    FetchData --> DetectTheme{Theme in settings?}

    DetectTheme -->|dark| SetObsidian[theme_id = obsidian]
    DetectTheme -->|light| SetSummit[theme_id = summit]
    DetectTheme -->|none| UseDefault[Use parameter theme_id]

    SetObsidian --> GetSections[Get values.sections array]
    SetSummit --> GetSections
    UseDefault --> GetSections

    GetSections --> LoopSections[For each section]
    LoopSections --> SectionType{Section Type?}

    SectionType -->|cover| ProcessCover[Process Cover:<br/>- Extract title, subtitle<br/>- Handle background image/video<br/>- Set story cover]
    SectionType -->|sequence| ProcessSequence[Process Sequence:<br/>- Iterate blocks<br/>- Add directly to story]
    SectionType -->|immersive| ProcessImmersive[Process Immersive:<br/>- Create floating sidecar<br/>- Convert views to slides]
    SectionType -->|title| ProcessTitle[Process Title:<br/>- Add heading text<br/>- Add floating image or separator]
    SectionType -->|credits| ProcessCredits[Process Credits:<br/>Currently disabled due to API bug]

    ProcessCover --> MoreSections{More sections?}
    ProcessSequence --> MoreSections
    ProcessImmersive --> MoreSections
    ProcessTitle --> MoreSections
    ProcessCredits --> MoreSections

    MoreSections -->|Yes| LoopSections
    MoreSections -->|No| CleanImages[Delete local image files]

    CleanImages --> SetTheme[Set theme resource]
    SetTheme --> FinalSave[Add tracking keyword and save]
    FinalSave --> Done([Return URL])

    style ProcessCover fill:#b3d9ff,color:#000000
    style ProcessSequence fill:#a8e6a8,color:#000000
    style ProcessImmersive fill:#ffe4b3,color:#000000
    style ProcessTitle fill:#ffd4ff,color:#000000
    style ProcessCredits fill:#ffb3b3,color:#000000
```

---

## Cascade: Immersive Section Processing

```mermaid
flowchart TD
    Start([handle_immersive_section]) --> CreateSidecar[Create empty floating-panel sidecar]

    CreateSidecar --> InitTracking[Initialize tracking dicts:<br/>- side_car_map_layer_visibility<br/>- side_car_map_extent<br/>- side_car_map_resources]

    InitTracking --> LoopViews[For each view]
    LoopViews --> BackgroundType{Background Type?}

    BackgroundType -->|image| BgImage[Download image<br/>Create Image media]
    BackgroundType -->|video/webpage| BgEmbed[Process URL<br/>Create Embed media]
    BackgroundType -->|webmap| BgWebMap[Get map ID<br/>Capture layers/extent<br/>Create Map media]
    BackgroundType -->|webscene| BgWebScene[Get scene ID<br/>Capture layers/extent<br/>Create Map media]

    BgImage --> ProcessForeground[Process foreground panels]
    BgEmbed --> ProcessForeground
    BgWebMap --> TrackMap[Track map settings in dicts]
    BgWebScene --> TrackMap
    TrackMap --> ProcessForeground

    ProcessForeground --> GetTitle{First view with title?}
    GetTitle -->|Yes| AddTitle[Add title as heading to narrative]
    GetTitle -->|No| LoopBlocks[For each block in panels]
    AddTitle --> LoopBlocks

    LoopBlocks --> ProcessBlock[process_block with return_as_content=True]
    ProcessBlock --> AddContent[Add to narrative content list]

    AddContent --> MoreBlocks{More blocks?}
    MoreBlocks -->|Yes| LoopBlocks
    MoreBlocks -->|No| AddSlide[Add slide with media + narrative]

    AddSlide --> FixMaps[fix_webmap_props:<br/>Apply layer visibility, extent, viewpoint]

    FixMaps --> MoreViews{More views?}
    MoreViews -->|Yes| LoopViews
    MoreViews -->|No| RemoveEmpty[Remove initial empty slide]

    RemoveEmpty --> Return([Return])

    style BgWebMap fill:#a8e6a8,color:#000000
    style BgWebScene fill:#a8e6a8,color:#000000
    style TrackMap fill:#fff0a8,color:#000000
    style FixMaps fill:#fff0a8,color:#000000
```

---

## Cascade: Block Processing Dispatcher

```mermaid
flowchart TD
    Start([process_block]) --> GetType[Get block type]
    GetType --> Dispatch{Block Type?}

    Dispatch -->|text| HandleText[handleTextBlock:<br/>- Parse HTML<br/>- Extract style and alignment<br/>- Create Text node]
    Dispatch -->|video| HandleEmbed[handle_embed_blocks:<br/>- Get URL<br/>- Fix protocol<br/>- Create Embed node]
    Dispatch -->|webpage| HandleEmbed
    Dispatch -->|image| HandleImage[handle_image_blocks:<br/>- Get URL<br/>- Download if AGO<br/>- Create Image node]
    Dispatch -->|image-gallery| HandleGallery[handle_gallery_block:<br/>- Process each image<br/>- Create Gallery node<br/>- Add all images]
    Dispatch -->|webmap| HandleWebMap[handle_webmap_block:<br/>- Get map ID<br/>- Fetch layers<br/>- Set extent/viewpoint<br/>- Create Map node]
    Dispatch -->|webscene| HandleWebScene[handle_webscene_block:<br/>- Get scene ID<br/>- Fetch layers<br/>- Set extent<br/>- Create Map node]

    HandleText --> CheckMode{return_as_content?}
    HandleEmbed --> CheckMode
    HandleImage --> CheckMode
    HandleGallery --> CheckMode
    HandleWebMap --> CheckMode
    HandleWebScene --> CheckMode

    CheckMode -->|True| ReturnContent([Return content object])
    CheckMode -->|False| AddToStory[Add directly to story]

    AddToStory --> Done([Done])

    style HandleText fill:#b3d9ff,color:#000000
    style HandleEmbed fill:#b3ccff,color:#000000
    style HandleImage fill:#ffb3b3,color:#000000
    style HandleGallery fill:#ffb3d9,color:#000000
    style HandleWebMap fill:#a8e6a8,color:#000000
    style HandleWebScene fill:#a8e6a8,color:#000000
```

---

## Cascade: Text Block Processing

```mermaid
flowchart TD
    Start([handleTextBlock]) --> Parse[Parse HTML with BeautifulSoup]
    Parse --> GetOuter[Find outermost tag]

    GetOuter --> RemoveColor[Remove color span tags]
    RemoveColor --> ReplaceBreaks[Replace br tags with newlines]

    ReplaceBreaks --> CheckTag{Outermost tag?}

    CheckTag -->|h1| MapH1[TextStyle.HEADING<br/>alignment = center]
    CheckTag -->|h2| MapH2[TextStyle.SUBHEADING<br/>alignment = center]
    CheckTag -->|p| MapP[TextStyle.PARAGRAPH<br/>Extract text-align from style]
    CheckTag -->|blockquote| MapQuote[TextStyle.QUOTE<br/>alignment = center]

    MapP --> ParseStyle{Has style attribute?}
    ParseStyle -->|Yes| ExtractAlign[Regex: text-align value<br/>Map to start/center/end]
    ParseStyle -->|No| DefaultAlign[alignment = start]

    MapH1 --> RemoveStyle[Remove style attribute]
    MapH2 --> RemoveStyle
    ExtractAlign --> RemoveStyle
    DefaultAlign --> RemoveStyle
    MapQuote --> RemoveStyle

    RemoveStyle --> UnwrapP{Is p tag?}
    UnwrapP -->|Yes| Unwrap[Unwrap p tag]
    UnwrapP -->|No| Keep[Keep tag structure]

    Unwrap --> NormalizeTags[Replace b → strong<br/>Replace i → em]
    Keep --> NormalizeTags

    NormalizeTags --> RemoveQuotes[Remove double quotes]
    RemoveQuotes --> CreateNode[Create Text node with style]

    CreateNode --> CheckReturn{Return mode?}

    CheckReturn -->|return_as_content| ReturnContent([Return content])
    CheckReturn -->|return_as_string| ReturnString([Return HTML string])
    CheckReturn -->|default| AddToStory[Add to story<br/>Set textAlignment property]

    AddToStory --> Done([Return node])

    style MapP fill:#b3d9ff,color:#000000
    style ExtractAlign fill:#fff0a8,color:#000000
    style NormalizeTags fill:#a8e6a8,color:#000000
```

---

## Cascade: WebMap Block Processing

```mermaid
flowchart TD
    Start([handle_webmap_block]) --> GetID[Get webmap ID from block]
    GetID --> CheckMode{return_as_content?}

    CheckMode -->|True| ContentMode[Content Mode:<br/>For sidecar narrative panels]
    CheckMode -->|False| DirectMode[Direct Mode:<br/>For sequence blocks]

    ContentMode --> CreateContent[Create Map content node]
    CreateContent --> CaptureSettings[Capture in tracking dicts:<br/>- layer_list<br/>- map_extent<br/>- map_resource_list]
    CaptureSettings --> ReturnContent([Return Map content object])

    DirectMode --> AddMap[Add Map node to story]
    AddMap --> GetResource[Get map resource ID from node]
    GetResource --> FetchLayers[Fetch layers from WebMap API]

    FetchLayers --> HasClassicLayers{Classic has<br/>layer settings?}
    HasClassicLayers -->|Yes| BuildModified[Build modified layer list:<br/>Set visible: False for classic layers]
    HasClassicLayers -->|No| SkipLayers[Skip layer processing]

    BuildModified --> MergeLayers[Merge with actual WebMap layers:<br/>Add missing layers with default visibility]
    MergeLayers --> SetLayers[Set mapLayers on node]
    SkipLayers --> CheckExtent{Has extent?}
    SetLayers --> CheckExtent

    CheckExtent -->|Yes| CalcViewpoint[Calculate viewpoint and zoom<br/>from extent using get_viewpoint]
    CheckExtent -->|No| SetCaption[Set caption and alt text]

    CalcViewpoint --> SetViewpoint[Set extent, viewpoint, zoom on node]
    SetViewpoint --> SetCaption
    SetCaption --> Done([Done])

    style ContentMode fill:#b3d9ff,color:#000000
    style DirectMode fill:#a8e6a8,color:#000000
    style FetchLayers fill:#fff0a8,color:#000000
    style CalcViewpoint fill:#b3ccff,color:#000000
```

---

## Cascade: WebScene Block Processing

```mermaid
flowchart TD
    Start([handle_webscene_block]) --> GetID[Get webscene ID from block]
    GetID --> CheckMode{return_as_content?}

    CheckMode -->|True| ContentMode[Content Mode:<br/>For sidecar narrative panels]
    CheckMode -->|False| DirectMode[Direct Mode:<br/>For sequence blocks]

    ContentMode --> CreateContent[Create Map content node<br/>with webscene item]
    CreateContent --> CaptureSettings[Capture in tracking dicts:<br/>- layer_list<br/>- map_extent<br/>- map_resource_list]
    CaptureSettings --> ReturnContent([Return Map content object])

    DirectMode --> AddMap[Add Map node to story]
    AddMap --> GetResource[Get scene resource ID from node]
    GetResource --> FetchLayers[Fetch layers from WebScene API]

    FetchLayers --> HasClassicLayers{Classic has<br/>layer settings?}
    HasClassicLayers -->|Yes| BuildModified[Build modified layer list:<br/>Set visible: False for classic layers]
    HasClassicLayers -->|No| SkipLayers[Skip layer processing]

    BuildModified --> MergeLayers[Merge with actual WebScene layers:<br/>Add missing layers with default visibility]
    MergeLayers --> SetLayers[Set mapLayers on node]
    SkipLayers --> CheckExtent{Has extent?}
    SetLayers --> CheckExtent

    CheckExtent -->|Yes| SetExtentOnly[Set extent on node<br/>NO viewpoint/zoom for scenes]
    CheckExtent -->|No| SetCaption[Set caption and alt text]

    SetExtentOnly --> SetCaption
    SetCaption --> Done([Done])

    style ContentMode fill:#b3d9ff,color:#000000
    style DirectMode fill:#a8e6a8,color:#000000
    style FetchLayers fill:#fff0a8,color:#000000
    style SetExtentOnly fill:#ffb3b3,color:#000000
```

---

## Cascade: Gallery Block Processing

```mermaid
flowchart TD
    Start([handle_gallery_block]) --> GetImages[Get images array from block]
    GetImages --> GetMetadata[Get gallery caption and altText]

    GetMetadata --> InitList[Initialize empty image_node_list]
    InitList --> LoopImages[For each image in gallery]

    LoopImages --> ProcessImage[Call handle_image_blocks<br/>to process individual image]
    ProcessImage --> AddToList[Add image node to list]

    AddToList --> MoreImages{More images?}
    MoreImages -->|Yes| LoopImages
    MoreImages -->|No| CreateGallery[Create new Gallery node]

    CreateGallery --> AddGallery[Add gallery to story]
    AddGallery --> AddImages[Add all image nodes to gallery]

    AddImages --> HasCaption{Has caption?}
    HasCaption -->|Yes| SetCaption[Set gallery caption]
    HasCaption -->|No| HasAlt{Has altText?}

    SetCaption --> HasAlt
    HasAlt -->|Yes| SetAlt[Set gallery alt text]
    HasAlt -->|No| Done([Done])

    SetAlt --> Done

    style ProcessImage fill:#ffb3b3,color:#000000
    style CreateGallery fill:#ffb3d9,color:#000000
    style AddImages fill:#b3ccff,color:#000000
```

---

## Cascade: Embed Block Processing

```mermaid
flowchart TD
    Start([handle_embed_blocks]) --> CheckMode{return_as_content?}

    CheckMode -->|True| ContentMode[Content Mode:<br/>For sidecar narrative panels]
    CheckMode -->|False| DirectMode[Direct Mode:<br/>For sequence blocks]

    ContentMode --> GetTypeC[Get embed type:<br/>video or webpage]
    DirectMode --> GetTypeD[Get embed type:<br/>video or webpage]

    GetTypeC --> GetURLc[Get URL from block\[embed_type\]\['url'\]]
    GetTypeD --> GetURLd[Get URL from block\[embed_type\]\['url'\]]

    GetURLc --> FixProtocolC[Fix URL Protocol]
    GetURLd --> FixProtocolD[Fix URL Protocol]

    FixProtocolC --> CheckHTTPS1{Starts with<br/>https://?}
    FixProtocolD --> CheckHTTPS2{Starts with<br/>https://?}

    CheckHTTPS1 -->|No| AddHTTPS1[Prepend https://]
    CheckHTTPS1 -->|Yes| CheckSlash1{Starts with //?}
    AddHTTPS1 --> CheckSlash1

    CheckSlash1 -->|Yes| PrependProto1[Replace // with https://]
    CheckSlash1 -->|No| CheckValid1{Valid https://?}
    PrependProto1 --> CheckValid1

    CheckValid1 -->|No| Fallback1[Set to https://example.com/]
    CheckValid1 -->|Yes| CreateContentEmbed[Create Embed content node]
    Fallback1 --> CreateContentEmbed

    CreateContentEmbed --> ReturnContent([Return Embed content])

    CheckHTTPS2 -->|No| AddHTTPS2[Prepend https://]
    CheckHTTPS2 -->|Yes| CheckSlash2{Starts with //?}
    AddHTTPS2 --> CheckSlash2

    CheckSlash2 -->|Yes| PrependProto2[Replace // with https://]
    CheckSlash2 -->|No| CheckValid2{Valid https://?}
    PrependProto2 --> CheckValid2

    CheckValid2 -->|No| Fallback2[Set to https://example.com/]
    CheckValid2 -->|Yes| AddEmbed[Add Embed node to story]
    Fallback2 --> AddEmbed

    AddEmbed --> GetNode[Get embed node reference]
    GetNode --> HasCaption{Has caption?}

    HasCaption -->|Yes| SetCaption[Set embed.caption]
    HasCaption -->|No| HasAlt{Has altText?}

    SetCaption --> HasAlt
    HasAlt -->|Yes| SetAlt[Set embed.alt_text]
    HasAlt -->|No| Done([Done])

    SetAlt --> Done

    style ContentMode fill:#b3d9ff,color:#000000
    style DirectMode fill:#a8e6a8,color:#000000
    style FixProtocolC fill:#fff0a8,color:#000000
    style FixProtocolD fill:#fff0a8,color:#000000
    style Fallback1 fill:#ffb3b3,color:#000000
    style Fallback2 fill:#ffb3b3,color:#000000
```

**Note:** Both video and webpage blocks are converted to Embed nodes. The embed type is stored separately in post-processing (embedlyType: 'video' or 'link') and display mode (inline or card).

---

## Utility: Image Processing

```mermaid
flowchart TD
    Start([process_img_tag]) --> Clean[Replace spaces with %20]
    Clean --> CheckProtocol{URL starts with?}

    CheckProtocol -->|https://www.arcgis.com/sharing/rest/content| AGO1[AGO Resource Path 1]
    CheckProtocol -->|//www.arcgis.com/sharing/rest/content| AGO2[AGO Resource Path 2]
    CheckProtocol -->|https://...| External[External URL]
    CheckProtocol -->|//...| ProtocolNeutral[Protocol-neutral URL]
    CheckProtocol -->|Other| Other[Other path]

    AGO1 --> AddToken1[Append auth token]
    AGO2 --> PrependHTTPS[Prepend https:]
    PrependHTTPS --> AddToken2[Append auth token]

    AddToken1 --> GetExtension[Get file extension]
    AddToken2 --> GetExtension
    GetExtension --> GenerateUUID[Generate UUID filename]
    GenerateUUID --> Download[Download to local file]
    Download --> ReturnLocal([Return local path])

    External --> ReturnURL([Return URL as-is])
    ProtocolNeutral --> PrependProto[Prepend https:]
    PrependProto --> ReturnURL
    Other --> PrependProto

    style AGO1 fill:#a8e6a8,color:#000000
    style AGO2 fill:#a8e6a8,color:#000000
    style Download fill:#fff0a8,color:#000000
    style ReturnLocal fill:#ffb3b3,color:#000000
```

---

## Utility: Sidecar Creation

```mermaid
flowchart TD
    Start([add_empty_sidecar]) --> GenIDs[Generate 3 UUIDs:<br/>- side_car_node<br/>- slide_node<br/>- narrative_node]

    GenIDs --> GetRoot[Get story root node ID]
    GetRoot --> InsertSidecar[Insert sidecar into root.children at position -2]

    InsertSidecar --> CreateNarrative[Create narrative panel node:<br/>type: immersive-narrative-panel<br/>panelStyle: themed]

    CreateNarrative --> CreateSlide[Create slide node:<br/>type: immersive-slide<br/>transition: fade<br/>children: narrative_node]

    CreateSlide --> CreateSidecar[Create sidecar node:<br/>type: immersive<br/>subtype: type parameter<br/>children: slide_node]

    CreateSidecar --> AddToStory[Add all nodes to story._properties]
    AddToStory --> Return([Return tuple of IDs])

    style GenIDs fill:#b3ccff,color:#000000
    style CreateSidecar fill:#ffe4b3,color:#000000
```

---

## Post-Processing: Map Settings

```mermaid
flowchart TD
    Start([Post-process maps]) --> LoopMaps[For each map in map_setting_dict]

    LoopMaps --> Reload[Reload story from ArcGIS<br/>Due to recursive media issue]
    Reload --> GetMapNode[Get map node from sidecar]

    GetMapNode --> GetMapID[Get map itemId from resource]
    GetMapID --> FetchMap[Fetch WebMap from ArcGIS]
    FetchMap --> GetLayers[Get layers from WebMap]

    GetLayers --> BuildArray[Build mapLayers array:<br/>id, title, visibility for each layer]
    BuildArray --> SetArray[Set mapLayers on node.data]

    SetArray --> SetViewpoint[Call map_node.set_viewpoint<br/>with extent and scale]

    SetViewpoint --> HasLayers{Classic has layer settings?}
    HasLayers -->|Yes| MatchLayers[Match classic layer IDs:<br/>- Exact match<br/>- Prefix match<br/>Set visible: true]
    HasLayers -->|No| RemoveProps[Remove zoom and center properties]

    MatchLayers --> RemoveProps
    RemoveProps --> SaveStory[Save story]

    SaveStory --> MoreMaps{More maps?}
    MoreMaps -->|Yes| LoopMaps
    MoreMaps -->|No| Done([Done])

    style Reload fill:#ffb3b3,color:#000000
    style SaveStory fill:#fff0a8,color:#000000
```

---

## Key Decision Points

### Type Detection

```mermaid
graph LR
    A[Check typeKeywords] --> B{Contains?}
    B -->|MapJournal or mapjournal| C[Journal Converter]
    B -->|MapSeries or mapseries| C
    B -->|Cascade or cascade| D[Cascade Converter]
    B -->|None match| E[Raise Exception]
```

### Media Type Handling

```mermaid
graph TD
    A[Section Media] --> B{Type?}
    B -->|webmap| C[sc.Map - store extent/layers]
    B -->|image| D[sc.Image - download if AGO]
    B -->|video| E[sc.Embed - embedlyType: video]
    B -->|webpage| F[sc.Embed - embedlyType: link]
```

### Content Mode

```mermaid
graph LR
    A[Process Block] --> B{return_as_content?}
    B -->|True| C[Return content object<br/>For sidecar slides]
    B -->|False| D[Add directly to story<br/>For sequence blocks]
```

---

## Data Transformation Flow

```mermaid
flowchart LR
    A[Classic JSON] --> B[BeautifulSoup Parser]
    B --> C[Extract Structure]
    C --> D[Content Nodes]
    D --> E[StoryMap Properties]
    E --> F[Post-Process]
    F --> G[Final JSON]
    G --> H[Save to ArcGIS]

    style A fill:#b3d9ff,color:#000000
    style C fill:#a8e6a8,color:#000000
    style E fill:#ffe4b3,color:#000000
    style G fill:#a8e6a8,color:#000000
    style H fill:#ffb3b3,color:#000000
```

---

These diagrams illustrate the complete conversion logic flow for all three classic StoryMap types and show the key decision points, data transformations, and processing steps involved in the conversion process.
