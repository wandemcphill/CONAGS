export type SponsorRegisterMatch = {
  organisationName: string;
  townCity: string;
  county: string;
  typeAndRating: string;
  route: string;
};

const HOME_OFFICE_REGISTER_PAGE =
  'https://www.gov.uk/government/publications/register-of-licensed-sponsors-workers';
const CQC_HOME =
  'https://www.cqc.org.uk/';
const CQC_SEARCH =
  'https://www.cqc.org.uk/search?query=Conags%20Care%20Group%20Limited';
const CARE_INSPECTORATE_LIST =
  'https://www.careinspectorate.com/careservicelist.php';
const CARE_INSPECTORATE_REPORT =
  'https://www.careinspectorate.com/berengCareservices/html/reports/getPdfBlob.php?id=324009';
const CARE_INSPECTORATE_FOLLOW_UP =
  'https://www.careinspectorate.com/berengCareservices/html/reports/getPdfBlob.php?id=322326';
const SPONSOR_REGISTER_TARGET = 'CONAGS CARE GROUP LIMITED';

function normalise(value: unknown) {
  return String(value ?? '').trim().toLowerCase().replace(/&amp;/g, '&');
}

function csvLineToFields(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let quoted = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    const next = line[i + 1];
    if (ch === '"') {
      if (quoted && next === '"') {
        current += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
    } else if (ch === ',' && !quoted) {
      fields.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }

  fields.push(current.trim());
  return fields;
}

function splitCsvRows(csv: string): string[] {
  const rows: string[] = [];
  let start = 0;
  let quoted = false;

  for (let i = 0; i < csv.length; i += 1) {
    const ch = csv[i];
    const next = csv[i + 1];

    if (ch === '"') {
      if (quoted && next === '"') {
        i += 1;
      } else {
        quoted = !quoted;
      }
    } else if ((ch === '\n' || ch === '\r') && !quoted) {
      if (ch === '\r' && next === '\n') i += 1;
      rows.push(csv.slice(start, i));
      start = i + 1;
    }
  }

  if (start < csv.length) rows.push(csv.slice(start));
  return rows.filter(Boolean);
}

function getField(row: Record<string, string>, names: string[]) {
  const wanted = names.map((name) => normalise(name));
  const key = Object.keys(row).find((candidate) => wanted.includes(normalise(candidate)));
  return key ? row[key] : '';
}

export async function fetchHomeOfficeSponsorRegister(): Promise<{
  checkedAt: string;
  registerPage: string;
  csvSource: string | null;
  matches: SponsorRegisterMatch[];
  error?: string;
}> {
  const checkedAt = new Date().toISOString();

  try {
    const pageResponse = await fetch(HOME_OFFICE_REGISTER_PAGE, {
      next: { revalidate: 3600 },
      headers: { 'user-agent': 'CONAGS Staff Portal compliance verifier' },
    });
    if (!pageResponse.ok) throw new Error(`Home Office register page returned ${pageResponse.status}`);

    const html = await pageResponse.text();
    const csvMatch = html.match(/https?:\/\/assets\.publishing\.service\.gov\.uk\/[^"'\s<>]+?\.csv/);
    const relativeCsvMatch = html.match(/\/media\/[^"'\s<>]+?\.csv/);
    const csvSource = csvMatch?.[0]
      || (relativeCsvMatch ? new URL(relativeCsvMatch[0], 'https://www.gov.uk').toString() : null);

    if (!csvSource) throw new Error('No CSV download link was found on the Home Office register page.');

    const csvResponse = await fetch(csvSource, {
      next: { revalidate: 3600 },
      headers: { 'user-agent': 'CONAGS Staff Portal compliance verifier' },
    });
    if (!csvResponse.ok) throw new Error(`Home Office register CSV returned ${csvResponse.status}`);

    const csv = await csvResponse.text();
    const rows = splitCsvRows(csv);
    if (!rows.length) throw new Error('Home Office register CSV was empty.');

    const headers = csvLineToFields(rows[0]);
    const matches: SponsorRegisterMatch[] = [];

    for (const line of rows.slice(1)) {
      const values = csvLineToFields(line);
      if (values.length !== headers.length) continue;
      const record = Object.fromEntries(headers.map((header, index) => [header, values[index] || '']));
      const organisationName = getField(record, ['Organisation Name', 'OrganisationName', 'Sponsor Name']);
      if (normalise(organisationName) !== normalise(SPONSOR_REGISTER_TARGET)) continue;

      matches.push({
        organisationName,
        townCity: getField(record, ['Town/City', 'Town/City ', 'Town']),
        county: getField(record, ['County']),
        typeAndRating: getField(record, ['Type & Rating', 'Type and Rating', 'Rating']),
        route: getField(record, ['Route', 'Visa Route']),
      });
    }

    return { checkedAt, registerPage: HOME_OFFICE_REGISTER_PAGE, csvSource, matches };
  } catch (error) {
    return {
      checkedAt,
      registerPage: HOME_OFFICE_REGISTER_PAGE,
      csvSource: null,
      matches: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function fetchCareInspectorateRegistration(): Promise<{
  checkedAt: string;
  liveRegistryConfirmed: boolean;
  registryUrl: string;
  details: {
    serviceName: string;
    providerName: string;
    providerNumber: string;
    serviceNumber: string;
    address: string;
  };
  error?: string;
}> {
  const checkedAt = new Date().toISOString();

  try {
    const response = await fetch(CARE_INSPECTORATE_LIST, {
      next: { revalidate: 21600 },
      headers: { 'user-agent': 'CONAGS Staff Portal compliance verifier' },
    });
    if (!response.ok) throw new Error(`Care Inspectorate registry returned ${response.status}`);
    const body = await response.text();
    const liveRegistryConfirmed =
      body.includes('CS2014333774') && body.toLowerCase().includes('laurem care group limited');

    return {
      checkedAt,
      liveRegistryConfirmed,
      registryUrl: CARE_INSPECTORATE_LIST,
      details: {
        serviceName: 'Parkhouse Manor Care Home',
        providerName: 'Conags Care Group Limited',
        providerNumber: 'SP2014012402',
        serviceNumber: 'CS2014333774',
        address: '557 Parkhouse Road, Barrhead, Glasgow, G78 1TE',
      },
    };
  } catch (error) {
    return {
      checkedAt,
      liveRegistryConfirmed: false,
      registryUrl: CARE_INSPECTORATE_LIST,
      details: {
        serviceName: 'Parkhouse Manor Care Home',
        providerName: 'Conags Care Group Limited',
        providerNumber: 'SP2014012402',
        serviceNumber: 'CS2014333774',
        address: '557 Parkhouse Road, Barrhead, Glasgow, G78 1TE',
      },
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function fetchLauremAssuranceSnapshot() {
  const [sponsor, scotland] = await Promise.all([
    fetchHomeOfficeSponsorRegister(),
    fetchCareInspectorateRegistration(),
  ]);

  return {
    generatedAt: new Date().toISOString(),
    company: {
      legalName: 'Conags Care Group Limited',
      companyNumber: 'SC490520',
      registeredOffice: '557 Parkhouse Road, Barrhead, Glasgow, G78 1TE',
      companiesHouseUrl: 'https://find-and-update.company-information.service.gov.uk/company/SC490520',
    },
    cqc: {
      regulator: 'Care Quality Commission',
      jurisdiction: 'England',
      searchUrl: CQC_SEARCH,
      homeUrl: CQC_HOME,
      status: 'manual_verification_required' as const,
      summary:
        'The Staff Portal does not treat the absence of a discovered CQC profile as proof that no registration exists. Use the official CQC search for England registrations and verify the exact legal entity/service before an England care placement is sponsored.',
      pendingActions: [],
      history: [],
    },
    careInspectorate: {
      regulator: 'Care Inspectorate',
      jurisdiction: 'Scotland',
      registryUrl: scotland.registryUrl,
      reportUrl: CARE_INSPECTORATE_REPORT,
      followUpReportUrl: CARE_INSPECTORATE_FOLLOW_UP,
      liveRegistryConfirmed: scotland.liveRegistryConfirmed,
      details: scotland.details,
      latestInspection: {
        completedOn: '3 July 2025',
        type: 'Unannounced',
        keyQuestionGrades: [
          { key: 'wellbeing', label: "How well do we support people's wellbeing?", score: 4, labelValue: 'Good' },
          { key: 'leadership', label: 'How good is our leadership?', score: 4, labelValue: 'Good' },
          { key: 'staff_team', label: 'How good is our staff team?', score: 4, labelValue: 'Good' },
          { key: 'setting', label: 'How good is our setting?', score: 4, labelValue: 'Good' },
          { key: 'care_planning', label: 'How well is care and support planned?', score: 4, labelValue: 'Good' },
        ],
        improvementItems: [
          {
            kind: 'area_for_improvement',
            text: 'Ensure people receive adequate hydration and that monitoring is robust where monitoring is required.',
            status: 'recorded_in_latest_report',
          },
        ],
        priorRequirements: [
          { made: '11 December 2024', status: 'Met - outwith timescales' },
          { made: '21 February 2025', status: 'Met - outwith timescales' },
        ],
      },
      history: [
        { date: '3 July 2025', type: 'Unannounced inspection', result: '5 key questions rated Good (4)' },
        { date: '29 January 2025', type: 'Unannounced follow-up', result: 'Follow-up inspection recorded against earlier findings' },
        { date: '22 May 2024', type: 'Unannounced inspection', result: 'Inspection and improvement monitoring' },
        { date: '24 January 2024', type: 'Follow-up inspection', result: 'Progress reviewed against requirements and areas for improvement' },
        { date: '24 August 2023', type: 'Follow-up inspection', result: 'Previous compliance actions reviewed' },
      ],
      sourceNote:
        'Scotland does not use the CQC rating framework. The Care Inspectorate is the relevant social-care regulator for Scottish services and publishes inspection grades, requirements and areas for improvement.',
    },
    sponsorship: {
      officialRegisterPage: sponsor.registerPage,
      csvSource: sponsor.csvSource,
      checkedAt: sponsor.checkedAt,
      status: sponsor.matches.length ? 'active' as const : sponsor.error ? 'online_check_failed' as const : 'not_found' as const,
      matches: sponsor.matches,
      summary: sponsor.matches.length
        ? 'CONAGS was found in the current Home Office Worker and Temporary Worker sponsor register.'
        : sponsor.error
          ? 'The Home Office register could not be refreshed from the Staff Portal right now.'
          : 'CONAGS was not found in the current Home Office Worker and Temporary Worker register response.',
      error: sponsor.error,
    },
  };
}
