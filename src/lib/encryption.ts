import crypto from 'crypto';

// The key used for encryption should be 32 bytes (256 bits).
function getEncryptionKey(): Buffer {
  const key = process.env.CONFIG_ENCRYPTION_KEY;
  if (!key) {
    throw new Error('CONFIG_ENCRYPTION_KEY environment variable is missing.');
  }
  
  // If the key is base64 encoded and exactly 32 bytes, decode it.
  // Otherwise, hash the provided string using SHA-256 to guarantee 32 bytes.
  return crypto.createHash('sha256').update(key).digest();
}

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

export function encryptSecret(text: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  
  let encrypted = cipher.update(text, 'utf8', 'base64');
  encrypted += cipher.final('base64');
  
  const authTag = cipher.getAuthTag().toString('base64');
  const ivBase64 = iv.toString('base64');
  
  return `ENC[${ivBase64}:${encrypted}:${authTag}]`;
}

export function decryptSecret(encryptedData: string): string {
  if (!encryptedData.startsWith('ENC[')) {
    return encryptedData;
  }
  
  const payload = encryptedData.slice(4, -1);
  const parts = payload.split(':');
  
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted format.');
  }
  
  const [ivBase64, encrypted, authTagBase64] = parts;
  
  const key = getEncryptionKey();
  const iv = Buffer.from(ivBase64, 'base64');
  const authTag = Buffer.from(authTagBase64, 'base64');
  
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  
  let decrypted = decipher.update(encrypted, 'base64', 'utf8');
  decrypted += decipher.final('utf8');
  
  return decrypted;
}

export function isEncrypted(text: string): boolean {
  return typeof text === 'string' && text.startsWith('ENC[');
}
