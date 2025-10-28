"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WhatsAppDecrypt = void 0;
const crypto_1 = __importDefault(require("crypto"));
class WhatsAppDecrypt {
    static decryptMedia(encryptedData, mediaKey, mediaType) {
        try {
            console.log(`🔓 Decrypting WhatsApp media with mediaKey for ${mediaType}`);
            const mediaKeyBuffer = Buffer.from(mediaKey, 'base64');
            console.log(`MediaKey buffer length: ${mediaKeyBuffer.length}`);
            const keys = this.deriveKeys(mediaKeyBuffer, mediaType);
            console.log(`Derived keys length: ${keys.length}`);
            const iv = keys.slice(0, 16);
            const cipherKey = keys.slice(16, 48);
            const ciphertext = encryptedData.slice(0, -10);
            console.log(`Ciphertext length: ${ciphertext.length}`);
            const decipher = crypto_1.default.createDecipheriv('aes-256-cbc', cipherKey, iv);
            const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
            console.log(`✅ Media decrypted successfully: ${decrypted.length} bytes`);
            return decrypted;
        }
        catch (error) {
            console.error(`❌ Failed to decrypt media: ${error.message}`);
            return null;
        }
    }
    static deriveKeys(mediaKey, mediaType) {
        const infoMap = {
            image: 'WhatsApp Image Keys',
            video: 'WhatsApp Video Keys',
            audio: 'WhatsApp Audio Keys',
            document: 'WhatsApp Document Keys',
        };
        const info = infoMap[mediaType] || 'WhatsApp Audio Keys';
        console.log(`Using info string: ${info}`);
        const prk = crypto_1.default.createHmac('sha256', Buffer.alloc(32)).update(mediaKey).digest();
        const length = 112;
        const n = Math.ceil(length / 32);
        let t = Buffer.alloc(0);
        const result = [];
        for (let i = 1; i <= n; i++) {
            const h = crypto_1.default
                .createHmac('sha256', prk)
                .update(Buffer.concat([t, Buffer.from(info), Buffer.from([i])]))
                .digest();
            t = Buffer.from(h);
            result.push(t);
        }
        return Buffer.concat(result).slice(0, length);
    }
}
exports.WhatsAppDecrypt = WhatsAppDecrypt;
//# sourceMappingURL=whatsapp-decrypt.js.map