export type CanonicalRole = 'SUPER_ADMIN' | 'SENIOR_MANAGER' | 'COUNSELLOR';
export type BlueprintRole = 'super_admin' | 'manager' | 'jr_counsellor';

export function normalizeRoleKey(role?: string | null): BlueprintRole {
  const r = String(role || '').trim().toLowerCase();
  if (r === 'super_admin' || r === 'admin' || r === 'superadmin') return 'super_admin';
  if (r === 'manager' || r === 'senior_manager' || r === 'sr_manager') return 'manager';
  return 'jr_counsellor';
}

export function toCanonicalRole(role?: string | null): CanonicalRole {
  const key = normalizeRoleKey(role);
  if (key === 'super_admin') return 'SUPER_ADMIN';
  if (key === 'manager') return 'SENIOR_MANAGER';
  return 'COUNSELLOR';
}

export function hasRole(userRole?: string | null, ...allowed: string[]): boolean {
  const userKey = normalizeRoleKey(userRole);
  const userCanon = toCanonicalRole(userRole);
  return allowed.some((a) => {
    const k = normalizeRoleKey(a);
    const c = toCanonicalRole(a);
    return k === userKey || c === userCanon;
  });
}

export function getRoleDisplayLabel(role?: string | null): string {
  const key = normalizeRoleKey(role);
  if (key === 'super_admin') return 'Super Admin';
  if (key === 'manager') return 'Senior Manager';
  return 'Jr. Counsellor';
}

export interface KanbanStageMeta {
  key: string;
  label: string;
  color: string;
  bg: string;
  accent: string;
}

export const BLUEPRINT_KANBAN_STAGES: KanbanStageMeta[] = [
  { key: 'new', label: 'New Enquiry', color: '#1D4ED8', bg: '#EFF6FF', accent: '#3B82F6' },
  { key: 'contacted', label: 'Contacted', color: '#0369A1', bg: '#F0F9FF', accent: '#0EA5E9' },
  { key: 'qualified', label: 'Qualified', color: '#4338CA', bg: '#EEF2FF', accent: '#6366F1' },
  { key: 'shortlisted', label: 'Shortlisted', color: '#6D28D9', bg: '#F5F3FF', accent: '#8B5CF6' },
  { key: 'application_submitted', label: 'App Submitted', color: '#B45309', bg: '#FFFBEB', accent: '#F59E0B' },
  { key: 'entrance_scheduled', label: 'Entrance Test', color: '#C2410C', bg: '#FFF7ED', accent: '#F97316' },
  { key: 'interview_scheduled', label: 'Interview', color: '#7E22CE', bg: '#FAF5FF', accent: '#A855F7' },
  { key: 'selected', label: 'Selected / Offer', color: '#0F766E', bg: '#F0FDFA', accent: '#14B8A6' },
  { key: 'fee_paid', label: 'Fee Paid', color: '#047857', bg: '#ECFDF5', accent: '#10B981' },
  { key: 'admission_done', label: 'Admission Done', color: '#15803D', bg: '#F0FDF4', accent: '#22C55E' },
  { key: 'enrolled', label: 'Child Enrolled', color: '#166534', bg: '#DCFCE7', accent: '#16A34A' },
  { key: 'commission_received', label: 'Commission Rcvd', color: '#123B70', bg: '#EFF6FF', accent: '#123B70' },
];
