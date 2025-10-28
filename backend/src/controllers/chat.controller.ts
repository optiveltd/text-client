import { Request, Response } from 'express';
import { ConversationService } from '../services/conversation.service.js';
import { ChatRequest, ChatResponse } from '../types/index.js';
import { config } from '../config/env.js';
import axios from 'axios';
import FormData from 'form-data';
import { AIService } from '../services/ai.service.js';
// Dynamic import for pdf-parse to handle both CommonJS and ESM
let pdfParse: any = null;
const loadPdfParse = async () => {
  if (!pdfParse) {
    try {
      const pdfParseModule = await import('pdf-parse');
      pdfParse = pdfParseModule.default || pdfParseModule;
    } catch (e) {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      pdfParse = require('pdf-parse').default || require('pdf-parse');
    }
  }
  return pdfParse;
};

import { SupabaseService } from '../services/supabase.service.js';

export class ChatController {
  private conversationService: ConversationService;
  private aiService: AIService;
  private supabaseService: SupabaseService;

  constructor() {
    this.conversationService = new ConversationService();
    this.aiService = new AIService();
    this.supabaseService = new SupabaseService();
  }

  async sendMessage(req: Request, res: Response): Promise<void> {
    try {
      const { message, conversationId, systemPrompt }: ChatRequest = req.body;

      if (!message || typeof message !== 'string') {
        res.status(400).json({
          success: false,
          error: 'Message is required and must be a string'
        });
        return;
      }

      const response: ChatResponse = await this.conversationService.sendMessage({
        message,
        conversationId,
        systemPrompt
      });

      if (response.success) {
        res.json(response);
      } else {
        res.status(500).json(response);
      }
    } catch (error) {
      console.error('Error in sendMessage:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }

  async getConversations(req: Request, res: Response): Promise<void> {
    try {
      const conversations = await this.conversationService.getAllConversations();
      res.json({
        success: true,
        conversations
      });
    } catch (error) {
      console.error('Error getting conversations:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }

  async getConversation(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const conversation = await this.conversationService.getConversation(id);

      if (!conversation) {
        res.status(404).json({
          success: false,
          error: 'Conversation not found'
        });
        return;
      }

      res.json({
        success: true,
        conversation
      });
    } catch (error) {
      console.error('Error getting conversation:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }

  async createConversation(req: Request, res: Response): Promise<void> {
    try {
      const { title } = req.body;
      const conversation = await this.conversationService.createConversation(title);
      
      res.json({
        success: true,
        conversation
      });
    } catch (error) {
      console.error('Error creating conversation:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }

  async deleteConversation(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const deleted = await this.conversationService.deleteConversation(id);

      if (!deleted) {
        res.status(404).json({
          success: false,
          error: 'Conversation not found'
        });
        return;
      }

      res.json({
        success: true,
        message: 'Conversation deleted successfully'
      });
    } catch (error) {
      console.error('Error deleting conversation:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }
// ================ OCR.space PDF parsing ================
  async parsePdf(req: Request, res: Response): Promise<void> {
    try {
      if (!req.file) {
        res.status(400).json({ success: false, error: 'No PDF file provided' });
        return;
      }

      const uploadedFile = req.file as any;
      const pdfBuffer = uploadedFile.buffer as Buffer;
      const originalName = (uploadedFile.originalname as string) || 'document.pdf';

      // ========== PDF-PARSE (digital text) ==========
      try {
        const pdfParser = await loadPdfParse();
        const parsed = await pdfParser(pdfBuffer);
        const text = (parsed.text || '').trim();
        const numpages = (parsed as any).numpages || 0;

        if (text.length > 0) {
          const hebrewMatches = text.match(/[\u0590-\u05FF]/g) || [];
          const hebrewRatio = hebrewMatches.length / Math.max(text.length, 1);

          if (hebrewRatio >= 0.2) {
            res.json({ success: true, text, pages: numpages });
            return;
          } else {
            console.warn('pdf-parse produced low Hebrew ratio; falling back to OCR');
          }
        }
      } catch (pdfErr) {
        console.warn('pdf-parse failed:', pdfErr instanceof Error ? pdfErr.message : pdfErr);
      }

      // ========== OCR.SPACE (scanned Hebrew PDFs) ==========
      if (!config.ocr?.apiKey) {
        res.json({ success: true, text: '', pages: 0 });
        return;
      }

      const callOcr = async (extraFields: Record<string, string | boolean> = {}) => {
        const formData = new FormData();
        formData.append('file', pdfBuffer, {
          filename: originalName,
          contentType: 'application/pdf',
        } as any);
        formData.append('apikey', config.ocr.apiKey);
        formData.append('OCREngine', '1'); // 1 עובד טוב לרוב ה-PDFים
        formData.append('filetype', 'PDF');
        formData.append('detectOrientation', 'true');
        formData.append('isTable', 'false');
        formData.append('scale', 'true');

        for (const [k, v] of Object.entries(extraFields)) {
          formData.append(k, String(v));
        }

        const response = await axios.post('https://api.ocr.space/parse/image', formData, {
          headers: formData.getHeaders(),
          maxBodyLength: Infinity,
          timeout: 30000,
        });

        return response.data as any;
      };

      let ocrResult: any = null;
      try {

        ocrResult = await callOcr();

        if (ocrResult?.IsErroredOnProcessing && ocrResult?.ErrorMessage) {
          const msg = Array.isArray(ocrResult.ErrorMessage)
              ? ocrResult.ErrorMessage.join(', ')
              : ocrResult.ErrorMessage;
          console.warn('OCR.space error (default):', msg);

          // נסה מנוע שני עם זיהוי אוטומטי
          ocrResult = await callOcr({ OCREngine: '2', language: 'auto' });

          if (ocrResult?.IsErroredOnProcessing && ocrResult?.ErrorMessage) {
            const msg2 = Array.isArray(ocrResult.ErrorMessage)
                ? ocrResult.ErrorMessage.join(', ')
                : ocrResult.ErrorMessage;
            console.warn('OCR.space error (auto):', msg2);

            // אחרון חביב – אנגלית בלבד (לפחות שלא יקרוס)
            ocrResult = await callOcr({ language: 'eng' });
          }
        }
      } catch (ocrErr) {
        console.warn('OCR.space call failed:', ocrErr instanceof Error ? ocrErr.message : ocrErr);
      }

      let fullText = '';
      let pages = 0;

      if (ocrResult?.ParsedResults && Array.isArray(ocrResult.ParsedResults)) {
        fullText = ocrResult.ParsedResults.map((p: any) => p.ParsedText || '').join('\n\n');
        pages = ocrResult.ParsedResults.length;
      }

      res.json({ success: true, text: (fullText || '').trim(), pages });
    } catch (error) {
      console.error('Error parsing PDF:', error);
      res.status(500).json({ success: false, error: 'Failed to parse PDF' });
    }
  }

  // ================ AI endpoints ================
  async generateDynamicQuestions(req: Request, res: Response): Promise<void> {
    try {
      const { businessName, businessField, businessGoal, systemPromptId, systemPromptText } = req.body || {};
      if (!businessName || !businessField || !businessGoal) {
        res.status(400).json({ success: false, error: 'Business name, field, and goal are required' });
        return;
      }

      // Resolve system prompt to guide question generation
      let resolvedSystemPrompt: string | undefined = typeof systemPromptText === 'string' && systemPromptText.trim().length > 0
        ? systemPromptText.trim()
        : undefined;

      if (!resolvedSystemPrompt && systemPromptId) {
        const sp = await this.supabaseService.getSystemPrompt(systemPromptId);
        if (sp?.prompt) {
          resolvedSystemPrompt = sp.prompt;
        }
      }

      if (!resolvedSystemPrompt) {
        const def = await this.supabaseService.getDefaultSystemPrompt();
        if (def?.prompt) {
          resolvedSystemPrompt = def.prompt;
        }
      }

      const prompt = `בהתבסס על ה-System Prompt הבא של הסוכנת, צור 5-8 שאלות מותאמות שיסייעו להשלים System Prompt מדויק לעסק:

------ System Prompt (הקשר) ------
${resolvedSystemPrompt || 'אתה סוכנת AI חכמה ומועילה. ענה בעברית בצורה ברורה וידידותית.'}
----------------------------------
מטרה שלך היא ליצור לי סיסטם פרומפט לשיחת הדמיה עם סוכן ללקוח : זה המבנה של הסיסטם פרומםט : בס״ד ======================== 🤖 תפקיד הסוכנת ======================== את עמית – סוכנת AI חכמה ומנומסת מטעם העסק פלאפון. המטרה שלך: לשוחח בצורה טבעית, לגלות באיזה רשת הלקוח מנוי, אם הוא לקוח קיים של פלאפון : לשאול אותו האם הוא מעוניין להוסיף קווים או לשנות מסלולים בלבד ======================== 🏢 פרטי העסק ======================== שם העסק: פלאפון תחום הפעילות:שירות קווי סלולר מה העסק מציע: שירותי קווי סלולר קהל יעד: מבוגרים גילאי 18+ אודות העסק : העסק עובד משנת 2014 שנים נותני שירות מהלב באיכות גבוהה ובמקצועיות — ======= נתונים שצריך לגלות בשאלות : 1. כמה קווים אתה מחזיק היום? 2. באיזו רשת אתה מנוי כיום? 3. אתה מעוניין במסלול דור 4 או דור 5? 4. תשאל שאלה שתגלה אם הלקוח קונה לפי מחיר בצורה אינטיליגנטית במידה והלקוח מעוניין להעביר אותו להקמת הזמנה על ידיד מנהל תיק לקוח ======================== לשאול את כל השאלות אחת אחריה שניה ולא ביחד ======================== 💬 סגנון הדמות ======================== 🗣️ טון דיבור: קליל / מקצועי 📝 סגנון כתיבה: קצר וברור 🌍 שפה: עברית ❤️ ערכי העסק: אמינות / יחס אישי / איכות / --- ======================== 🎯 מטרות השיחה ======================== 1. לזהות מה הלקוח מחפש. 2. לתת מידע מדויק וברור. 3. לבנות אמון ועניין. 4. להוביל לפעולה רכה ומותאמת (CTA). --- ======================== 📜 תסריט בסיסי ======================== 👋 פתיחה: "היי! אני {שם הסוכנת} מ-{שם העסק} 😊 איך אפשר לעזור לך היום?" במידה והלקוח מעוניין בעסקה לא להציע פיתרון לפני ששאלת לפחות 3 שאלות כדי להבין את הצורך 💡 הצעת פתרון: "נשמע שזה בדיוק מה שאנחנו עושים! אסביר בקצרה איך זה עובד אצלנו." 📅 קריאה לפעולה: יאללה סגרנו. --- ======================== 🤖 כללי בינה ======================== - תשמרי על זרימה טבעית, בלי לחזור על עצמך. - אם הלקוח קצר – תעני בקצרה. אם מפורט – תתאימי את עצמך. - אם כבר יש פרטים עליו, תשתמשי בהם. - אם הוא מתנגד – תתייחסי בעדינות ואל תילחצי למכור. - תמיד תשמרי על שפה אנושית, קלילה ומזמינה. - לשאול רק שאלה אחת בכל הודעה ✅ מטרה סופית: שהשיחה תרגיש אנושית, חכמה ומקדמת - כאילו מדובר בנציגה אמיתית. שאל אותי 5 - 8 שאלות כדי לייצר לי סיסטם פרומפט מתאים לעסק חדש - חובה לשאול שם ומגדר של הסוכן
פרטים שנאספו מהמשתמש:
שם העסק: ${businessName}
תחום העסק: ${businessField}
מטרת הסוכן: ${businessGoal}


- בין 5 ל-8 שאלות בסך הכול`;

      const response = await this.aiService.generateResponse(
        [ { role: 'user', content: prompt } as any ],
        { temperature: 0.7, maxTokens: 500, systemPrompt: resolvedSystemPrompt }
      );

      const questions = response.content
        .split('\n')
        .map(q => q.trim())
        .filter(q => q && q.length > 5)
        .slice(0, 8);

      res.json({ success: true, questions });
    } catch (error) {
      console.error('Error generating dynamic questions:', error);
      res.status(500).json({ success: false, error: 'Failed to generate questions' });
    }
  }

  async generateCustomSystemPrompt(req: Request, res: Response): Promise<void> {
    try {
      const { answers, userPhone } = req.body || {};
      if (!answers || !Array.isArray(answers) || answers.length === 0) {
        res.status(400).json({ success: false, error: 'Answers are required' });
        return;
      }

      const prompt = `אתה מומחה ביצירת סיסטם פרומפטים לסוכנות AI. 

תבסס על התשובות הבאות, צור סיסטם פרומפט מקצועי:
${answers.join('\n')}

הסיסטם פרומפט צריך לכלול:
1. תפקיד הסוכנת
2. פרטי העסק
3. קהל יעד
4. סגנון דיבור
5. מטרות השיחה
6. כללי ברזל
7. מה לעשות ומה לא

ענה רק עם הסיסטם פרומפט, ללא הסבר נוסף.`;

      const response = await this.aiService.generateResponse(
        [ { role: 'user', content: prompt } as any ],
        { temperature: 0.7, maxTokens: 2000 }
      );

      const generatedPrompt = response.content;

      // Save to Supabase system_prompts
      const created = await this.supabaseService.createCustomSystemPrompt(generatedPrompt, userPhone);

      // Link to user if possible
      if (created && userPhone) {
        const user = await this.supabaseService.getUserByPhone(userPhone);
        if (user) {
          await this.supabaseService.updateUserSystemPrompt(user.id, created.id);
        }
      }

      res.json({ 
        success: true, 
        systemPrompt: { 
          prompt: generatedPrompt, 
          id: created ? created.id : null 
        } 
      });
    } catch (error) {
      console.error('Error generating custom system prompt:', error);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }

  async updateUserBusinessName(req: Request, res: Response): Promise<void> {
    try {
      const { phone, userPhone, businessName } = req.body || {};
      const phoneNumber = phone || userPhone;
      if (!phoneNumber || !businessName) {
        res.status(400).json({ success: false, error: 'Phone and business name are required' });
        return;
      }

      // Placeholder for real DB update
      res.json({ success: true, message: 'Business name updated successfully' });
    } catch (error) {
      console.error('Error updating business name:', error);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }

  async updateSystemPrompt(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { prompt } = req.body || {};
      if (!id || !prompt) {
        res.status(400).json({ success: false, error: 'id and prompt are required' });
        return;
      }
      const updated = await this.supabaseService.updateSystemPrompt(id, prompt);
      if (!updated) {
        res.status(404).json({ success: false, error: 'System prompt not found' });
        return;
      }
      res.json({ success: true, systemPrompt: updated });
    } catch (error) {
      console.error('Error updating system prompt:', error);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
}


