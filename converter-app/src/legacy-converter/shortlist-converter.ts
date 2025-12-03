export class ShortlistConverter {
  private classicJson: ClassicStoryMapJSON;
  private themeId: string;
  private builder: StoryMapJSONBuilder;
  private classicType: 'journal' | 'series';

  constructor(classicJson: ClassicStoryMapJSON, themeId: string = 'summit') {
    this.classicJson = classicJson;
    this.themeId = themeId;
    this.builder = new StoryMapJSONBuilder(themeId);
    this.classicType = this.detectType();
  }

  // Classic Shortlist apps have a webmap with either a Feature Set or a Feature Service
  // We need to collect the features, turn them into a Feature Service using the Shortlist tab info
  // as a key, and then create an AGSM Categorized MapTour, with each tab being a tour category 

}