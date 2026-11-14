import * as crypto from 'crypto';

function getAesKey(): Buffer {
  const raw =
    process.env.ENCRYPTION_KEY ||
    process.env.JWT_ACCESS_SECRET ||
    'boardingedu_enterprise_aes256_fallback_key_2026';
  return crypto.createHash('sha256').update(raw).digest();
}

export function encryptSensitiveData(payload: unknown): string | null {
  if (payload === undefined || payload === null || payload === '') return null;
  const json = JSON.stringify(payload);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getAesKey(), iv);
  const encrypted = Buffer.concat([cipher.update(json, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

export function decryptSensitiveData<T = any>(cipherText?: string | null): T | null {
  if (!cipherText) return null;
  try {
    const parts = cipherText.split(':');
    if (parts.length !== 3) {
      return JSON.parse(cipherText) as T;
    }
    const [ivHex, tagHex, dataHex] = parts;
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      getAesKey(),
      Buffer.from(ivHex, 'hex'),
    );
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(dataHex, 'hex')),
      decipher.final(),
    ]).toString('utf8');
    try {
      return JSON.parse(decrypted) as T;
    } catch {
      return decrypted as unknown as T;
    }
  } catch {
    return null;
  }
}

export function maskBankAccount(acct: any): any {
  if (!acct) return null;
  if (typeof acct === 'string') {
    const clean = acct.trim();
    if (!clean) return '';
    return clean.length > 4 ? `${'X'.repeat(clean.length - 4)}${clean.slice(-4)}` : clean;
  }
  if (typeof acct !== 'object') return null;
  const num = String(acct.account_number || acct.accountNumber || '');
  const maskedNum = num.length > 4 ? `${'*'.repeat(num.length - 4)}${num.slice(-4)}` : num;
  return {
    account_number_masked: maskedNum,
    ifsc: acct.ifsc || '',
    bank_name: acct.bank_name || acct.bankName || '',
    upi_id: acct.upi_id || acct.upiId || '',
  };
}
