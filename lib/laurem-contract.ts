import { lauremCompany } from '@/lib/laurem-company-config';
import { lauremEmploymentContract } from '@/lib/laurem-contract-config';
import { calculateThreeYearContractEndDate, formatContractDate } from '@/lib/laurem-contract-dates';

export type ContractInput = {
  employeeName: string;
  employeeAddress?: string | null;
  jobTitle: string;
  startDate?: string | null;
  contractEndDate?: string | null;
  minimumWeeklyHours?: number | null;
  hourlyRate?: number | null;
  annualSalary?: number | null;
  workLocations?: string[];
  clientOrAssignmentDetails?: string | null;
  noticePeriodEmployee?: string | null;
  noticePeriodEmployer?: string | null;
  holidayEntitlement?: string | null;
  pensionScheme?: string | null;
  sponsorshipOccupationCode?: string | null;
  sponsorshipOccupationTitle?: string | null;
};

const value = (input: string | number | null | undefined, fallback = 'As stated in the agreed employment arrangements'): string =>
  input === null || input === undefined || input === '' ? fallback : String(input);

export function renderLauremContract(input: ContractInput): string {
  const locations = input.workLocations?.length ? input.workLocations.join(', ') : `As assigned by ${lauremCompany.legalName}`;
  const calculatedEndDate = calculateThreeYearContractEndDate(input.startDate);
  const startDate = value(input.startDate, 'To be confirmed before issue');
  const endDate = value(input.contractEndDate || calculatedEndDate, calculatedEndDate ? formatContractDate(calculatedEndDate) : 'Not fixed unless stated in the offer');
  const hours = input.minimumWeeklyHours == null ? 'As stated in the offer' : `${input.minimumWeeklyHours} hours per week`;
  const rate = input.hourlyRate != null
    ? `£${input.hourlyRate.toFixed(2)} per hour`
    : input.annualSalary != null
      ? `£${input.annualSalary.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} per annum`
      : 'As stated in the approved rate card';
  const sponsorship = input.sponsorshipOccupationCode
    ? 'Sponsorship occupation code: ' + input.sponsorshipOccupationCode + (input.sponsorshipOccupationTitle ? ' (' + input.sponsorshipOccupationTitle + ')' : '') + '.'
    : '';

  return `CONTRACT OF EMPLOYMENT (GUARANTEED MINIMUM HOURS)\n\nEmployer: ${lauremEmploymentContract.employerName}\nEmployee: ${input.employeeName}\nStart date: ${formatContractDate(startDate)}\n${sponsorship ? sponsorship + '\n' : ''}\n1. COMMENCEMENT OF EMPLOYMENT\nEmployment begins on ${startDate}. Continuous service is calculated from the commencement date stated in this contract. The contract end date, where applicable, is ${endDate}.\n\n2. JOB TITLE AND DESCRIPTION OF WORK\nYour job title is ${input.jobTitle}. You will undertake duties within your competence and as reasonably directed by ${lauremCompany.legalName}. Work may be provided at Conags locations or at client locations as part of an assignment.\n\n3. DURATION\nThis agreement continues subject to the termination provisions in this contract and any fixed end date expressly stated above.\n\n4. DAYS AND HOURS OF WORK\nYour guaranteed minimum hours are ${hours}. Working patterns may include different days, shifts and locations according to operational requirements and your agreed availability.\n\n5. PLACE OF WORK\nYour principal work locations are ${locations}. Your duties may require attendance at client homes, premises or other approved locations.\n\n6. EMPLOYEE OBLIGATIONS\nYou must comply with reasonable instructions, safeguarding requirements, health and safety procedures, confidentiality requirements, professional standards applicable to your role, right-to-work requirements and all mandatory checks and training.\n\n7. RATES OF PAY\nYour basic rate is ${rate}, subject to lawful deductions. Approved expenses will be reimbursed in accordance with Conags policies and any assignment-specific arrangements.\n\n8. HOLIDAYS\nAnnual leave will be provided in accordance with statutory requirements and Conags' holiday procedures. ${value(input.holidayEntitlement, 'The applicable statutory/pro-rated entitlement will be calculated for your employment')}.\n\n9. ABSENCE AND ILLNESS\nYou must notify Conags as soon as reasonably practicable when you cannot attend scheduled work and follow the sickness and absence procedure.\n\n10. SICK PAY\nStatutory sick pay and any contractual sick pay entitlement will apply where the relevant eligibility conditions are met.\n\n11. PENSION\nConags will comply with applicable workplace pension duties. ${value(input.pensionScheme, 'Details of the applicable pension arrangement will be provided separately')}.\n\n12. TERMINATION AND SUSPENSION\nNotice requirements will be ${value(input.noticePeriodEmployee, 'as stated in the approved terms')}. The employer notice period is ${value(input.noticePeriodEmployer, 'as stated in the approved terms')}. Conags may suspend duties where reasonably necessary and may terminate employment in accordance with this contract and applicable law.\n\n13. INTELLECTUAL PROPERTY RIGHTS\nWork product created in the course of your employment for Conags or its clients belongs to Conags or the relevant rights holder to the extent permitted by law.\n\n14. COLLECTIVE AGREEMENT\nNo collective agreement directly affects this contract unless expressly notified to you.\n\n15. CONFIDENTIALITY\nYou must protect confidential information belonging to Conags, its clients, service users, colleagues and business partners during and after employment.\n\n16. TRAINING\nYou must maintain the skills required for your role and complete mandatory training and reasonable work-related training identified by Conags.\n\n17. HEALTH AND SAFETY\nYou must take reasonable steps to protect your own health and safety and that of service users, colleagues and other persons affected by your work.\n\n18. STAFF HANDBOOK\nYou must comply with applicable Conags policies and the Staff Handbook. Unless expressly stated otherwise, the Staff Handbook does not form part of the contractual terms.\n\n19. PERSONAL DETAILS AND VETTING\nYou must keep personal details current and cooperate with right-to-work, DBS/PVG, safeguarding, professional registration and other lawful vetting processes applicable to your role.\n\n20. USE OF INFORMATION ABOUT YOU\nConags may process personal data for employment, payroll, workforce management, safeguarding, legal compliance and related legitimate purposes in accordance with its privacy documentation.\n\n21. RESTRICTIVE COVENANTS\nAny reasonable post-termination restrictions expressly included in the approved contract will apply to the extent permitted by law.\n\n22. INSURANCE, IDENTITY CARD AND UNIFORM\nWhere required for your role, you must maintain appropriate insurance and carry/use Conags identification and uniform in accordance with company policy.\n\n23. DISCIPLINARY AND GRIEVANCE PROCEDURE\nYou must follow Conags' disciplinary and grievance procedures as communicated to you.\n\n24. CHANGES IN TERMS AND CONDITIONS\nConags may make reasonable changes to policies and operational arrangements. Material contractual changes will be communicated in accordance with applicable requirements.\n\n25. MISCELLANEOUS\nThis contract together with expressly incorporated documents constitutes the employment agreement between ${lauremCompany.legalName} and you.\n\nAssignment information: ${value(input.clientOrAssignmentDetails, 'Assignments will be notified separately through the Conags workforce platform.')}.\n\nEMPLOYER AUTHORITY\nFor and on behalf of ${lauremCompany.legalName}\nName: Dezou Maurice\nTitle: Manager\n\nEMPLOYEE ACCEPTANCE\nI confirm that I have read and understood this contract and agree to its terms.\n\nEmployee name: ${input.employeeName}\nEmployee address: ${value(input.employeeAddress, 'To be completed') }\nEmployee acceptance: To be completed electronically\nDate accepted: To be recorded by the Conags platform\n`;
}
