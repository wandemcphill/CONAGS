export type CandidatePathway = 'uk' | 'international';

export type RecruitmentStatus =
  | 'Enquiry'
  | 'Invited'
  | 'Application'
  | 'Screening'
  | 'Interview'
  | 'Second Interview'
  | 'Documents'
  | 'Sponsorship'
  | 'Offer'
  | 'Onboarding'
  | 'Hired'
  | 'Rejected'
  | 'Withdrawn';

export type JobCategory = 'Nursing' | 'Care' | 'Support' | 'Administration' | 'Other';

export type JobVisaSponsorship = 'none' | 'in-country-switch-only' | 'overseas-and-in-country';

export type Job = {
  id: string;
  title: string;
  category: JobCategory;
  locations: string[];
  pathway: CandidatePathway[];
  sponsorshipAvailable: boolean;
  visaSponsorship: JobVisaSponsorship;
  active: boolean;
  summary: string;
  description: string;
  essentialCriteria: string[];
};

export type CandidateDraft = {
  pathway: CandidatePathway;
  roleApplied: string;
  preferredLocation: string;
  personal: {
    firstName: string;
    surname: string;
    otherNames: string;
    email: string;
    phone: string;
    dateOfBirth: string;
    nationality: string;
    gender: string;
    maritalStatus: string;
    currentAddress: string;
    postcode: string;
  };
  availability: {
    fullTime: boolean;
    partTime: boolean;
    days: boolean;
    nights: boolean;
    weekends: boolean;
    drivingLicence: string;
    vehicleAccess: string;
  };
  registration: {
    nmcNumber: string;
    rcnNumber: string;
    band: string;
    otherRegistration: string;
  };
  training: Record<string, boolean>;
  references: Array<{
    name: string;
    position: string;
    organisation: string;
    email: string;
    telephone: string;
  }>;
  education: Array<{
    institution: string;
    qualification: string;
    from: string;
    to: string;
  }>;
  employment: Array<{
    employer: string;
    jobTitle: string;
    from: string;
    to: string;
    responsibilities: string;
    reasonForLeaving: string;
  }>;
  gaps: Array<{ from: string; to: string; reason: string }>;
  declarations: {
    informationAccurate: boolean;
    confidentiality: boolean;
    dataProcessingConsent: boolean;
  };
  rightToWork: {
    status: string;
    documentsAvailable: boolean;
  };
  international?: {
    currentCountry: string;
    relocationReady: boolean;
    dependants: boolean;
    dependantCount: number;
    ukFamily: string;
    previousUkImmigration: string;
    passportNumber: string;
    passportExpiry: string;
    visaHistory: string;
    accommodationPlan: string;
  };
};
