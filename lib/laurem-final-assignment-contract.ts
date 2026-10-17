import { formatContractDate } from '@/lib/laurem-contract-dates';
import { lauremCompany } from '@/lib/laurem-company-config';

export type FinalAssignmentContractInput = {
  employeeName: string;
  employeeAddress?: string | null;
  jobTitle: string;
  effectiveFrom: string;
  weeklyHours: number;
  hourlyRate: number;
  principalWorkLocation: string;
  trainingLocation?: string | null;
  version: number;
};

const value = (input: string | null | undefined, fallback: string) =>
  input && input.trim() ? input.trim() : fallback;

export function renderLauremFinalAssignmentContract(input: FinalAssignmentContractInput): string {
  const trainingLocation = value(input.trainingLocation, 'As scheduled by CONAGS');
  const address = value(input.employeeAddress, 'As recorded in the Staff Portal');

  return [
    'FINAL ASSIGNMENT-SPECIFIC CONTRACT',
    'Version ' + input.version,
    '',
    'Employer: ' + lauremCompany.legalName,
    'Employee: ' + input.employeeName,
    'Job title: ' + input.jobTitle,
    'Effective from: ' + formatContractDate(input.effectiveFrom),
    'Principal work location: ' + input.principalWorkLocation,
    'Mandatory training location: ' + trainingLocation,
    '',
    '1. PURPOSE OF THIS DOCUMENT',
    "This document records the assignment-specific employment terms confirmed by CONAGS following completion of the staff onboarding and placement process. It is issued alongside, and does not erase, the employee's original employment agreement and accepted onboarding documents.",
    '',
    '2. PAY',
    'The employee\'s basic rate for the confirmed assignment is £' + input.hourlyRate.toFixed(2) + ' per hour.',
    'Guaranteed minimum contracted hours are ' + input.weeklyHours.toFixed(2) + ' hours per week.',
    'Any overtime, enhanced rates, allowances or other additional payments are payable only where applicable under CONAGS policy, the relevant assignment arrangements and approved payroll records.',
    '',
    '3. PRINCIPAL WORK LOCATION',
    'The employee\'s principal work location for this assignment is:',
    input.principalWorkLocation,
    'CONAGS provides care services across client homes, care settings and other approved locations. Operationally required temporary assignments or changes of client location may occur, including during the initial placement period, before a longer-term posting is confirmed. Any material change to contractual terms will be communicated in accordance with the applicable employment arrangements.',
    '',
    '4. TRAINING',
    'The employee\'s mandatory training location is ' + trainingLocation + '. Training dates are scheduled separately through the CONAGS Staff Portal.',
    '',
    '5. ASSIGNMENT AND PLACEMENT',
    'The confirmed location and rate above reflect the placement available to the employee at the effective date. The employee\'s preferences submitted through the Staff Portal are considered alongside service demand, available contracts, role requirements and operational capacity. A preferred location is not itself a guarantee of a particular client or assignment.',
    '',
    '6. EXISTING EMPLOYMENT TERMS',
    "All other employment terms remain governed by the original employment agreement, applicable handbook and policies, except where this document expressly records a current assignment-specific term.",
    '',
    '7. EMPLOYER AUTHORITY',
    'For and on behalf of ' + lauremCompany.legalName,
    'Name: ' + lauremCompany.documentIssuer.name,
    'Title: ' + lauremCompany.documentIssuer.title,
    '',
    'EMPLOYEE ACCEPTANCE',
    'I confirm that I have read this final assignment-specific contract, understand the pay and principal work location stated above, and agree to the terms recorded in this document.',
    '',
    'Employee name: ' + input.employeeName,
    'Employee address: ' + address,
    'Employee acceptance: To be completed electronically',
    'Date accepted: To be recorded by the CONAGS platform',
  ].join('\n');
}