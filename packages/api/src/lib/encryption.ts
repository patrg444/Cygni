import CryptoJS from "crypto-js";
import logger from "./logger";

const ENCRYPTION_KEY = process.env.OAUTH_ENCRYPTION_KEY || "default-dev-key-change-in-production";

export function encrypt(text: string): string {
  try {
    return CryptoJS.AES.encrypt(text, ENCRYPTION_KEY).toString();
  } catch (error) {
    logger.error("Encryption failed", { error });
    throw new Error("Failed to encrypt data");
  }
}

export function decrypt(encryptedText: string): string {
  try {
    const bytes = CryptoJS.AES.decrypt(encryptedText, ENCRYPTION_KEY);
    return bytes.toString(CryptoJS.enc.Utf8);
  } catch (error) {
    logger.error("Decryption failed", { error });
    throw new Error("Failed to decrypt data");
  }
}

export function hashToken(token: string): string {
  return CryptoJS.SHA256(token).toString();
}