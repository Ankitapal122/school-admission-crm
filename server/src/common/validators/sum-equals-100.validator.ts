import {
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
} from 'class-validator';

@ValidatorConstraint({ name: 'sumEquals100', async: false })
export class SumEquals100Constraint implements ValidatorConstraintInterface {
  validate(weights: Record<string, number> | number[], args: ValidationArguments) {
    if (!weights) return false;
    let sum = 0;
    if (Array.isArray(weights)) {
      sum = weights.reduce((acc, curr) => acc + (Number(curr) || 0), 0);
    } else if (typeof weights === 'object') {
      sum = Object.values(weights).reduce((acc, curr) => acc + (Number(curr) || 0), 0);
    }
    return sum === 100;
  }

  defaultMessage(args: ValidationArguments) {
    return 'The sum of all configured weights must equal exactly 100%. Neither 99% nor 101% is acceptable.';
  }
}

/**
 * Normalizes an Indian mobile number to the strict +91XXXXXXXXXX format.
 * - Removes leading 0
 * - Removes spaces, dashes, brackets
 * - Adds +91 country code if missing
 * - Validates that the number consists of 10 digits starting with 6, 7, 8, or 9
 */
export function normalizeIndianMobile(raw: string): string {
  if (!raw) {
    throw new Error('Mobile number is required.');
  }

  // Remove all non-digit characters except leading +
  let cleaned = raw.trim().replace(/[\s\-\(\)\.]/g, '');

  if (cleaned.startsWith('+91')) {
    cleaned = cleaned.substring(3);
  } else if (cleaned.startsWith('91') && cleaned.length === 12) {
    cleaned = cleaned.substring(2);
  } else if (cleaned.startsWith('0') && cleaned.length === 11) {
    cleaned = cleaned.substring(1);
  }

  // Must be 10 digits starting with 6, 7, 8, or 9
  if (!/^[6-9]\d{9}$/.test(cleaned)) {
    throw new Error(
      `Invalid Indian mobile number '${raw}'. Must be a valid 10-digit number starting with 6, 7, 8, or 9.`
    );
  }

  return `+91${cleaned}`;
}

/**
 * Normalizes student name for duplicate comparison:
 * - lowercase
 * - trim extra spaces
 * - remove special characters
 */
export function normalizeStudentName(name: string): string {
  if (!name) return '';
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}
