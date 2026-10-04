import { createHmac, timingSafeEqual } from 'node:crypto';

export function webhookAuthorized(
  raw: Buffer | undefined,
  signature: string | undefined,
  secretHeader: string | undefined,
  secret: string,
): boolean {
  if (!secret) return false;
  if (secretHeader && safeEqual(secretHeader, secret)) return true;
  if (raw && signature && hmacEqual(raw, signature, secret)) return true;
  return false;
}

function hmacEqual(raw: Buffer, signature: string, secret: string): boolean {
  const digest = createHmac('sha256', secret).update(raw).digest('base64');
  return safeEqual(digest, signature);
}

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
