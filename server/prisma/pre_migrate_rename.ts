import * as fs from 'fs';
import * as path from 'path';
import { PrismaClient } from '@prisma/client';

async function run() {
  const prisma = new PrismaClient();
  await prisma.$connect();

  const tableExists = async (name: string) => {
    const res: any[] = await prisma.$queryRawUnsafe(
      `SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1) AS e`,
      name,
    );
    return Boolean(res[0]?.e);
  };

  const colExists = async (table: string, col: string) => {
    const res: any[] = await prisma.$queryRawUnsafe(
      `SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2) AS e`,
      table,
      col,
    );
    return Boolean(res[0]?.e);
  };

  const renameTableIf = async (oldName: string, newName: string) => {
    if ((await tableExists(oldName)) && !(await tableExists(newName))) {
      await prisma.$executeRawUnsafe(`ALTER TABLE "${oldName}" RENAME TO "${newName}"`);
      console.log(`Renamed table "${oldName}" -> "${newName}"`);
    }
  };

  const renameColIf = async (table: string, oldCol: string, newCol: string) => {
    if ((await tableExists(table)) && (await colExists(table, oldCol)) && !(await colExists(table, newCol))) {
      await prisma.$executeRawUnsafe(`ALTER TABLE "${table}" RENAME COLUMN "${oldCol}" TO "${newCol}"`);
      console.log(`Renamed column "${table}"."${oldCol}" -> "${newCol}"`);
    }
  };

  console.log('--- Running non-destructive pre-migration table & column renames ---');

  // 1. Table renames
  await renameTableIf('User', 'users');
  await renameTableIf('RefreshTokenSession', 'sessions');
  await renameTableIf('SystemSetting', 'system_settings');
  await renameTableIf('Lead', 'leads');
  await renameTableIf('School', 'schools');
  await renameTableIf('Admission', 'applications');
  await renameTableIf('Commission', 'commission_ledger');
  await renameTableIf('Notification', 'notifications');
  await renameTableIf('AuditLog', 'audit_log');

  // 2. Column renames
  const colMap: Array<[string, Array<[string, string]>]> = [
    [
      'users',
      [
        ['employeeId', 'employee_id'],
        ['fullName', 'full_name'],
        ['passwordHash', 'password_hash'],
        ['isTwoFactorEnabled', 'two_fa_enabled'],
        ['twoFactorSecret', 'two_fa_secret'],
        ['recoveryCodes', 'backup_codes'],
        ['isActive', 'is_active'],
        ['lastLoginAt', 'last_login_at'],
        ['teamId', 'team_id'],
        ['managerId', 'manager_id'],
        ['createdAt', 'created_at'],
        ['updatedAt', 'updated_at'],
        ['deletedAt', 'deleted_at'],
      ],
    ],
    [
      'sessions',
      [
        ['tokenHash', 'refresh_token_hash'],
        ['userId', 'user_id'],
        ['isRevoked', 'is_revoked'],
        ['expiresAt', 'expires_at'],
        ['userAgent', 'device_info'],
        ['ipAddress', 'ip_address'],
        ['createdAt', 'created_at'],
        ['revokedReason', 'revoked_reason'],
      ],
    ],
    [
      'system_settings',
      [
        ['createdAt', 'created_at'],
        ['updatedAt', 'updated_at'],
      ],
    ],
    [
      'whatsapp_templates',
      [
        ['templateKey', 'template_key'],
        ['recipientType', 'recipient_type'],
        ['isActive', 'is_active'],
        ['usageCount', 'usage_count'],
        ['createdAt', 'created_at'],
        ['updatedAt', 'updated_at'],
      ],
    ],
    [
      'leads',
      [
        ['leadNumber', 'lead_id'],
        ['parentId', 'parent_id'],
        ['studentId', 'student_id'],
        ['studentName', 'student_name'],
        ['studentGender', 'gender'],
        ['studentDob', 'student_dob'],
        ['currentGrade', 'current_grade'],
        ['applyingForGrade', 'applying_for_grade'],
        ['parentName', 'parent_name'],
        ['parentPhone', 'mobile_primary'],
        ['parentEmail', 'email'],
        ['city', 'city_resident'],
        ['preferredLocation', 'city_preferred'],
        ['boardingPreference', 'school_type'],
        ['annualBudget', 'budget_range'],
        ['budgetMin', 'budget_min'],
        ['budgetMax', 'budget_max'],
        ['preferredBoard', 'board'],
        ['leadSource', 'source'],
        ['admissionSession', 'admission_session'],
        ['preferredSchoolId', 'preferred_school_id'],
        ['verificationStatus', 'verification_status'],
        ['score', 'lead_score'],
        ['dpdpConsent', 'consent_given'],
        ['returnRemarks', 'return_remarks'],
        ['remarksJson', 'remarks_json'],
        ['historyJson', 'history_json'],
        ['nextFollowUpDate', 'follow_up_date'],
        ['assignedCounsellorId', 'assigned_to'],
        ['assignedManagerId', 'assigned_manager_id'],
        ['teamId', 'team_id'],
        ['verifiedById', 'verified_by_id'],
        ['verifiedAt', 'verified_at'],
        ['createdAt', 'created_at'],
        ['updatedAt', 'updated_at'],
        ['deletedAt', 'deleted_at'],
        ['expiryDay90Action', 'expiry_day90_action'],
        ['expiryExtendedUntil', 'expiry_extended_until'],
        ['expiryStatus', 'expiry_status'],
        ['forceExpired', 'force_expired'],
        ['isMerged', 'is_merged'],
        ['mergedIntoId', 'merged_into_lead_id'],
        ['overrideReason', 'override_reason'],
      ],
    ],
    [
      'lead_remarks',
      [
        ['leadId', 'lead_id'],
        ['userId', 'added_by'],
        ['userName', 'user_name'],
        ['userRole', 'user_role'],
        ['content', 'remark'],
        ['createdAt', 'created_at'],
      ],
    ],
    [
      'schools',
      [
        ['schoolCode', 'school_code'],
        // Order matters! type -> category BEFORE genderType -> type
        ['type', 'category'],
        ['genderType', 'type'],
        ['rank', 'ranking'],
        ['minFeeAnnual', 'fees_min'],
        ['maxFeeAnnual', 'fees_max'],
        ['feesDisplay', 'fees_display'],
        ['defaultCommission', 'company_commission'],
        ['hostelQuality', 'hostel_quality'],
        ['admissionsEmail', 'admissions_email'],
        ['phone', 'contact_person'],
        ['sports', 'facilities'],
        ['isPartner', 'is_partner'],
        ['deletedAt', 'deleted_at'],
        ['createdAt', 'created_at'],
        ['updatedAt', 'updated_at'],
      ],
    ],
    [
      'applications',
      [
        ['admissionNumber', 'app_id'],
        ['receiptNumber', 'receipt_number'],
        ['applicationNumber', 'application_number'],
        ['leadId', 'lead_id'],
        ['schoolId', 'school_id'],
        ['counsellorId', 'counsellor_id'],
        ['managerId', 'manager_id'],
        ['teamId', 'team_id'],
        ['studentName', 'student_name'],
        ['parentName', 'parent_name'],
        ['schoolName', 'school_name'],
        ['admissionClass', 'admission_class'],
        ['academicYear', 'academic_year'],
        ['feeAgreed', 'fee_agreed'],
        ['proofDocument', 'proof_document'],
        ['cancellationReason', 'cancellation_reason'],
        ['cancelledAt', 'cancelled_at'],
        ['commissionGenerated', 'commission_eligible'],
        ['receiptPdfUrl', 'receipt_pdf_url'],
        ['confirmedAt', 'confirmed_at'],
        ['createdAt', 'created_at'],
        ['updatedAt', 'updated_at'],
        ['deletedAt', 'deleted_at'],
        ['subStage', 'sub_stage'],
      ],
    ],
    [
      'commission_ledger',
      [
        ['commissionCode', 'commission_id'],
        ['admissionId', 'app_id'],
        ['leadId', 'lead_id'],
        ['schoolName', 'school_name'],
        ['studentName', 'student_name'],
        ['parentName', 'parent_name'],
        ['beneficiaryId', 'beneficiary_id'],
        ['beneficiaryName', 'beneficiary_name'],
        ['beneficiaryType', 'beneficiary_type'],
        ['beneficiaryRole', 'beneficiary_role'],
        ['teamId', 'team_id'],
        ['amount', 'company_amount'],
        ['ruleVersion', 'rule_version'],
        ['paymentReference', 'payment_reference'],
        ['paymentMode', 'payment_mode'],
        ['paidAt', 'paid_at'],
        ['approvedById', 'approved_by_id'],
        ['approvedAt', 'approved_at'],
        ['isReversal', 'is_reversal'],
        ['parentCommissionId', 'parent_commission_id'],
        ['reversalReason', 'reversal_reason'],
        ['reversedAt', 'reversed_at'],
        ['createdAt', 'created_at'],
        ['updatedAt', 'updated_at'],
        ['deletedAt', 'deleted_at'],
        ['fnfCompletedAt', 'fnf_completed_at'],
        ['fnfPeriodDays', 'fnf_period_days'],
        ['fnfStatus', 'fnf_status'],
      ],
    ],
    [
      'notifications',
      [
        ['userId', 'user_id'],
        ['isRead', 'is_read'],
        ['createdAt', 'created_at'],
      ],
    ],
    [
      'audit_log',
      [
        ['userId', 'user_id'],
        ['userName', 'user_name'],
        ['userRole', 'user_role'],
        ['entityId', 'entity_id'],
        ['ipAddress', 'ip_address'],
        ['isSpecialFlag', 'special_flag'],
        ['createdAt', 'created_at'],
        ['archiveS3Uri', 'archive_s3_uri'],
        ['archivedAt', 'archived_at'],
        ['isArchived', 'is_archived'],
        ['newValue', 'new_value'],
        ['oldValue', 'old_value'],
        ['userAgent', 'user_agent'],
      ],
    ],
    [
      'shortlists',
      [
        ['leadId', 'lead_id'],
        ['schoolId', 'school_id'],
        ['notes', 'note'],
        ['createdAt', 'created_at'],
        ['updatedAt', 'updated_at'],
      ],
    ],
    [
      'matching_criteria_weights',
      [
        ['criteriaKey', 'criteria_key'],
        ['criteriaName', 'criteria_name'],
        ['createdAt', 'created_at'],
        ['updatedAt', 'updated_at'],
      ],
    ],
  ];

  for (const [table, cols] of colMap) {
    for (const [oldCol, newCol] of cols) {
      await renameColIf(table, oldCol, newCol);
    }
  }

  // Deduplicate matching_criteria_weights down to the 8 blueprint criteria (total = 100)
  if (await tableExists('matching_criteria_weights')) {
    await prisma.$executeRawUnsafe(`DELETE FROM matching_criteria_weights`);
    console.log('Cleared duplicate/stale matching_criteria_weights for clean 8-criteria = 100 seed');
  }

  console.log('--- Pre-migration rename complete ---');
  await prisma.$disconnect();
}

run().catch((err) => {
  console.error('Pre-migration failed:', err);
  process.exit(1);
});
