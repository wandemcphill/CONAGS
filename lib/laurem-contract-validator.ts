export type LauremContractIssueInput = {
  employeeName?: string | null;
  employeeAddress?: string | null;
  jobTitle?: string | null;
  startDate?: string | null;
  minimumWeeklyHours?: number | null;
  weeklyHours?: number | null;
  hourlyRate?: number | null;
  annualSalary?: number | null;
  workLocations?: string[] | null;
  noticePeriodEmployee?: string | null;
  noticePeriodEmployer?: string | null;
  holidayEntitlement?: string | null;
  pensionScheme?: string | null;
  contractType?: string | null;
  visaRoute?: string | null;
  sponsorshipOccupationCode?: string | null;
  nmcStatus?: string | null;
  registrationDeadline?: string | null;
  preRegistrationSalary?: number | null;
  postRegistrationSalary?: number | null;
  repayableCosts?: string | null;
  repaymentSchedule?: string | null;
  contractContent?: string | null;
};

export type LauremContractValidationError = {
  code: string;
  field: string;
  message: string;
};

export type LauremContractValidationResult = {
  valid: boolean;
  errors: LauremContractValidationError[];
  missingFields: string[];
};

// These are rendered fallback phrases, not contractually agreed particulars.
const UNRESOLVED_CONTRACT_TEXT = [
  'to be confirmed before issue',
  'as stated in the offer',
  'as stated in the approved terms',
  'as stated in the approved rate card',
  'details of the applicable pension arrangement will be provided separately',
  'the applicable statutory/pro-rated entitlement will be calculated for your employment',
  'the salary stated in the signed offer',
  'the salary confirmed in the signed offer',
  'employee address: to be completed',
  'conags care ltd',
] as const;

function blank(value: string | number | null | undefined): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === 'number') return !Number.isFinite(value);
  return value.trim().length === 0;
}

function positive(value: number | null | undefined): boolean {
  return value !== null && value !== undefined && Number.isFinite(value) && value > 0;
}

export function validateLauremContractCompleteness(
  input: LauremContractIssueInput
): LauremContractValidationResult {
  const errors: LauremContractValidationError[] = [];
  const missingFields = new Set<string>();

  const requireText = (value: string | number | null | undefined, field: string, message: string) => {
    if (blank(value)) {
      errors.push({ code: 'CONTRACT_FIELD_REQUIRED', field, message });
      missingFields.add(field);
    }
  };

  const requirePositive = (value: number | null | undefined, field: string, message: string) => {
    if (!positive(value)) {
      errors.push({ code: 'CONTRACT_FIELD_REQUIRED', field, message });
      missingFields.add(field);
    }
  };

  requireText(input.employeeName, 'employeeName', 'Employee name is required.');
  requireText(input.employeeAddress, 'employeeAddress', 'Employee address is required.');
  requireText(input.jobTitle, 'jobTitle', 'Job title is required.');
  requireText(input.startDate, 'startDate', 'Contract start date is required.');

  if (input.contractType === 'international_nurse') {
    requirePositive(input.preRegistrationSalary, 'preRegistrationSalary', 'The exact pre-registration salary is required.');
    requirePositive(input.postRegistrationSalary ?? input.annualSalary, 'postRegistrationSalary', 'The exact post-registration salary is required.');
    requireText(input.visaRoute, 'visaRoute', 'The intended lawful immigration route must be specified.');
    requireText(input.sponsorshipOccupationCode, 'sponsorshipOccupationCode', 'The sponsored occupation code is required.');
    requireText(input.nmcStatus, 'nmcStatus', 'NMC registration status and arrangements are required.');
    requireText(input.registrationDeadline, 'registrationDeadline', 'The expected NMC registration deadline is required.');
    if (!blank(input.repayableCosts) && blank(input.repaymentSchedule)) {
      errors.push({
        code: 'CONTRACT_REPAYMENT_TERMS_REQUIRED',
        field: 'repaymentSchedule',
        message: 'An itemised repayment schedule is required when repayable costs are recorded.',
      });
      missingFields.add('repaymentSchedule');
    }
  } else if (!positive(input.hourlyRate) && !positive(input.annualSalary)) {
    errors.push({
      code: 'CONTRACT_PAY_RATE_REQUIRED',
      field: 'hourlyRate',
      message: 'A positive hourly rate or annual salary is required.',
    });
    missingFields.add('hourlyRate');
  }

  requirePositive(input.minimumWeeklyHours ?? input.weeklyHours, 'minimumWeeklyHours', 'Guaranteed weekly hours must be greater than zero.');

  if (!input.workLocations || input.workLocations.length === 0 || input.workLocations.some((location) => blank(location))) {
    errors.push({
      code: 'CONTRACT_WORK_LOCATIONS_REQUIRED',
      field: 'workLocations',
      message: 'At least one confirmed work location is required.',
    });
    missingFields.add('workLocations');
  }

  requireText(input.holidayEntitlement, 'holidayEntitlement', 'Holiday entitlement must be specified.');
  requireText(input.noticePeriodEmployee, 'noticePeriodEmployee', 'The employee notice period must be specified.');
  requireText(input.noticePeriodEmployer, 'noticePeriodEmployer', 'The employer notice period must be specified.');
  requireText(input.pensionScheme, 'pensionScheme', 'The applicable pension arrangements must be specified.');

  const contractText = input.contractContent?.toLowerCase() || '';
  for (const phrase of UNRESOLVED_CONTRACT_TEXT) {
    if (contractText.includes(phrase)) {
      errors.push({
        code: 'CONTRACT_PLACEHOLDER_NOT_ALLOWED',
        field: 'contractContent',
        message: 'The generated contract still contains an unresolved placeholder or legacy company identity.',
      });
      missingFields.add('contractContent');
      break;
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    missingFields: [...missingFields],
  };
}
