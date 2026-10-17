import { lauremCompany } from '@/lib/laurem-company-config';

export const lauremEmploymentContract = {
  title: 'Contract of Employment (Guaranteed Minimum Hours)',
  employerName: lauremCompany.legalName,
  platformName: 'Conags Recruitment & Workforce Platform',
  sections: [
    'Commencement of Employment',
    'Job Title and Description of Work',
    'Duration',
    'Days and Hours of Work',
    'Place of Work',
    'Employee Obligations',
    'Rates of Pay',
    'Holidays',
    'Absence and Illness',
    'Sick Pay',
    'Pension',
    'Termination and Suspension',
    'Intellectual Property Rights',
    'Collective Agreement',
    'Confidentiality',
    'Training',
    'Health and Safety',
    'Staff Handbook',
    'Personal Details and Vetting',
    'Use of Information About You',
    'Restrictive Covenants',
    'Insurance, Identity Card and Uniform',
    'Disciplinary and Grievance Procedure',
    'Changes in Terms and Conditions of Employment',
    'Miscellaneous',
  ] as const,
  variables: [
    'employeeName',
    'employeeAddress',
    'jobTitle',
    'startDate',
    'contractEndDate',
    'minimumWeeklyHours',
    'hourlyRate',
    'workLocations',
    'clientOrAssignmentDetails',
    'noticePeriodEmployee',
    'noticePeriodEmployer',
    'holidayEntitlement',
    'pensionScheme',
    'sponsorshipOccupationCode',
    'sponsorshipOccupationTitle',
  ] as const,
} as const;

export type LauremContractVariable = (typeof lauremEmploymentContract.variables)[number];

export function getLauremContractVariableNames(): readonly string[] {
  return lauremEmploymentContract.variables;
}
