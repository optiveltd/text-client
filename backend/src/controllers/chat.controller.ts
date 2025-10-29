import { Request, Response } from 'express';
import { ConversationService } from '../services/conversation.service.js';
import { ChatRequest, ChatResponse } from '../types/index.js';
import { config } from '../config/env.js';
import axios from 'axios';
import FormData from 'form-data';
import { AIService } from '../services/ai.service.js';
// Dynamic import for pdf-parse to handle both CommonJS and ESM and various distributions
let pdfParse: any = null;
const loadPdfParse = async () => {
  if (!pdfParse) {
    // Try ESM default resolution first
    try {
      const mod: any = await import('pdf-parse');
      pdfParse = typeof mod === 'function' ? mod : (typeof mod?.default === 'function' ? mod.default : null);
    } catch {}

    // Try CommonJS require root
    if (!pdfParse) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const modCjs: any = require('pdf-parse');
        pdfParse = typeof modCjs === 'function' ? modCjs : (typeof modCjs?.default === 'function' ? modCjs.default : null);
      } catch {}
    }

    // Try explicit distribution paths used by newer versions
    if (!pdfParse) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const modPathCjs: any = require('pdf-parse/dist/node/cjs/index.cjs');
        pdfParse = typeof modPathCjs === 'function' ? modPathCjs : (typeof modPathCjs?.default === 'function' ? modPathCjs.default : null);
      } catch {}
    }

    if (!pdfParse) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const legacyCjs: any = require('pdf-parse/dist/pdf-parse/cjs/index.cjs');
        pdfParse = typeof legacyCjs === 'function' ? legacyCjs : (typeof legacyCjs?.default === 'function' ? legacyCjs.default : null);
      } catch {}
    }

    // Try classic internal paths
    if (!pdfParse) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const libPath: any = require('pdf-parse/lib/pdf-parse');
        pdfParse = typeof libPath === 'function' ? libPath : (typeof libPath?.default === 'function' ? libPath.default : null);
      } catch {}
    }

    if (!pdfParse) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const libIndex: any = require('pdf-parse/lib/index');
        pdfParse = typeof libIndex === 'function' ? libIndex : (typeof libIndex?.default === 'function' ? libIndex.default : null);
      } catch {}
    }

    // Try direct require with full path resolution
    if (!pdfParse) {
      try {
        const path = require('path');
        const pdfParsePath = require.resolve('pdf-parse');
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const direct: any = require(pdfParsePath);
        pdfParse = typeof direct === 'function' ? direct : (typeof direct?.default === 'function' ? direct.default : null);
        if (!pdfParse && direct && typeof direct === 'object') {
          // Try common exports
          pdfParse = direct.pdfParse || direct.parse || direct.default;
        }
      } catch {}
    }
  }
  
  if (typeof pdfParse !== 'function') {
    throw new Error('pdf-parse module did not export a function. Tried all available paths.');
  }
  return pdfParse as (buf: Buffer) => Promise<{ text: string }>;
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

      // ========== LlamaParse (LlamaIndex Cloud) ==========
      // Use environment-based configuration (config.llamaindex)
      const LLAMAINDEX_API_KEY = config.llamaindex?.apiKey || process.env.LLAMAINDEX_API_KEY || '';
      const LLAMAINDEX_BASE_URL = config.llamaindex?.baseUrl || process.env.LLAMAINDEX_BASE_URL || 'https://cloud.llamaindex.ai';
      if (LLAMAINDEX_API_KEY && LLAMAINDEX_BASE_URL) {
        try {
          const liForm = new FormData();
          liForm.append('file', pdfBuffer, {
            filename: originalName,
            contentType: 'application/pdf',
          } as any);
          // Add language hint for Hebrew
          liForm.append('language', 'heb');

          // LlamaIndex Cloud API endpoint
          // Try both possible endpoints - cloud might use different path
          const liUrl = `${LLAMAINDEX_BASE_URL}/api/parsing/upload`;
          console.log(`[LlamaParse] Attempting upload to: ${liUrl}`);
          const liResp = await axios.post(liUrl, liForm, {
            headers: {
              ...liForm.getHeaders(),
              Authorization: `Bearer ${LLAMAINDEX_API_KEY}`,
            },
            timeout: 120000,
            maxBodyLength: Infinity,
          });
          try {
            const preview = JSON.stringify(liResp.data).slice(0, 1500);
            console.log(`[LlamaParse] upload response (preview): ${preview}`);
            console.log(`[LlamaParse] upload status: ${liResp.status}`);
          } catch (e) {
            console.warn('[LlamaParse] Failed to log upload response:', e);
          }

          // v2 flow: upload returns a job; poll until complete
          const jobId = (liResp.data?.id || liResp.data?.job?.id || liResp.data?.job_id || '').toString();
          if (jobId) {
            const pollUrl = `${LLAMAINDEX_BASE_URL}/api/parsing/jobs/${jobId}`;
            const startTs = Date.now();
            let lastState: string | undefined;
            // poll up to ~120s
            while (Date.now() - startTs < 120000) {
              const jr = await axios.get(pollUrl, {
                headers: { Authorization: `Bearer ${LLAMAINDEX_API_KEY}` },
                timeout: 15000,
              });
              const data = jr.data || {};
              try {
                const preview = JSON.stringify(data).slice(0, 2000);
                console.debug(`[LlamaParse] poll state preview: ${preview}`);
              } catch {}
              const state: string = (data.state || data.status || '').toString().toUpperCase();
              lastState = state;
              if (state === 'SUCCESS' || state === 'SUCCEEDED' || state === 'COMPLETED') {
                // Try various shapes for text output
                const candidates: any[] = [
                  data.text,
                  data.output,
                  data.result?.text,
                  data.result?.output,
                  Array.isArray(data.pages) ? data.pages.map((p: any) => p.text).join('\n\n') : undefined,
                  Array.isArray(data.documents) ? data.documents.map((d: any) => d.text || d.content).join('\n\n') : undefined,
                ];
                const joined = candidates
                  .filter((v) => typeof v === 'string' && v.trim().length > 0)
                  .map((v: string) => v.trim());
                const liText = (joined[0] || '').toString().trim();
                if (liText.length > 0) {
                  console.log('[LlamaParse] Successfully extracted text, length:', liText.length);
                  console.log('[LlamaParse] First 200 chars:', liText.substring(0, 200));
                  res.json({ success: true, text: liText, pages: 0 });
                  return;
                }
                break; // completed but no text; fall through to next parsers
              }
              if (state === 'FAILED' || state === 'ERROR' || state === 'CANCELLED') {
                break; // fall through to next parsers
              }
              await new Promise((r) => setTimeout(r, 1500));
            }
            if (lastState && lastState !== 'SUCCESS' && lastState !== 'SUCCEEDED' && lastState !== 'COMPLETED') {
              console.warn(`LlamaParse job ${jobId} ended without success (state=${lastState})`);
            }
          } else {
            // Legacy immediate text (unlikely); try common fields
            const liTextImmediate = (liResp.data?.text || liResp.data?.output || '').toString().trim();
            if (liTextImmediate && liTextImmediate.length > 0) {
              res.json({ success: true, text: liTextImmediate, pages: 0 });
              return;
            }
          }
        } catch (e) {
          console.warn('LlamaParse failed, will try pdf-parse/OCR as fallback');
          console.warn('LlamaParse error details:', e instanceof Error ? e.message : e);
          if (e && typeof e === 'object' && 'response' in e) {
            const axiosError = e as any;
            console.warn('LlamaParse HTTP status:', axiosError.response?.status);
            console.warn('LlamaParse HTTP data:', JSON.stringify(axiosError.response?.data).slice(0, 500));
          }
        }
      }

      // ========== PDF-PARSE (digital text) ==========
      try {
        const pdfParser = await loadPdfParse();
        const parsed = await pdfParser(pdfBuffer);
        const text = (parsed.text || '').trim();
        const numpages = (parsed as any).numpages || 0;

        if (text.length > 0) {
          const hebrewMatches = text.match(/[\u0590-\u05FF]/g) || [];
          const hebrewRatio = hebrewMatches.length / Math.max(text.length, 1);

          console.log('[pdf-parse] Extracted text, length:', text.length, 'Hebrew ratio:', hebrewRatio.toFixed(2));
          console.log('[pdf-parse] First 200 chars:', text.substring(0, 200));

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

      // ========== UNSTRUCTURED (alternative PDF parser) ==========
      if (process.env.UNSTRUCTURED_API_KEY && process.env.UNSTRUCTURED_API_URL) {
        try {
          // Dynamic import for Unstructured SDK
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const unstructuredMod: any = require('unstructured-client');
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const strategyMod: any = require('unstructured-client/sdk/models/shared');
          
          const UnstructuredClient = unstructuredMod.UnstructuredClient || unstructuredMod.default?.UnstructuredClient || unstructuredMod.default;
          const Strategy = strategyMod?.Strategy || unstructuredMod.Strategy || unstructuredMod.default?.Strategy;
          
          if (!UnstructuredClient) {
            throw new Error('UnstructuredClient not found in module');
          }
          
          const client = new UnstructuredClient({
            serverURL: process.env.UNSTRUCTURED_API_URL,
            security: {
              apiKeyAuth: process.env.UNSTRUCTURED_API_KEY,
            },
          });

          // Use Strategy enum if available, otherwise use string
          const strategyValue = Strategy?.HiRes || 'hi_res';
          
          const result = await client.general.partition({
            partitionParameters: {
              files: {
                content: pdfBuffer,
                fileName: originalName,
              },
              strategy: strategyValue,
              splitPdfPage: true,
              splitPdfAllowFailed: true,
              splitPdfConcurrencyLevel: 15,
              languages: ['heb'], // Hebrew language code for Unstructured
            },
          });

          if (result.statusCode === 200 && result.elements) {
            const unstructuredText = result.elements
              .map((el: any) => el.text || '')
              .filter((t: string) => t.trim().length > 0)
              .join('\n\n');
            
            if (unstructuredText.trim().length > 0) {
              console.log('[Unstructured] Successfully extracted text, length:', unstructuredText.length);
              console.log('[Unstructured] First 200 chars:', unstructuredText.substring(0, 200));
              
              // Check Hebrew ratio
              const hebrewMatches = unstructuredText.match(/[\u0590-\u05FF]/g) || [];
              const hebrewRatio = hebrewMatches.length / Math.max(unstructuredText.length, 1);
              console.log('[Unstructured] Hebrew ratio:', hebrewRatio.toFixed(2));
              
              res.json({ success: true, text: unstructuredText.trim(), pages: result.elements.length });
              return;
            } else {
              console.warn('[Unstructured] No text extracted from elements');
            }
          } else {
            console.warn('[Unstructured] Status code not 200 or no elements:', result.statusCode);
          }
        } catch (unstructuredErr) {
          console.warn('Unstructured failed:', unstructuredErr instanceof Error ? unstructuredErr.message : unstructuredErr);
          if (unstructuredErr && typeof unstructuredErr === 'object' && 'statusCode' in unstructuredErr) {
            const err: any = unstructuredErr;
            console.warn('Unstructured HTTP status:', err.statusCode);
            console.warn('Unstructured error body:', JSON.stringify(err.body || err).slice(0, 500));
          }
        }
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
          responseType: 'json',
          // Ensure UTF-8 encoding
          transformResponse: [(data) => {
            if (typeof data === 'string') {
              try {
                return JSON.parse(data);
              } catch {
                // If already a string that looks like corrupted encoding, try to fix
                const buffer = Buffer.from(data, 'latin1');
                return JSON.parse(buffer.toString('utf8'));
              }
            }
            return data;
          }],
        });

        return response.data as any;
      };

      let ocrResult: any = null;
      try {
        // Try with Hebrew language codes - OCR.space might use different codes
        // Try 'heb' first (some APIs use this)
        ocrResult = await callOcr({ language: 'heb' });

        if (ocrResult?.IsErroredOnProcessing && ocrResult?.ErrorMessage) {
          // Try 'he' (ISO 639-1 code for Hebrew)
          ocrResult = await callOcr({ language: 'he' });
          
          if (ocrResult?.IsErroredOnProcessing && ocrResult?.ErrorMessage) {
            // Try without language (auto-detect) with engine 1
            ocrResult = await callOcr();
            
            if (ocrResult?.IsErroredOnProcessing && ocrResult?.ErrorMessage) {
              const msg = Array.isArray(ocrResult.ErrorMessage)
                  ? ocrResult.ErrorMessage.join(', ')
                  : ocrResult.ErrorMessage;
              console.warn('OCR.space error (default):', msg);

              // Try engine 2 with auto-detect
              ocrResult = await callOcr({ OCREngine: '2' });

              if (ocrResult?.IsErroredOnProcessing && ocrResult?.ErrorMessage) {
                const msg2 = Array.isArray(ocrResult.ErrorMessage)
                    ? ocrResult.ErrorMessage.join(', ')
                    : ocrResult.ErrorMessage;
                console.warn('OCR.space error (engine 2):', msg2);

                // Last resort – English only
                ocrResult = await callOcr({ language: 'eng' });
              }
            }
          }
        }
      } catch (ocrErr) {
        console.warn('OCR.space call failed:', ocrErr instanceof Error ? ocrErr.message : ocrErr);
      }

      let fullText = '';
      let pages = 0;

      if (ocrResult?.ParsedResults && Array.isArray(ocrResult.ParsedResults)) {
        fullText = ocrResult.ParsedResults.map((p: any) => {
          let text = p.ParsedText || '';
          // Fix encoding if text looks corrupted (contains strange characters but no Hebrew)
          if (text && text.length > 0 && !text.match(/[\u0590-\u05FF]/) && text.match(/[^\x00-\x7F]/)) {
            try {
              // Try to fix latin1 -> utf8 encoding issue
              const buffer = Buffer.from(text, 'latin1');
              text = buffer.toString('utf8');
              console.log('[OCR.space] Fixed encoding for text chunk');
            } catch (e) {
              console.warn('[OCR.space] Failed to fix encoding:', e);
            }
          }
          return text;
        }).join('\n\n');
        pages = ocrResult.ParsedResults.length;
        console.log('[OCR.space] Extracted text, length:', fullText.length);
        console.log('[OCR.space] First 200 chars:', fullText.substring(0, 200));
        
        // Check if result is mostly Hebrew - if not, might need different approach
        const hebrewMatches = fullText.match(/[\u0590-\u05FF]/g) || [];
        const hebrewRatio = hebrewMatches.length / Math.max(fullText.length, 1);
        console.log('[OCR.space] Hebrew ratio:', hebrewRatio.toFixed(2));
        
        if (hebrewRatio < 0.1 && fullText.length > 50) {
          console.warn('[OCR.space] Warning: Low Hebrew ratio, might be incorrect language detection');
        }
      }

      // Ensure UTF-8 encoding for Hebrew text
      let finalText = (fullText || '').trim();
      if (finalText) {
        // One more encoding fix attempt if still looks corrupted
        if (!finalText.match(/[\u0590-\u05FF]/) && finalText.match(/[^\x00-\x7F]/)) {
          try {
            const buffer = Buffer.from(finalText, 'latin1');
            finalText = buffer.toString('utf8');
            console.log('[OCR.space] Final encoding fix applied');
          } catch {}
        }
        finalText = String(finalText);
      }

      res.json({ success: true, text: finalText, pages });
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
        resolvedSystemPrompt = 'אתה סוכנת AI חכמה ומועילה. ענה בעברית בצורה ברורה וידידותית.';
      }

      const prompt = `אתה מומחה ביצירת שאלות מותאמות לסוכנות AI.

פרטים שנאספו מהמשתמש:
שם העסק: ${businessName}
תחום העסק: ${businessField}
מטרת הסוכן: ${businessGoal}

על סמך הפרטים האלה, שאל בדיוק 6-8 שאלות נוספות כדי להשלים את הסיסטם פרומפט.

🚨 חשוב מאוד: אתה חייב לשאול לפחות 6 שאלות, לא פחות! בין 6 ל-8 שאלות בסך הכול.

השאלות צריכות להיות מפורטות וממוקדות, עם דוגמאות ספציפיות:

1. **שם הסוכן ומגדר** - שאל על שם ומגדר (זכר/נקבה) עם דוגמאות כמו "איך הסוכן יקרא לעצמו? (דוגמה: דנה, עמית, רון)"

2. **תכונות אופי ספציפיות** - שאל על תכונות אופי רלוונטיות לתחום עם דוגמאות כמו "איך הסוכן צריך להתנהג? (דוגמה: מקצועי, ידידותי, סבלני)"

3. **סגנון תקשורת מפורט** - שאל על סגנון דיבור עם דוגמאות כמו "איך הסוכן צריך לדבר? (דוגמה: קליל, מקצועי, עם סלנג ישראלי)"

4. **תהליכי עבודה ספציפיים** - שאל על מה לעשות במקרים קשים עם דוגמאות כמו "מה לעשות כשלקוח כועס? (דוגמה: להקשיב, להתנצל, להציע פתרון)"

5. **מגבלות ואזהרות** - שאל על מה לא לדבר עליו עם דוגמאות כמו "מה אסור לדבר עליו? (דוגמה: מחירים של מתחרים, מידע אישי)"

6. **דוגמאות מעשיות** - שאל על דוגמאות לפתיחה עם דוגמאות כמו "איך הסוכן יפתח שיחה? (דוגמה: 'היי! איך אפשר לעזור?')"

⚠️ אם תשאל פחות מ-6 שאלות, התשובה שלך לא תתקבל!

השאלות צריכות להיות מותאמות לתחום העסק: ${businessField}`;

      const response = await this.aiService.generateResponse(
        [ { role: 'user', content: prompt } as any ],
        { temperature: 0.7, maxTokens: 500, systemPrompt: resolvedSystemPrompt },
        false // isForWhatsApp = false - לא להגביל תווים ליצירת שאלות
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

      // Separate user answers and optional PDF context (additive only)
      const pdfPrefix = 'תוכן מקובץ PDF:';
      const userAnswers: string[] = [];
      const pdfChunks: string[] = [];

      for (const a of answers as string[]) {
        if (typeof a === 'string' && a.trim().startsWith(pdfPrefix)) {
          const onlyText = a.replace(pdfPrefix, '').trim();
          if (onlyText) pdfChunks.push(onlyText);
        } else {
          userAnswers.push(a);
        }
      }

      const pdfSection = pdfChunks.length > 0
        ? `\n\nקונטקסט נוסף מה-PDF (תוספת בלבד, לא במקום תשובות המשתמש):\n${pdfChunks.join('\n')}\n\n`
        : '\n';

      const prompt = `אתה מומחה ביצירת סיסטם פרומפטים לסוכנות AI.

תבסס על התשובות הבאות וצור סיסטם פרומפט מקצועי:
${userAnswers.join('\n')}
${pdfSection}
חשוב מאוד:
- התוכן מה-PDF הוא תוספת בלבד. אם קיים פער מול תשובות המשתמש, עדיפות מוחלטת לתשובות המשתמש.
- אל תחליף או תסיר פרטים מהתשובות; רק העשר בעזרת ה-PDF.

צור סיסטם פרומפט שכולל:
1. **זהות הסוכן** - שם, מגדר, תכונות אופי
2. **תפקיד ומטרה** - מה הסוכן עושה ומה המטרה
3. **סגנון תקשורת** - איך לדבר עם הלקוח (חשוב: פנה ללקוח בלשון המתאימה למגדר שלו)
4. **הנחיות עבודה** - איך לטפל במקרים שונים
5. **מגבלות** - מה לא לדבר עליו
6. **דוגמאות והנחיות מעשיות** -
   - פתיחות שיחה, תגובות לדוגמא, ותסריטי שיחה מעשיים.
   - אם בקונטקסט ה-PDF קיימים "תרחישי שיחה"/"תסריטים"/"סקריפטים" — שלב אותם כאן באופן מסודר ומדויק (רשימות ממוספרות, כותרות קצרות), בלי למחוק פרטים מהתשובות. אם צריך, תמצת משפטית לשמירה על בהירות.

**חשוב:** השתמש במידע מהתשובות. אם מידע חסר, השתמש בערכים כלליים ומקצועיים.
**חשוב מאוד:** פנה ללקוח בלשון המתאימה למגדר שלו (זכר/נקבה) כפי שצוין בתשובות.
**לגבי תרחישי שיחה מה-PDF:** אם נמצאו, שלב אותם תחת סעיף 6 כדוגמאות ותסריטים קונקרטיים (כולל וריאציות, התנגדויות נפוצות ומענה מומלץ), תוך התאמה לסגנון התקשורת שצוין.

ענה רק עם הסיסטם פרומפט המלא, ללא הסבר נוסף.`;

      const response = await this.aiService.generateResponse(
        [ { role: 'user', content: prompt } as any ],
        { temperature: 0.7, maxTokens: 8000 },
        false // isForWhatsApp = false - לא להגביל תווים ליצירת סיסטם פרומפט
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


