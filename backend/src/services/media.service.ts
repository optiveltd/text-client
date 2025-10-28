import fs from 'fs';
import path from 'path';
import os from 'os';
import { spawn } from 'child_process';
import { WhatsAppDecrypt } from '../utils/whatsapp-decrypt';

export class MediaService {
  async downloadAndDecryptMedia(url: string, mediaKey: string, mimetype: string, mediaType: 'audio' | 'image' = 'audio'): Promise<string> {
    const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), `wa-${mediaType}-`));
    
    // Determine file extension based on media type and mimetype
    let extension = '.ogg';
    if (mediaType === 'image') {
      if (mimetype.includes('jpeg') || mimetype.includes('jpg')) extension = '.jpg';
      else if (mimetype.includes('png')) extension = '.png';
      else if (mimetype.includes('gif')) extension = '.gif';
      else if (mimetype.includes('webp')) extension = '.webp';
      else extension = '.jpg'; // default
    }
    
    const encryptedPath = path.join(tmpDir, `encrypted${extension}`);
    const decryptedPath = path.join(tmpDir, `decrypted${extension}`);

    // Fix URL - add domain if relative path
    const fullUrl = url.startsWith('http') 
      ? url 
      : `https://mmg.whatsapp.net${url}`;

    console.log('Downloading audio from:', fullUrl);

    // Download encrypted file
    const res = await fetch(fullUrl);
    if (!res.ok || !res.body) {
      throw new Error(`Failed to download media: ${res.status} ${res.statusText}`);
    }

    console.log('Audio download successful, size:', res.headers.get('content-length') || 'unknown');

    const fileStream = fs.createWriteStream(encryptedPath);
    await new Promise<void>((resolve, reject) => {
      res.body!.pipeTo(new WritableStream({
        write(chunk) {
          return new Promise<void>((res2, rej2) => {
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

    // Decrypt using proper WhatsApp decryption
    try {
      const encryptedData = await fs.promises.readFile(encryptedPath);
      console.log(`Encrypted data length: ${encryptedData.length}`);
      
      // Use proper WhatsApp decryption
      const decryptedData = WhatsAppDecrypt.decryptMedia(encryptedData, mediaKey, mediaType);
      
      if (decryptedData) {
        await fs.promises.writeFile(decryptedPath, decryptedData);
        console.log(`✅ ${mediaType} decrypted successfully: ${decryptedData.length} bytes`);
      } else {
        throw new Error('Decryption returned null');
      }
    } catch (error) {
      console.warn('Decryption failed, trying encrypted file directly:', error);
      await fs.promises.copyFile(encryptedPath, decryptedPath);
    }

    return decryptedPath;
  }

  // Backward compatibility
  async downloadAndDecryptAudio(url: string, mediaKey: string, mimetype: string): Promise<string> {
    return this.downloadAndDecryptMedia(url, mediaKey, mimetype, 'audio');
  }

  async downloadAndDecryptImage(url: string, mediaKey: string, mimetype: string): Promise<string> {
    return this.downloadAndDecryptMedia(url, mediaKey, mimetype, 'image');
  }
  async downloadToTemp(url: string, suggestedExt = '.ogg', headers?: Record<string, string>): Promise<string> {
    const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'wa-audio-'));
    const filePath = path.join(tmpDir, `input${suggestedExt}`);

    // Fix URL - add domain if relative path
    const fullUrl = url.startsWith('http') 
      ? url 
      : `https://mmg.whatsapp.net${url}`;

    const res = await fetch(fullUrl, { headers });
    if (!res.ok || !res.body) {
      throw new Error(`Failed to download media: ${res.status} ${res.statusText}`);
    }

    const fileStream = fs.createWriteStream(filePath);
    await new Promise<void>((resolve, reject) => {
      res.body!.pipeTo(new WritableStream({
        write(chunk) {
          return new Promise<void>((res2, rej2) => {
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

  async convertToWav16kMono(inputPath: string): Promise<string> {
    const dir = path.dirname(inputPath);
    const outPath = path.join(dir, 'output.wav');

    // Try different FFmpeg paths for Windows
    const ffmpegPaths = [
      'ffmpeg', // if in PATH
      'C:\\Program Files\\DownloadHelper CoApp\\ffmpeg.exe',
      'C:\\Program Files\\Shotcut\\ffmpeg.exe',
      'C:\\ffmpeg\\bin\\ffmpeg.exe'
    ];

    let ffmpegPath = ffmpegPaths[0];
    for (const candidate of ffmpegPaths) {
      try {
        await fs.promises.access(candidate, fs.constants.F_OK);
        ffmpegPath = candidate;
        break;
      } catch {
        // Continue to next candidate
      }
    }

    await new Promise<void>((resolve, reject) => {
      const ff = spawn(ffmpegPath, ['-y', '-i', inputPath, '-ac', '1', '-ar', '16000', outPath], {
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
        } else {
          console.error('FFmpeg conversion failed:', { code, stderr });
          reject(new Error(`ffmpeg exited with code ${code}: ${stderr}`));
        }
      });
    });

    return outPath;
  }

  async cleanupTemp(filePath: string) {
    try {
      const dir = path.dirname(filePath);
      await fs.promises.rm(dir, { recursive: true, force: true });
    } catch {}
  }
}

export const mediaService = new MediaService();


