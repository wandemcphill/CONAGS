import { describe, expect, it } from 'vitest';
import { lauremCompany } from '@/lib/laurem-company-config';
import { LAUREM_LETTERHEAD } from '@/lib/laurem-letterhead';
import { renderLauremContract } from '@/lib/laurem-contract';
import { renderLauremInternationalNurseContract } from '@/lib/laurem-international-nurse-contract';
import { validateLauremContractCompleteness, type LauremContractIssueInput } from '@/lib/laurem-contract-validator';

const completeStandard: LauremContractIssueInput = {
  employeeName: 'Example Candidate',
  employeeAddress: '1 Example Street, Glasgow',
  jobTitle: 'Healthcare Assistant',
  startDate: '2027-01-11',
  minimumWeeklyHours: 37.5,
  annualSalary: 32000,
  workLocations: ['Glasgow'],
  noticePeriodEmployee: '4 weeks',
  noticePeriodEmployer: '4 weeks',
  holidayEntitlement: '28 days pro rata',
  pensionScheme: 'The applicable workplace pension scheme',
  contractType: 'standard',
  contractContent: 'Employer: Conags Care Group Limited. Salary: £32,000 per annum.',
};

const completeNurse: LauremContractIssueInput = {
  ...completeStandard,
  jobTitle: 'Registered Nurse',
  contractType: 'international_nurse',
  visaRoute: 'Health and Care Worker visa',
  sponsorshipOccupationCode: '2237',
  nmcStatus: 'NMC registration application in progress',
  registrationDeadline: '31 December 2027',
  preRegistrationSalary: 30000,
  postRegistrationSalary: 35000,
  annualSalary: 35000,
  contractContent: 'Employer: Conags Care Group Limited. Pre-registration salary £30,000 per annum. Post-registration salary £35,000 per annum.',
};

describe('CONAGS contract completeness gate', () => {
  it('allows a complete standard contract with a confirmed annual salary', () => {
    expect(validateLauremContractCompleteness(completeStandard).valid).toBe(true);
  });

  it('rejects missing material particulars and unresolved generated text', () => {
    const result = validateLauremContractCompleteness({
      ...completeStandard,
      employeeAddress: '',
      workLocations: [],
      pensionScheme: '',
      contractContent: 'Salary: As stated in the approved rate card. Employer: Conags Care Ltd.',
    });

    expect(result.valid).toBe(false);
    expect(result.missingFields).toEqual(expect.arrayContaining([
      'employeeAddress',
      'workLocations',
      'pensionScheme',
      'contractContent',
    ]));
    expect(result.errors.some((error) => error.code === 'CONTRACT_PLACEHOLDER_NOT_ALLOWED')).toBe(true);
  });

  it('requires explicit pre/post-registration pay and immigration details for international nurses', () => {
    const result = validateLauremContractCompleteness({
      ...completeNurse,
      preRegistrationSalary: null,
      visaRoute: '',
      nmcStatus: '',
      registrationDeadline: '',
    });

    expect(result.valid).toBe(false);
    expect(result.missingFields).toEqual(expect.arrayContaining([
      'preRegistrationSalary',
      'visaRoute',
      'nmcStatus',
      'registrationDeadline',
    ]));
  });

  it('allows an international nurse contract only when its required particulars are explicit', () => {
    expect(validateLauremContractCompleteness(completeNurse).valid).toBe(true);
  });
});

describe('CONAGS contract legal identity source of truth', () => {
  it('uses the canonical legal name in standard and international contract content', () => {
    const standard = renderLauremContract({
      employeeName: 'Example Candidate',
      employeeAddress: '1 Example Street, Glasgow',
      jobTitle: 'Healthcare Assistant',
      startDate: '2027-01-11',
      minimumWeeklyHours: 37.5,
      annualSalary: 32000,
      workLocations: ['Glasgow'],
      noticePeriodEmployee: '4 weeks',
      noticePeriodEmployer: '4 weeks',
      holidayEntitlement: '28 days',
      pensionScheme: 'The applicable workplace pension scheme',
    });
    const nurse = renderLauremInternationalNurseContract({
      employeeName: 'Example Nurse',
      employeeAddress: '2 Example Street, Glasgow',
      jobTitle: 'Registered Nurse',
      startDate: '2027-01-11',
      annualSalary: 35000,
      postRegistrationSalary: 35000,
      preRegistrationSalary: 30000,
      weeklyHours: 37.5,
      workLocations: ['Glasgow'],
      visaRoute: 'Health and Care Worker visa',
      sponsorshipOccupationCode: '2237',
      nmcStatus: 'NMC registration application in progress',
      registrationDeadline: '31 December 2027',
      holidayEntitlement: '28 days',
      pensionScheme: 'The applicable workplace pension scheme',
      probation: '6 months',
      noticePeriodEmployee: '4 weeks',
      noticePeriodEmployer: '4 weeks',
    });

    for (const content of [standard, nurse]) {
      expect(content).toContain(lauremCompany.legalName);
      expect(content).not.toContain('Conags Care Ltd');
    }
  });

  it('derives the letterhead legal name and document issuer from the company configuration', () => {
    expect(lauremCompany.documentIssuer.employer).toBe(lauremCompany.legalName);
    expect(LAUREM_LETTERHEAD.legalName).toBe(lauremCompany.legalName.toUpperCase());
  });
});
