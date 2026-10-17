export type LauremVisaReadinessItem = {
  key: string;
  label: string;
  ready: boolean;
};

export type LauremVisaReadiness = {
  ready: boolean;
  readyForSmsSubmission: boolean;
  items: LauremVisaReadinessItem[];
  missing: string[];
};

function present(value: unknown) {
  return typeof value === 'string' ? value.trim().length > 0 : value !== null && value !== undefined;
}

export function buildLauremVisaReadiness(input: {
  pathway: string;
  staff?: Record<string, unknown> | null;
  application?: Record<string, unknown> | null;
  additionalInformation?: Record<string, unknown> | null;
  invoiceStatus?: string | null;
}): LauremVisaReadiness {
  const info = input.additionalInformation || {};
  const pathway = input.pathway;
  const items: LauremVisaReadinessItem[] = [
    {
      key: 'identity_record',
      label: 'Recruitment and staff records are linked',
      ready: Boolean(input.staff?.id && input.application?.id),
    },
    {
      key: 'passport_number',
      label: 'Passport number recorded',
      ready: present(info.passport_number),
    },
    {
      key: 'passport_expiry',
      label: 'Passport expiry recorded',
      ready: present(info.passport_expiry_date),
    },
    {
      key: 'passport_country',
      label: 'Passport country recorded',
      ready: present(info.passport_country),
    },
    {
      key: 'invoice_paid',
      label: 'CONAGS sponsorship-support invoice is paid',
      ready: input.invoiceStatus === 'paid',
    },
  ];

  if (pathway === 'visa_switch') {
    items.push(
      {
        key: 'current_visa_type',
        label: 'Current UK visa type recorded',
        ready: present(info.current_visa_type),
      },
      {
        key: 'current_visa_start',
        label: 'Current UK visa start date recorded',
        ready: present(info.current_visa_start_date),
      },
      {
        key: 'current_visa_end',
        label: 'Current UK visa end date recorded',
        ready: present(info.current_visa_end_date) || present(info.current_visa_expiry_date),
      },
    );
  }

  items.push(
    {
      key: 'address_current',
      label: 'Application address confirmed as current or updated',
      ready: info.address_is_current === 'yes' || (info.address_is_current === 'no' && present(info.current_address)),
    },
    {
      key: 'address_proof',
      label: 'Proof of current address provided to CONAGS',
      ready: info.address_proof_provided === 'yes',
    },
  );

  if (pathway === 'visa_switch') {
    items.push(
      {
        key: 'right_to_work_status',
        label: 'Right to work in the UK confirmed',
        ready: info.right_to_work_status === 'yes',
      },
      {
        key: 'right_to_work_proof',
        label: 'Right-to-work proof provided to CONAGS',
        ready: info.right_to_work_proof_provided === 'yes',
      },
      {
        key: 'uk_status_share_code',
        label: 'UK status share code recorded when required',
        ready: (info.right_to_work_status !== 'no' && info.right_to_work_proof_provided !== 'no') || present(info.uk_status_share_code),
      },
    );
  }

  const missing = items.filter((item) => !item.ready).map((item) => item.label);
  const ready = missing.length === 0;

  return {
    ready,
    readyForSmsSubmission: ready,
    items,
    missing,
  };
}

export function canAdvanceLauremVisaToSmsSubmission(input: {
  targetStatus: string;
  readiness: LauremVisaReadiness;
}) {
  return !['preparing_sms', 'submitted_to_sms'].includes(input.targetStatus)
    || input.readiness.readyForSmsSubmission;
}
