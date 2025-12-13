class BasicConverter {
  private classicJson: ClassicStoryMapJSON;
  private themeId: string;
  private builder: StoryMapJSONBuilder;
  private classicType: 'basic';

  constructor(classicJson: ClassicStoryMapJSON, themeId: string = 'summit') {
    this.classicJson = classicJson;
    this.themeId = themeId;
    this.builder = new StoryMapJSONBuilder(themeId);
    this.classicType = this.detectType();
  }
}