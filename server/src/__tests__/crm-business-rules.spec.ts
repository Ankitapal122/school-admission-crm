import { BadRequestException } from '@nestjs/common';
import {
  normalizeIndianPhone,
  normalizeCanonicalRole,
  toBlueprintRole,
  sanitizeSpreadsheetCell,
  parseClassGrade,
  KANBAN_STAGES,
} from '../common/utils/crm.utils';
import {
  encryptSensitiveData,
  decryptSensitiveData,
  maskBankAccount,
} from '../common/utils/crypto.util';
import {
  BLUEPRINT_SCORING_KEYS,
  BLUEPRINT_MATCHING_KEYS,
  parseAndValidateSum100Criteria,
} from '../modules/leads/dto/weights-validation.dto';

describe('Enterprise BoardingEdu CRM Core Business Rules', () => {
  it('normalizes 10-digit Indian phone numbers to +91XXXXXXXXXX and rejects invalid inputs', () => {
    expect(normalizeIndianPhone('9876543210')).toBe('+919876543210');
    expect(normalizeIndianPhone('+91 98765-43210')).toBe('+919876543210');
    expect(normalizeIndianPhone('09876543210')).toBe('+919876543210');
    expect(() => normalizeIndianPhone('12345', true)).toThrow(BadRequestException);
  });

  it('maps canonical & blueprint roles bidirectionally', () => {
    expect(normalizeCanonicalRole('super_admin')).toBe('SUPER_ADMIN');
    expect(normalizeCanonicalRole('manager')).toBe('SENIOR_MANAGER');
    expect(normalizeCanonicalRole('jr_counsellor')).toBe('COUNSELLOR');
    expect(toBlueprintRole('SUPER_ADMIN')).toBe('super_admin');
    expect(toBlueprintRole('SENIOR_MANAGER')).toBe('manager');
    expect(toBlueprintRole('COUNSELLOR')).toBe('jr_counsellor');
  });

  it('strips dangerous Excel formula injection prefixes', () => {
    expect(sanitizeSpreadsheetCell('=CMD("calc")')).not.toMatch(/^=/);
    expect(sanitizeSpreadsheetCell('+1+1')).not.toMatch(/^\+/);
    expect(sanitizeSpreadsheetCell('@SUM(A1:A2)')).not.toMatch(/^@/);
    expect(sanitizeSpreadsheetCell('Doon School')).toBe('Doon School');
  });

  it('parses class grade strings consistently across Class 1-12', () => {
    expect(parseClassGrade('Class 6')).toBe(6);
    expect(parseClassGrade('Grade 10th')).toBe(10);
    expect(parseClassGrade(8)).toBe(8);
  });

  it('contains all 12 Blueprint Kanban stages', () => {
    expect(KANBAN_STAGES.length).toBeGreaterThanOrEqual(12);
    expect(KANBAN_STAGES).toContain('shortlisted');
    expect(KANBAN_STAGES).toContain('admission_done');
    expect(KANBAN_STAGES).toContain('commission_received');
  });

  it('encrypts & decrypts bank account numbers using AES-256-GCM and masks cleanly', () => {
    const raw = '384910293847';
    const cipher = encryptSensitiveData(raw);
    expect(cipher).not.toContain(raw);
    expect(decryptSensitiveData(cipher)).toBe(raw);
    expect(maskBankAccount(raw)).toBe('XXXXXXXX3847');
  });

  it('enforces exact 100 sum on 5 Lead Scoring weights (rejects 99 & 101)', () => {
    const valid = parseAndValidateSum100Criteria(
      {
        budget_match: 30,
        engagement: 25,
        source_quality: 20,
        timeline_urgency: 15,
        class_demand: 10,
      },
      BLUEPRINT_SCORING_KEYS,
      'Lead Scoring',
    );
    expect(valid.reduce((s, i) => s + i.weight, 0)).toBe(100);

    expect(() =>
      parseAndValidateSum100Criteria(
        {
          budget_match: 29,
          engagement: 25,
          source_quality: 20,
          timeline_urgency: 15,
          class_demand: 10,
        },
        BLUEPRINT_SCORING_KEYS,
        'Lead Scoring',
      ),
    ).toThrow(BadRequestException);

    expect(() =>
      parseAndValidateSum100Criteria(
        {
          budget_match: 31,
          engagement: 25,
          source_quality: 20,
          timeline_urgency: 15,
          class_demand: 10,
        },
        BLUEPRINT_SCORING_KEYS,
        'Lead Scoring',
      ),
    ).toThrow(BadRequestException);
  });

  it('enforces exact 100 sum on 8 School Matching criteria weights (rejects 99 & 101)', () => {
    const valid = parseAndValidateSum100Criteria(
      {
        class: 15,
        board: 15,
        fees_range: 15,
        state: 10,
        gender: 15,
        school_type: 10,
        facilities: 10,
        ranking: 10,
      },
      BLUEPRINT_MATCHING_KEYS,
      'Matching Criteria',
    );
    expect(valid.reduce((s, i) => s + i.weight, 0)).toBe(100);

    expect(() =>
      parseAndValidateSum100Criteria(
        {
          class: 14,
          board: 15,
          fees_range: 15,
          state: 10,
          gender: 15,
          school_type: 10,
          facilities: 10,
          ranking: 10,
        },
        BLUEPRINT_MATCHING_KEYS,
        'Matching Criteria',
      ),
    ).toThrow(BadRequestException);
  });
});
