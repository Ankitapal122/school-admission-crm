import { BadRequestException } from '@nestjs/common';

export type CanonicalRole = 'SUPER_ADMIN' | 'SENIOR_MANAGER' | 'COUNSELLOR';
export type BlueprintRole = 'super_admin' | 'manager' | 'jr_counsellor';

/**
 * Normalizes an Indian mobile number to +91XXXXXXXXXX format.
 * Throws BadRequestException when a non-empty value cannot form a valid 10-digit number.
 */
export function normalizeIndianPhone(input?: string | null, required = false): string | null {
  if (input === undefined || input === null || String(input).trim() === '') {
    if (required) {
      throw new BadRequestException('Mobile number is required in +91XXXXXXXXXX format.');
    }
    return null;
  }

  let digits = String(input).replace(/[\s\-().+]/g, '');
  if (digits.startsWith('91') && digits.length === 12) {
    digits = digits.slice(2);
  } else if (digits.startsWith('0') && digits.length === 11) {
    digits = digits.slice(1);
  }

  if (!/^[6-9]\d{9}$/.test(digits)) {
    throw new BadRequestException(
      `Invalid Indian mobile number "${input}". Expected 10 digits or +91XXXXXXXXXX.`,
    );
  }

  return `+91${digits}`;
}

/**
 * Maps any role string or UI alias to the canonical Prisma RBAC role.
 */
export function normalizeCanonicalRole(role?: string | null): CanonicalRole {
  const r = String(role || '').trim().toLowerCase();
  if (r === 'super_admin' || r === 'admin') return 'SUPER_ADMIN';
  if (r === 'senior_manager' || r === 'manager' || r === 'sr_counsellor' || r === 'sr') {
    return 'SENIOR_MANAGER';
  }
  return 'COUNSELLOR';
}

/**
 * Maps canonical role to blueprint API string representation.
 */
export function toBlueprintRole(role?: string | null): BlueprintRole {
  const canon = normalizeCanonicalRole(role);
  if (canon === 'SUPER_ADMIN') return 'super_admin';
  if (canon === 'SENIOR_MANAGER') return 'manager';
  return 'jr_counsellor';
}

/**
 * Normalizes input role query/DTO strings to match any stored Role enum value.
 */
export function matchingRoleVariants(role?: string | null): string[] {
  const canon = normalizeCanonicalRole(role);
  if (canon === 'SUPER_ADMIN') return ['SUPER_ADMIN', 'super_admin'];
  if (canon === 'SENIOR_MANAGER') return ['SENIOR_MANAGER', 'manager'];
  return ['COUNSELLOR', 'jr_counsellor'];
}

/**
 * Strips leading spreadsheet formula injection characters (=, +, -, @, tab, cr).
 */
export function sanitizeSpreadsheetCell(value: unknown): string {
  if (value === undefined || value === null) return '';
  let str = String(value).trim();
  while (/^[=+\-@\t\r]/.test(str)) {
    str = str.slice(1).trim();
  }
  return str;
}

/**
 * Parses a class/grade value such as "Class 7" or "7" into integer 1..12.
 */
export function parseClassGrade(raw: unknown, fallback = 6): number {
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return Math.min(12, Math.max(1, Math.round(raw)));
  }
  const m = String(raw || '').match(/\d+/);
  if (!m) return fallback;
  const n = parseInt(m[0], 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(12, Math.max(1, n));
}

/**
 * Maps a lead stage or legacy status string onto one of the 12 canonical Kanban stages
 * or 5 lifecycle statuses while preserving backwards compatibility.
 */
export const KANBAN_STAGES = [
  'new',
  'contacted',
  'qualified',
  'shortlisted',
  'applied',
  'conference_call',
  'test_interview',
  'visit_registration',
  'selected',
  'admission_done',
  'commission_received',
  'closed',
] as const;

export function toBlueprintLeadStatus(raw?: string | null): string {
  const s = String(raw || 'new').trim();
  const map: Record<string, string> = {
    NEW_LEAD: 'new',
    new: 'new',
    CONTACTED: 'contacted',
    contacted: 'contacted',
    qualified: 'qualified',
    shortlisted: 'shortlisted',
    APPLICATION_SUBMITTED: 'applied',
    applied: 'applied',
    conference_call: 'conference_call',
    test_interview: 'test_interview',
    SCHOOL_TOUR_SCHEDULED: 'visit_registration',
    REGISTERED: 'visit_registration',
    visit_registration: 'visit_registration',
    selected: 'selected',
    ADMISSION_CONFIRMED: 'admission_done',
    ENROLLED: 'admission_done',
    admission_done: 'admission_done',
    commission_received: 'commission_received',
    closed: 'closed',
    MERGED: 'merged',
    merged: 'merged',
    LOST: 'disqualified',
    disqualified: 'disqualified',
    expired: 'expired',
    suspended: 'suspended',
    reopened: 'reopened',
  };
  return map[s] || s.toLowerCase();
}

/**
 * Returns both blueprint `{ success: true, data, message }` and preserved top-level keys
 * so both blueprint clients and existing frontend/tests work transparently.
 */
export function apiEnvelope<T extends Record<string, any>>(
  data: any,
  message?: string,
  legacyFields?: T,
) {
  return {
    success: true,
    ...(message ? { message } : {}),
    data,
    ...(legacyFields || {}),
  };
}
