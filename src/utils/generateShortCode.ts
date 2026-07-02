import crypto from "crypto";

export default function generateShortCode(length: number = 6): string {
  const chars =
    "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const charsLength = chars.length;
  let randomBytes = crypto.randomBytes(length);
  let shortCode = "";
  for (let i = 0; i < length; i++) {
    const index = randomBytes[i] % charsLength;
    shortCode += chars[index];
  }

  return shortCode;
}
