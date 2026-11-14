import {
  IsNumber,
  IsString,
  IsNotEmpty,
  Validate,
  IsOptional,
  MaxLength,
  MinLength,
  IsEnum,
  IsBoolean,
  IsArray,
} from 'class-validator';
import { SumEquals100Constraint } from '../validators/sum-equals-100.validator';

// FEATURE 1: Lead Scoring Configuration DTO (5 factors, sum === 100)
export class LeadScoringWeightsDto {
  @IsNumber()
  budgetFit: number;

  @IsNumber()
  parentEngagement: number;

  @IsNumber()
  locationPreference: number;

  @IsNumber()
  academicReadiness: number;

  @IsNumber()
  decisionTimeline: number;

  @Validate(SumEquals100Constraint)
  weightsValidator?: any;
}

// FEATURE 2: School Matching Criteria Configuration DTO (8 criteria, sum === 100)
export class MatchingCriteriaItemDto {
  @IsString()
  @IsNotEmpty()
  criteriaKey: string;

  @IsString()
  @IsNotEmpty()
  criteriaName: string;

  @IsNumber()
  weight: number;

  @IsOptional()
  @IsString()
  description?: string;
}

export class MatchingCriteriaWeightsDto {
  @IsArray()
  items: MatchingCriteriaItemDto[];
}

// FEATURE 4: Reopen Lead DTO
export class ReopenLeadDto {
  @IsOptional()
  @IsString()
  reason?: string;
}

// FEATURE 5: Optimistic Lock Edit DTO
export class OptimisticEditDto {
  @IsOptional()
  @IsNumber()
  version?: number;
}

// FEATURE 6: Duplicate Merge DTO
export class LeadMergeDto {
  @IsString()
  @IsNotEmpty()
  primaryLeadId: string;

  @IsString()
  @IsNotEmpty()
  secondaryLeadId: string;

  @IsOptional()
  @IsString()
  mergeReason?: string;

  @IsOptional()
  @IsString()
  reason?: string;
}

// FEATURE 8: Duplicate Check & Manager Override DTO
export class DuplicateCheckWithOverrideDto {
  @IsString()
  @IsNotEmpty()
  parentPhone: string;

  @IsString()
  @IsNotEmpty()
  studentName: string;

  @IsString()
  @IsNotEmpty()
  admissionClass: string;

  @IsOptional()
  @IsBoolean()
  overrideDuplicate?: boolean;

  @IsOptional()
  @IsString()
  overrideReason?: string;
}

// FEATURE 16: Activity Confirmation DTO
export class ActivityConfirmationDto {
  @IsOptional()
  @IsString()
  activityType?: 'PHONE_CALL' | 'WHATSAPP';

  @IsOptional()
  @IsString()
  type?: 'PHONE_CALL' | 'WHATSAPP';

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  outcome?: string;
}

export class ActivityOutcomeSubmitDto {
  @IsString()
  @IsNotEmpty()
  outcome: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

// FEATURE 18: Commission Reversal DTO
export class CommissionReversalDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(5, { message: 'Reversal reason must be at least 5 characters long and provide explicit audit justification.' })
  reversalReason: string;
}

// FEATURE 20: WhatsApp Message DTO (max 2000 chars, url < 4000)
export class SendWhatsAppMessageDto {
  @IsString()
  @IsNotEmpty()
  recipient: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(2000, { message: 'WhatsApp message content exceeds maximum allowable length of 2000 characters.' })
  content: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000, { message: 'Action URL must remain under 4000 characters.' })
  actionUrl?: string;

  @IsOptional()
  @IsString()
  templateKey?: string;

  @IsOptional()
  @IsString()
  leadId?: string;
}

// FEATURE 21: Bulk Import DTO
export class BulkImportRequestDto {
  @IsEnum(['strict', 'lenient'], { message: "Import mode must be either 'strict' or 'lenient'." })
  mode: 'strict' | 'lenient';

  @IsEnum(['leads', 'schools', 'templates'], { message: "Entity must be 'leads', 'schools', or 'templates'." })
  entity: 'leads' | 'schools' | 'templates';
}
