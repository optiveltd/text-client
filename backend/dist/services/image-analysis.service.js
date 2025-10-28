"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ImageAnalysisService = void 0;
const openai_1 = require("openai");
const promises_1 = __importDefault(require("fs/promises"));
const path_1 = __importDefault(require("path"));
const uploads_1 = require("openai/uploads");
class ImageAnalysisService {
    constructor() {
        this.openai = new openai_1.OpenAI({
            apiKey: process.env.OPENAI_API_KEY
        });
    }
    async analyzeImage(imageFilePath) {
        try {
            console.log(`🖼️ Analyzing image: ${path_1.default.basename(imageFilePath)}`);
            await promises_1.default.access(imageFilePath);
            console.log(`✅ Image file exists and is accessible`);
            const imageBuffer = await promises_1.default.readFile(imageFilePath);
            console.log(`✅ Image file read: ${imageBuffer.length} bytes`);
            const imageFile = await (0, uploads_1.toFile)(imageBuffer, path_1.default.basename(imageFilePath), {
                type: 'image/jpeg',
            });
            console.log(`🤖 Calling OpenAI GPT-4 Vision API...`);
            const response = await this.openai.chat.completions.create({
                model: 'gpt-4o',
                messages: [
                    {
                        role: 'user',
                        content: [
                            {
                                type: 'text',
                                text: `תאר את התמונה הזו בעברית. מה אתה רואה? תן תיאור מפורט של התוכן, הצבעים, העצמים, הטקסט (אם יש), והמשמעות הכללית.`
                            },
                            {
                                type: 'image_url',
                                image_url: {
                                    url: `data:image/jpeg;base64,${imageBuffer.toString('base64')}`
                                }
                            }
                        ]
                    }
                ],
                max_tokens: 500,
                temperature: 0.7,
            });
            const analysis = response.choices[0]?.message?.content || '';
            if (!analysis || analysis.trim().length === 0) {
                throw new Error('Empty analysis response');
            }
            console.log(`✅ Image analysis complete: "${analysis.substring(0, 50)}..."`);
            return analysis.trim();
        }
        catch (error) {
            console.error('❌ Failed to analyze image:', {
                message: error?.message,
                status: error?.response?.status,
                data: error?.response?.data,
                stack: error?.stack
            });
            throw new Error(`Image analysis failed: ${error?.message || 'Unknown error'}`);
        }
    }
    async extractTextFromImage(imageFilePath) {
        try {
            console.log(`📝 Extracting text from image: ${path_1.default.basename(imageFilePath)}`);
            const imageBuffer = await promises_1.default.readFile(imageFilePath);
            const imageFile = await (0, uploads_1.toFile)(imageBuffer, path_1.default.basename(imageFilePath), {
                type: 'image/jpeg',
            });
            const response = await this.openai.chat.completions.create({
                model: 'gpt-4o',
                messages: [
                    {
                        role: 'user',
                        content: [
                            {
                                type: 'text',
                                text: `קרא את כל הטקסט שמופיע בתמונה הזו. החזר רק את הטקסט, ללא הסברים נוספים. אם אין טקסט, כתב "אין טקסט בתמונה".`
                            },
                            {
                                type: 'image_url',
                                image_url: {
                                    url: `data:image/jpeg;base64,${imageBuffer.toString('base64')}`
                                }
                            }
                        ]
                    }
                ],
                max_tokens: 300,
                temperature: 0.1,
            });
            const extractedText = response.choices[0]?.message?.content || '';
            console.log(`✅ Text extracted: "${extractedText.substring(0, 50)}..."`);
            return extractedText.trim();
        }
        catch (error) {
            console.error('❌ Failed to extract text from image:', error);
            throw new Error(`OCR failed: ${error?.message || 'Unknown error'}`);
        }
    }
    async analyzeImageForBusiness(imageFilePath, businessContext) {
        try {
            console.log(`💼 Analyzing image for business context: ${path_1.default.basename(imageFilePath)}`);
            const imageBuffer = await promises_1.default.readFile(imageFilePath);
            const imageFile = await (0, uploads_1.toFile)(imageBuffer, path_1.default.basename(imageFilePath), {
                type: 'image/jpeg',
            });
            const contextPrompt = businessContext
                ? `הקשר עסקי: ${businessContext}\n\n`
                : '';
            const response = await this.openai.chat.completions.create({
                model: 'gpt-4o',
                messages: [
                    {
                        role: 'user',
                        content: [
                            {
                                type: 'text',
                                text: `${contextPrompt}תאר את התמונה הזו בעברית. התמקד בתוכן הרלוונטי לעסקים, שיווק, או שירותים. אם יש טקסט בתמונה, קרא אותו. אם יש לוגו או מותג, זהה אותו. תן המלצות או תובנות רלוונטיות.`
                            },
                            {
                                type: 'image_url',
                                image_url: {
                                    url: `data:image/jpeg;base64,${imageBuffer.toString('base64')}`
                                }
                            }
                        ]
                    }
                ],
                max_tokens: 600,
                temperature: 0.7,
            });
            const businessAnalysis = response.choices[0]?.message?.content || '';
            console.log(`✅ Business analysis complete: "${businessAnalysis.substring(0, 50)}..."`);
            return businessAnalysis.trim();
        }
        catch (error) {
            console.error('❌ Failed to analyze image for business:', error);
            throw new Error(`Business image analysis failed: ${error?.message || 'Unknown error'}`);
        }
    }
}
exports.ImageAnalysisService = ImageAnalysisService;
//# sourceMappingURL=image-analysis.service.js.map