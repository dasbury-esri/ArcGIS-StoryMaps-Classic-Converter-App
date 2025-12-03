export class CrowdsourceConverter {
  private classicJson: ClassicStoryMapJSON;
  private themeId: string;
  private builder: StoryMapJSONBuilder;
  private classicType: 'crowdsource';

  constructor(classicJson: ClassicStoryMapJSON, themeId: string = 'summit') {
    this.classicJson = classicJson;
    this.themeId = themeId;
    this.builder = new StoryMapJSONBuilder(themeId);
    this.classicType = this.detectType();
  }

  // Download the images from the feature service and convert each point to a place in a Map Tour Grid

}