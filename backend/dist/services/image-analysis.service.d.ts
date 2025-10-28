export declare class ImageAnalysisService {
    private openai;
    constructor();
    analyzeImage(imageFilePath: string): Promise<string>;
    extractTextFromImage(imageFilePath: string): Promise<string>;
    analyzeImageForBusiness(imageFilePath: string, businessContext?: string): Promise<string>;
}
//# sourceMappingURL=image-analysis.service.d.ts.map