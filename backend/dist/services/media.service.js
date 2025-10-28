"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.mediaService = exports.MediaService = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const os_1 = __importDefault(require("os"));
const child_process_1 = require("child_process");
const whatsapp_decrypt_1 = require("../utils/whatsapp-decrypt");
class MediaService {
    async downloadAndDecryptMedia(url, mediaKey, mimetype, mediaType = 'audio') {
        const tmpDir = await fs_1.default.promises.mkdtemp(path_1.default.join(os_1.default.tmpdir(), `wa-${mediaType}-`));
        let extension = '.ogg';
        if (mediaType === 'image') {
            if (mimetype.includes('jpeg') || mimetype.includes('jpg'))
                extension = '.jpg';
            else if (mimetype.includes('png'))
                extension = '.png';
            else if (mimetype.includes('gif'))
                extension = '.gif';
            else if (mimetype.includes('webp'))
                extension = '.webp';
            else
                extension = '.jpg';
        }
        const encryptedPath = path_1.default.join(tmpDir, `encrypted${extension}`);
        const decryptedPath = path_1.default.join(tmpDir, `decrypted${extension}`);
        const fullUrl = url.startsWith('http')
            ? url
            : `https://mmg.whatsapp.net${url}`;
        console.log('Downloading audio from:', fullUrl);
        const res = await fetch(fullUrl);
        if (!res.ok || !res.body) {
            throw new Error(`Failed to download media: ${res.status} ${res.statusText}`);
        }
        console.log('Audio download successful, size:', res.headers.get('content-length') || 'unknown');
        const fileStream = fs_1.default.createWriteStream(encryptedPath);
        await new Promise((resolve, reject) => {
            res.body.pipeTo(new WritableStream({
                write(chunk) {
                    return new Promise((res2, rej2) => {
                        fileStream.write(Buffer.from(chunk), (err) => (err ? rej2(err) : res2()));
                    });
                },
                close() {
                    fileStream.end(() => resolve());
                },
                abort(reason) {
                    reject(reason);
                },
            })).catch(reject);
        });
        try {
            const encryptedData = await fs_1.default.promises.readFile(encryptedPath);
            console.log(`Encrypted data length: ${encryptedData.length}`);
            const decryptedData = whatsapp_decrypt_1.WhatsAppDecrypt.decryptMedia(encryptedData, mediaKey, mediaType);
            if (decryptedData) {
                await fs_1.default.promises.writeFile(decryptedPath, decryptedData);
                console.log(`✅ ${mediaType} decrypted successfully: ${decryptedData.length} bytes`);
            }
            else {
                throw new Error('Decryption returned null');
            }
        }
        catch (error) {
            console.warn('Decryption failed, trying encrypted file directly:', error);
            await fs_1.default.promises.copyFile(encryptedPath, decryptedPath);
        }
        return decryptedPath;
    }
    async downloadAndDecryptAudio(url, mediaKey, mimetype) {
        return this.downloadAndDecryptMedia(url, mediaKey, mimetype, 'audio');
    }
    async downloadAndDecryptImage(url, mediaKey, mimetype) {
        return this.downloadAndDecryptMedia(url, mediaKey, mimetype, 'image');
    }
    async downloadToTemp(url, suggestedExt = '.ogg', headers) {
        const tmpDir = await fs_1.default.promises.mkdtemp(path_1.default.join(os_1.default.tmpdir(), 'wa-audio-'));
        const filePath = path_1.default.join(tmpDir, `input${suggestedExt}`);
        const fullUrl = url.startsWith('http')
            ? url
            : `https://mmg.whatsapp.net${url}`;
        const res = await fetch(fullUrl, { headers });
        if (!res.ok || !res.body) {
            throw new Error(`Failed to download media: ${res.status} ${res.statusText}`);
        }
        const fileStream = fs_1.default.createWriteStream(filePath);
        await new Promise((resolve, reject) => {
            res.body.pipeTo(new WritableStream({
                write(chunk) {
                    return new Promise((res2, rej2) => {
                        fileStream.write(Buffer.from(chunk), (err) => (err ? rej2(err) : res2()));
                    });
                },
                close() {
                    fileStream.end(() => resolve());
                },
                abort(reason) {
                    reject(reason);
                },
            })).catch(reject);
        });
        return filePath;
    }
    async convertToWav16kMono(inputPath) {
        const dir = path_1.default.dirname(inputPath);
        const outPath = path_1.default.join(dir, 'output.wav');
        const ffmpegPaths = [
            'ffmpeg',
            'C:\\Program Files\\DownloadHelper CoApp\\ffmpeg.exe',
            'C:\\Program Files\\Shotcut\\ffmpeg.exe',
            'C:\\ffmpeg\\bin\\ffmpeg.exe'
        ];
        let ffmpegPath = ffmpegPaths[0];
        for (const candidate of ffmpegPaths) {
            try {
                await fs_1.default.promises.access(candidate, fs_1.default.constants.F_OK);
                ffmpegPath = candidate;
                break;
            }
            catch {
            }
        }
        await new Promise((resolve, reject) => {
            const ff = (0, child_process_1.spawn)(ffmpegPath, ['-y', '-i', inputPath, '-ac', '1', '-ar', '16000', outPath], {
                stdio: ['pipe', 'pipe', 'pipe']
            });
            let stderr = '';
            ff.stderr.on('data', (data) => {
                stderr += data.toString();
            });
            ff.on('error', (error) => {
                console.error('FFmpeg spawn error:', error);
                reject(error);
            });
            ff.on('close', (code) => {
                if (code === 0) {
                    console.log('FFmpeg conversion successful');
                    resolve();
                }
                else {
                    console.error('FFmpeg conversion failed:', { code, stderr });
                    reject(new Error(`ffmpeg exited with code ${code}: ${stderr}`));
                }
            });
        });
        return outPath;
    }
    async cleanupTemp(filePath) {
        try {
            const dir = path_1.default.dirname(filePath);
            await fs_1.default.promises.rm(dir, { recursive: true, force: true });
        }
        catch { }
    }
}
exports.MediaService = MediaService;
exports.mediaService = new MediaService();
//# sourceMappingURL=media.service.js.map