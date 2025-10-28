export declare class MediaService {
    downloadAndDecryptMedia(url: string, mediaKey: string, mimetype: string, mediaType?: 'audio' | 'image'): Promise<string>;
    downloadAndDecryptAudio(url: string, mediaKey: string, mimetype: string): Promise<string>;
    downloadAndDecryptImage(url: string, mediaKey: string, mimetype: string): Promise<string>;
    downloadToTemp(url: string, suggestedExt?: string, headers?: Record<string, string>): Promise<string>;
    convertToWav16kMono(inputPath: string): Promise<string>;
    cleanupTemp(filePath: string): Promise<void>;
}
export declare const mediaService: MediaService;
//# sourceMappingURL=media.service.d.ts.map