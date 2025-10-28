import { Request, Response } from 'express';
export declare class WhatsAppController {
    private supabase;
    private aiService;
    private messageBuffers;
    private readonly DEBOUNCE_DELAY;
    private processMessageWithDebounce;
    private getImageExtension;
    private normalizePhoneNumber;
    webhook(req: Request, res: Response): Promise<void>;
    sendFirstMessage(req: Request, res: Response): Promise<void>;
    stopSimulation(req: Request, res: Response): Promise<void>;
}
//# sourceMappingURL=whatsapp.controller.d.ts.map