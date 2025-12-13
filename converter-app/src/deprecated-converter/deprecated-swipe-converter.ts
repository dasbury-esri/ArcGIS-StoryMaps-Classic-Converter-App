/**
 * DEPRECATED: This legacy Swipe converter is retained for reference only.
 * New conversions should use `src/converters/SwipeConverter`.
 */
class SwipeConverter {
  private classicJson: ClassicStoryMapJSON;
  private themeId: string;
  private builder: StoryMapJSONBuilder;
  private classicType: 'swipe';

  constructor(classicJson: ClassicStoryMapJSON, themeId: string = 'summit') {
    this.classicJson = classicJson;
    this.themeId = themeId;
    this.builder = new StoryMapJSONBuilder(themeId);
    this.classicType = this.detectType();
  }

  // Classic Swipe apps have to layout options, "swipe" and "spyglass"
  private detectType(): 'swipe' {
    // For now, we only support Swipe, so return that directly
    return 'swipe';
  }

  // Classic Swipe apps have a dataModel parameter. Could be "TWO_WEBMAPS" or "TWO_LAYERS"
  // We can converter the "TWO_LAYERS" case into the Instant App Basic (Media Map) template
  // and the "TWO_WEBMAPS" case into the Experience Builder "Blank Fullscreen" with two maps and
  // a swipe widget, header and a text panel 

}