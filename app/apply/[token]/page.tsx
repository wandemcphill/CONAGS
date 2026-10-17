'use client';

import { FormEvent, useEffect, useState } from 'react';
import { lauremCompany } from '@/lib/laurem-company-config';
import { LAUREM_CANONICAL_ROLES, type LauremCanonicalRole } from '@/lib/laurem-role-policy';
import { getLauremNurseFirstInterviewQuestions } from '@/lib/laurem-nurse-interviews';
import LauremCandidateJourney from '@/components/LauremCandidateJourney';

const trainingOptions = ['Moving and Handling', 'Hand Hygiene for Care', 'GDPR', 'Fire Safety', 'PPE', 'Infection Control', 'Manual Handling', 'Lone Working & Personal Safety', 'Sharps Awareness'];

type Draft = Record<string, unknown> & {
  references: Array<Record<string, string>>;
  employment_history: EmploymentEntry[];
};

type EmploymentEntry = {
  employer: string;
  jobTitle: string;
  from: string;
  to: string;
  responsibilities: string;
  reasonForLeaving: string;
};

const emptyEmploymentEntry = (): EmploymentEntry => ({
  employer: '',
  jobTitle: '',
  from: '',
  to: '',
  responsibilities: '',
  reasonForLeaving: '',
});

const initial: Draft = {
  role_applied: '',
  pathway: 'uk',
  full_name: '',
  preferred_name: '',
  email: '',
  phone: '',
  date_of_birth: '',
  nationality: '',
  country_of_residence: '',
  address: '',
  employment_type: 'Full time',
  start_date: '',
  driving_licence: 'No',
  vehicle_access: 'No',
  availability: {},
  nmc_number: '',
  rcn_number: '',
  band: '',
  professional_registration: '',
  qualifications: '',
  care_experience: '',
  professional_experience: '',
  training: {},
  references: [
    { name: '', position: '', organisation: '', email: '', telephone: '' },
    { name: '', position: '', organisation: '', email: '', telephone: '' },
  ],
  employment_history: [emptyEmploymentEntry()],
  employment_gaps: [],
  right_to_work_status: '',
  work_permission: '',
  requires_sponsorship: 'No',
  international_experience: '',
  relocation_readiness: '',
  supporting_documents: [],
  consent: false,
  uk_family: '',
  previous_uk_immigration: '',
  dependants: 'No',
  dependant_count: 0,
  passport_number: '',
  passport_expiry: '',
  visa_history: '',
  accommodation_plan: '',
  living_in_uk: 'Yes',
};

export default function ApplicationPage({ params }: { params: Promise<{ token: string }> }) {
  const [token, setToken] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(initial);
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [done, setDone] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let active = true;
    params.then((value) => {
      if (active) setToken(value.token);
    });
    return () => {
      active = false;
    };
  }, [params]);

  useEffect(() => {
    if (!token) return;
    const key = `laurem:application-draft:${token.slice(0, 24)}`;
    try {
      const raw = window.sessionStorage.getItem(key);
      if (raw) {
        const saved = JSON.parse(raw) as { draft?: Partial<Draft>; step?: number };
        if (saved.draft && typeof saved.draft === 'object') {
          setDraft((current) => ({ ...current, ...saved.draft }));
        }
        if (typeof saved.step === 'number' && Number.isFinite(saved.step)) {
          setStep(Math.max(0, Math.min(Math.trunc(saved.step), steps.length - 1)));
        }
      }
    } catch {
      // Continue with an empty draft if session storage is unavailable or corrupted.
    } finally {
      setHydrated(true);
    }
  }, [token]);

  useEffect(() => {
    if (!token || !hydrated || done) return;
    const key = `laurem:application-draft:${token.slice(0, 24)}`;
    try {
      window.sessionStorage.setItem(key, JSON.stringify({ draft, step }));
    } catch {
      // Continue without persistence if browser storage is unavailable.
    }
  }, [token, hydrated, done, draft, step]);

  useEffect(() => {
    if (!token || !done) return;
    try {
      window.sessionStorage.removeItem(`laurem:application-draft:${token.slice(0, 24)}`);
    } catch {
      // Continue if browser storage is unavailable.
    }
  }, [token, done]);

  const selectedRole = String(draft.role_applied || '');
  const isNurse = selectedRole === 'Registered Nurse';
  const nurseQuestions = isNurse ? getLauremNurseFirstInterviewQuestions(draft.pathway as 'uk' | 'international') : [];
  const experienceStepTitle = isNurse
    ? 'Nursing & experience'
    : selectedRole === 'Physiotherapist'
      ? 'Professional registration & experience'
      : 'Qualifications & experience';
  const steps = ['Role & pathway', 'Personal details', experienceStepTitle, 'References & history', 'Right to work & declarations'];
  const progress = Math.round(((step + 1) / steps.length) * 100);

  function clearError(key?: string) {
    setError(null);
    if (!key) {
      setFieldErrors({});
      return;
    }
    setFieldErrors((current) => {
      if (!current[key]) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  }

  function update(key: string, value: unknown) {
    setDraft((current) => ({ ...current, [key]: value }));
    clearError(key);
  }

  function updateNested(group: string, key: string, value: unknown) {
    setDraft((current) => ({
      ...current,
      [group]: { ...(current[group] as Record<string, unknown> || {}), [key]: value },
    }));
    clearError(`${group}.${key}`);
  }

  function updateEmployment(index: number, key: keyof EmploymentEntry, value: string) {
    setDraft((current) => ({
      ...current,
      employment_history: current.employment_history.map((entry, idx) => idx === index ? { ...entry, [key]: value } : entry),
    }));
    clearError(`employment.${index}.${key}`);
  }

  function addEmployment() {
    setDraft((current) => ({ ...current, employment_history: [...current.employment_history, emptyEmploymentEntry()] }));
  }

  function removeEmployment(index: number) {
    setDraft((current) => ({
      ...current,
      employment_history: current.employment_history.length > 1
        ? current.employment_history.filter((_, idx) => idx !== index)
        : [emptyEmploymentEntry()],
    }));
  }

  function validateStep(targetStep: number) {
    const nextErrors: Record<string, string> = {};
    const add = (key: string, message: string) => {
      nextErrors[key] = message;
    };

    if (targetStep === 0) {
      if (!selectedRole) add('role_applied', 'Select the role you are applying for.');
    }

    if (targetStep === 1) {
      if (!String(draft.full_name || '').trim()) add('full_name', 'Enter your full name.');
      if (!String(draft.email || '').trim()) add('email', 'Enter your email address.');
      else if (!/^\S+@\S+\.\S+$/.test(String(draft.email).trim())) add('email', 'Enter a valid email address.');
      if (!String(draft.phone || '').trim()) add('phone', 'Enter a telephone number.');
      if (!String(draft.country_of_residence || '').trim()) add('country_of_residence', 'Enter your country of residence.');
      if (!String(draft.address || '').trim()) add('address', 'Enter your address.');
    }

    if (targetStep === 2) {
      if (isNurse) {
        if (!String(draft.nmc_number || '').trim()) add('nmc_number', 'Enter your NMC number.');
        if (!String(draft.qualifications || '').trim()) add('qualifications', 'Add your nursing qualifications.');
        if (!String(draft.care_experience || '').trim()) add('care_experience', 'Describe your nursing or care experience.');
        if (!String(draft.professional_experience || '').trim()) add('professional_experience', 'Describe your professional experience and registrations.');
      } else {
        if (!String(draft.qualifications || '').trim()) add('qualifications', 'Add your qualifications.');
        if (!String(draft.care_experience || '').trim()) add('care_experience', selectedRole === 'Physiotherapist' ? 'Describe your physiotherapy experience.' : 'Describe your care or support experience.');
        if (!String(draft.professional_experience || '').trim()) add('professional_experience', 'Describe your professional experience and relevant skills.');
      }
    }

    if (targetStep === 3) {
      draft.references.forEach((reference, index) => {
        if (!reference.name.trim()) add(`reference.${index}.name`, `Enter a name for reference ${index + 1}.`);
        if (!reference.organisation.trim()) add(`reference.${index}.organisation`, `Enter the organisation for reference ${index + 1}.`);
        if (!reference.email.trim()) add(`reference.${index}.email`, `Enter an email for reference ${index + 1}.`);
        else if (!/^\S+@\S+\.\S+$/.test(reference.email.trim())) add(`reference.${index}.email`, `Enter a valid email for reference ${index + 1}.`);
        if (!reference.telephone.trim()) add(`reference.${index}.telephone`, `Enter a telephone number for reference ${index + 1}.`);
      });
      draft.employment_history.forEach((entry, index) => {
        const hasAny = Object.values(entry).some((value) => value.trim());
        if (!hasAny) return;
        if (!entry.employer.trim()) add(`employment.${index}.employer`, 'Enter the employer.');
        if (!entry.jobTitle.trim()) add(`employment.${index}.jobTitle`, 'Enter the job title.');
        if (!entry.from) add(`employment.${index}.from`, 'Enter the start date.');
        if (entry.to && entry.from && entry.to < entry.from) add(`employment.${index}.to`, 'The end date cannot be before the start date.');
      });
    }

    if (targetStep === 4) {
      if (draft.pathway === 'uk' && !String(draft.right_to_work_status || '').trim()) add('right_to_work_status', 'Tell us your current UK right-to-work status.');
      if (draft.pathway === 'international') {
        if (!String(draft.work_permission || '').trim()) add('work_permission', 'Tell us your current work permission or visa status.');
        if (!String(draft.passport_number || '').trim()) add('passport_number', 'Enter your passport number.');
        if (!String(draft.passport_expiry || '').trim()) add('passport_expiry', 'Enter your passport expiry date.');
        if (!String(draft.relocation_readiness || '').trim()) add('relocation_readiness', 'Describe your relocation readiness and timeframe.');
      }
      if (!draft.consent) add('consent', 'You must confirm the declaration before submitting your application.');
    }

    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      setError(`Please correct ${Object.keys(nextErrors).length === 1 ? 'the highlighted field' : 'the highlighted fields'} before continuing.`);
      const firstKey = Object.keys(nextErrors)[0];
      requestAnimationFrame(() => {
        document.getElementById(firstKey)?.focus();
        document.getElementById('application-errors')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
      return false;
    }
    setError(null);
    return true;
  }

  function goNext() {
    if (validateStep(step)) setStep((current) => Math.min(current + 1, steps.length - 1));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!token) return;
    if (!validateStep(4)) return;

    setSaving(true);
    setError(null);
    const payload = {
      ...draft,
      living_in_uk: draft.pathway === 'uk' ? 'Yes' : 'No',
      current_country: draft.country_of_residence,
    };

    try {
      const response = await fetch('/api/applications', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-invitation-token': token },
        body: JSON.stringify(payload),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'Unable to submit your application.');
      setDone(true);
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : 'Unable to submit your application.');
    } finally {
      setSaving(false);
    }
  }

  if (done) return <main className="wrap" style={{ padding: '70px 0 90px', maxWidth: 920 }}><LauremCandidateJourney current="application" /><section className="card" style={{ padding: 36, textAlign: 'center' }}><p style={{ color: 'var(--accent)', fontWeight: 800 }}>APPLICATION RECEIVED</p><h1>Thank you for applying to {lauremCompany.tradingName}.</h1><p style={{ color: 'var(--muted)', lineHeight: 1.7 }}>Your application has been securely submitted. The next stage is Interview 1. CONAGS will email your private assessment link when your application is ready to proceed.</p></section></main>;

  return <main className="wrap" style={{ padding: '40px 0 80px', maxWidth: 900 }}>
    <header style={{ marginBottom: 20 }}>
      <p style={{ color: 'var(--accent)', fontWeight: 800, letterSpacing: '.08em' }}>{lauremCompany.tradingName.toUpperCase()} RECRUITMENT</p>
      <h1 style={{ marginBottom: 8 }}>Candidate application</h1>
      <p style={{ color: 'var(--muted)' }}>Complete your application carefully. Your progress is kept in this browser tab until you submit.</p>
      <div style={{ height: 8, background: 'var(--line)', borderRadius: 99, overflow: 'hidden', marginTop: 18 }} aria-hidden="true"><div style={{ width: `${progress}%`, height: '100%', background: 'var(--accent)' }} /></div>
      <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 8 }}>Step {step + 1} of {steps.length}: {steps[step]}</p>
    </header>

    {error && <div id="application-errors" role="alert" aria-live="assertive" className="card" style={{ padding: 14, marginBottom: 14, color: '#8a2323', border: '1px solid #dfb4b4', background: '#fff8f8' }}>{error}</div>}

    <p style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 12 }}><strong>* Required</strong>. You can move between steps without losing your entries.</p>

    <form onSubmit={submit} noValidate>
      {step === 0 && <Card title="Role and pathway">
        <FieldLabel text="Role" required error={fieldErrors.role_applied}>
          <select id="role_applied" required value={selectedRole} aria-invalid={Boolean(fieldErrors.role_applied)} aria-describedby={fieldErrors.role_applied ? 'role_applied-error' : undefined} onChange={(e) => update('role_applied', e.target.value)} style={fieldStyle}>
            <option value="">Select the role you are applying for</option>
            {LAUREM_CANONICAL_ROLES.map((role: LauremCanonicalRole) => <option key={role} value={role}>{role}</option>)}
          </select>
        </FieldLabel>
        <FieldLabel text="Application pathway">
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {['uk', 'international'].map((pathway) => <button type="button" key={pathway} aria-pressed={draft.pathway === pathway} onClick={() => update('pathway', pathway)} style={{ ...buttonSecondary, background: draft.pathway === pathway ? 'var(--ink)' : 'white', color: draft.pathway === pathway ? 'white' : 'var(--ink)' }}>{pathway === 'uk' ? 'UK-based applicant' : 'International applicant'}</button>)}
          </div>
        </FieldLabel>
        {draft.pathway === 'international' && isNurse && <Notice>International nurse applications may be considered for employer sponsorship subject to eligibility, registration and immigration requirements.</Notice>}
        {draft.pathway === 'international' && !isNurse && selectedRole && <Notice>International applications for care and support roles are subject to current UK immigration eligibility and any applicable in-country route requirements.</Notice>}
      </Card>}

      {step === 1 && <Card title="Personal details"><Grid>
        <Input id="full_name" label="First and other names" value={String(draft.full_name)} onChange={(v) => update('full_name', v)} required error={fieldErrors.full_name} />
        <Input id="preferred_name" label="Preferred name" value={String(draft.preferred_name)} onChange={(v) => update('preferred_name', v)} />
        <Input id="email" label="Email" type="email" value={String(draft.email)} onChange={(v) => update('email', v)} required error={fieldErrors.email} />
        <Input id="phone" label="Phone" value={String(draft.phone)} onChange={(v) => update('phone', v)} required error={fieldErrors.phone} />
        <Input id="date_of_birth" label="Date of birth" type="date" value={String(draft.date_of_birth)} onChange={(v) => update('date_of_birth', v)} />
        <Input id="nationality" label="Nationality" value={String(draft.nationality)} onChange={(v) => update('nationality', v)} />
        <Input id="country_of_residence" label="Country of residence" value={String(draft.country_of_residence)} onChange={(v) => update('country_of_residence', v)} required error={fieldErrors.country_of_residence} />
        <Input id="address" label="Address" value={String(draft.address)} onChange={(v) => update('address', v)} required error={fieldErrors.address} />
      </Grid></Card>}

      {step === 2 && <Card title={experienceStepTitle}>
        {isNurse ? <>
          <Grid><Input id="nmc_number" label="NMC number" value={String(draft.nmc_number)} onChange={(v) => update('nmc_number', v)} required error={fieldErrors.nmc_number} /><Input id="rcn_number" label="RCN number" value={String(draft.rcn_number)} onChange={(v) => update('rcn_number', v)} /><Input id="band" label="Band / grade" value={String(draft.band)} onChange={(v) => update('band', v)} /></Grid>
          <TextArea id="qualifications" label="Qualifications" value={String(draft.qualifications)} onChange={(v) => update('qualifications', v)} required error={fieldErrors.qualifications} />
          <TextArea id="care_experience" label="Nursing / care experience" value={String(draft.care_experience)} onChange={(v) => update('care_experience', v)} required error={fieldErrors.care_experience} />
          <TextArea id="professional_experience" label="Professional experience and registrations" value={String(draft.professional_experience)} onChange={(v) => update('professional_experience', v)} required error={fieldErrors.professional_experience} />
        </> : <>
          {selectedRole === 'Physiotherapist' && <Input id="professional_registration" label="Professional registration / regulatory details" value={String(draft.professional_registration)} onChange={(v) => update('professional_registration', v)} />}
          <TextArea id="qualifications" label="Qualifications" value={String(draft.qualifications)} onChange={(v) => update('qualifications', v)} required error={fieldErrors.qualifications} />
          <TextArea id="care_experience" label={selectedRole === 'Physiotherapist' ? 'Physiotherapy experience' : 'Care / support experience'} value={String(draft.care_experience)} onChange={(v) => update('care_experience', v)} required error={fieldErrors.care_experience} />
          <TextArea id="professional_experience" label="Professional experience and relevant skills" value={String(draft.professional_experience)} onChange={(v) => update('professional_experience', v)} required error={fieldErrors.professional_experience} />
        </>}
        <h3>Mandatory training</h3><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 8 }}>{trainingOptions.map((name) => <label key={name} style={{ padding: 10, border: '1px solid var(--line)', borderRadius: 9 }}><input type="checkbox" checked={Boolean((draft.training as Record<string, boolean>)[name])} onChange={(e) => updateNested('training', name, e.target.checked)} /> {name}</label>)}</div>
      </Card>}

      {step === 3 && <Card title="References and employment history">
        <p style={{ color: 'var(--muted)', marginTop: 0 }}>Please provide two professional references. Employment history entries may be added as needed.</p>
        <h3>Professional references</h3>
        {draft.references.map((ref, i) => <div key={i} style={sectionStyle}>
          <strong>Reference {i + 1}</strong>
          <Grid>
            {['name', 'position', 'organisation', 'email', 'telephone'].map((key) => <Input key={key} id={`reference.${i}.${key}`} label={key[0].toUpperCase() + key.slice(1)} value={ref[key] || ''} onChange={(v) => { setDraft((d) => ({ ...d, references: d.references.map((r, idx) => idx === i ? { ...r, [key]: v } : r) })); clearError(`reference.${i}.${key}`); }} required={i < 2 && ['name', 'organisation', 'email', 'telephone'].includes(key)} error={fieldErrors[`reference.${i}.${key}`]} />)}
          </Grid>
        </div>)}

        <h3>Employment history</h3>
        <p style={{ color: 'var(--muted)', fontSize: 13 }}>Leave an employment block blank if you do not need it. For each completed block, employer, job title and start date are required.</p>
        {draft.employment_history.map((entry, i) => <div key={i} style={sectionStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 12 }}><strong>Employment {i + 1}</strong>{draft.employment_history.length > 1 && <button type="button" onClick={() => removeEmployment(i)} style={buttonSecondary}>Remove</button>}</div>
          <Grid>
            <Input id={`employment.${i}.employer`} label="Employer" value={entry.employer} onChange={(v) => updateEmployment(i, 'employer', v)} error={fieldErrors[`employment.${i}.employer`]} />
            <Input id={`employment.${i}.jobTitle`} label="Job title" value={entry.jobTitle} onChange={(v) => updateEmployment(i, 'jobTitle', v)} error={fieldErrors[`employment.${i}.jobTitle`]} />
            <Input id={`employment.${i}.from`} label="From" type="date" value={entry.from} onChange={(v) => updateEmployment(i, 'from', v)} error={fieldErrors[`employment.${i}.from`]} />
            <Input id={`employment.${i}.to`} label="To" type="date" value={entry.to} onChange={(v) => updateEmployment(i, 'to', v)} error={fieldErrors[`employment.${i}.to`]} />
          </Grid>
          <TextArea id={`employment.${i}.responsibilities`} label="Responsibilities" value={entry.responsibilities} onChange={(v) => updateEmployment(i, 'responsibilities', v)} rows={5} />
          <Input id={`employment.${i}.reasonForLeaving`} label="Reason for leaving" value={entry.reasonForLeaving} onChange={(v) => updateEmployment(i, 'reasonForLeaving', v)} />
        </div>)}
        <button type="button" onClick={addEmployment} style={buttonSecondary}>Add another employment</button>
      </Card>}

      {step === 4 && <Card title="Right to work, relocation and declarations">
        <Grid>
          <Input id="right_to_work_status" label="Current UK right-to-work status" value={String(draft.right_to_work_status)} onChange={(v) => update('right_to_work_status', v)} required={draft.pathway === 'uk'} error={fieldErrors.right_to_work_status} />
          <Input id="work_permission" label="Work permission / visa status" value={String(draft.work_permission)} onChange={(v) => update('work_permission', v)} required={draft.pathway === 'international'} error={fieldErrors.work_permission} />
          <Input id="passport_number" label="Passport number" value={String(draft.passport_number)} onChange={(v) => update('passport_number', v)} required={draft.pathway === 'international'} error={fieldErrors.passport_number} />
          <Input id="passport_expiry" label="Passport expiry" type="date" value={String(draft.passport_expiry)} onChange={(v) => update('passport_expiry', v)} required={draft.pathway === 'international'} error={fieldErrors.passport_expiry} />
        </Grid>
        {draft.pathway === 'international' && <>
          <TextArea id="previous_uk_immigration" label="Previous UK immigration / visa history" value={String(draft.previous_uk_immigration)} onChange={(v) => update('previous_uk_immigration', v)} />
          <TextArea id="visa_history" label="International travel / immigration history" value={String(draft.visa_history)} onChange={(v) => update('visa_history', v)} />
          <TextArea id="relocation_readiness" label="Relocation readiness and timeframe" value={String(draft.relocation_readiness)} onChange={(v) => update('relocation_readiness', v)} required error={fieldErrors.relocation_readiness} />
          <TextArea id="accommodation_plan" label="Accommodation / relocation plan" value={String(draft.accommodation_plan)} onChange={(v) => update('accommodation_plan', v)} />
        </>}
        <div style={{ marginTop: 14, padding: 14, border: `1px solid ${fieldErrors.consent ? '#b54a4a' : 'var(--line)'}`, borderRadius: 10, background: fieldErrors.consent ? '#fff8f8' : 'white' }}>
          <label htmlFor="consent" style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}><input id="consent" type="checkbox" checked={Boolean(draft.consent)} onChange={(e) => update('consent', e.target.checked)} required aria-invalid={Boolean(fieldErrors.consent)} /> <span>I confirm that the information provided is accurate and consent to Conags processing my application for recruitment purposes. <strong>*</strong></span></label>
          {fieldErrors.consent && <p id="consent-error" style={errorTextStyle}>{fieldErrors.consent}</p>}
        </div>
      </Card>}

      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginTop: 16 }}>
        {step > 0 ? <button type="button" onClick={() => { clearError(); setStep((current) => current - 1); }} style={buttonSecondary}>Back</button> : <span />}
        {step < steps.length - 1
          ? <button type="button" onClick={goNext} style={buttonPrimary}>Continue</button>
          : <button type="submit" disabled={saving} style={buttonPrimary}>{saving ? 'Submitting...' : 'Submit application'}</button>}
      </div>
    </form>

    {isNurse && <p style={{ color: 'var(--muted)', fontSize: 12, marginTop: 18 }}>The final nurse interview can be completed from your private recruitment link after application submission.</p>}
    <p hidden>{nurseQuestions.length}</p>
  </main>;
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="card" style={{ padding: 24 }}><h2 style={{ marginTop: 0 }}>{title}</h2>{children}</section>;
}

function Notice({ children }: { children: React.ReactNode }) {
  return <div style={{ padding: 14, borderRadius: 10, background: 'var(--soft)', color: 'var(--muted)', lineHeight: 1.5, marginTop: 12 }}>{children}</div>;
}

function FieldLabel({ text, required = false, error, children }: { text: string; required?: boolean; error?: string; children: React.ReactNode }) {
  return <label style={{ display: 'block' }}>{text}{required && <strong aria-hidden="true"> *</strong>}{children}{error && <span id={`${text.toLowerCase().replace(/[^a-z0-9]+/g, '_')}-error`} style={errorTextStyle}>{error}</span>}</label>;
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: 14 }}>{children}</div>;
}

function Input({ id, label, value, onChange, type = 'text', required = false, error, placeholder }: { id: string; label: string; value: string; onChange: (value: string) => void; type?: string; required?: boolean; error?: string; placeholder?: string }) {
  const errorId = `${id}-error`;
  return <label htmlFor={id} style={{ display: 'block' }}>{label}{required && <strong aria-hidden="true"> *</strong>}<input id={id} required={required} type={type} value={value} placeholder={placeholder} aria-invalid={Boolean(error)} aria-describedby={error ? errorId : undefined} onChange={(e) => onChange(e.target.value)} style={{ ...fieldStyle, borderColor: error ? '#b54a4a' : 'var(--line)' }} />{error && <span id={errorId} style={errorTextStyle}>{error}</span>}</label>;
}

function TextArea({ id, label, value, onChange, required = false, error, rows = 6 }: { id: string; label: string; value: string; onChange: (value: string) => void; required?: boolean; error?: string; rows?: number }) {
  const errorId = `${id}-error`;
  return <label htmlFor={id} style={{ display: 'block', marginTop: 14 }}>{label}{required && <strong aria-hidden="true"> *</strong>}<textarea id={id} required={required} aria-invalid={Boolean(error)} aria-describedby={error ? errorId : undefined} value={value} onChange={(e) => onChange(e.target.value)} rows={rows} style={{ ...fieldStyle, minHeight: 130, resize: 'vertical', borderColor: error ? '#b54a4a' : 'var(--line)', font: 'inherit' }} />{error && <span id={errorId} style={errorTextStyle}>{error}</span>}</label>;
}

const sectionStyle = { border: '1px solid var(--line)', borderRadius: 12, padding: 14, marginBottom: 12 };
const fieldStyle = { display: 'block', width: '100%', marginTop: 6, padding: 12, border: '1px solid var(--line)', borderRadius: 9, background: 'white' };
const errorTextStyle = { display: 'block', marginTop: 6, color: '#8a2323', fontSize: 13 };
const buttonPrimary = { background: 'var(--ink)', color: 'white', border: 0, padding: '12px 18px', borderRadius: 9, fontWeight: 800 };
const buttonSecondary = { background: 'white', color: 'var(--ink)', border: '1px solid var(--line)', padding: '12px 18px', borderRadius: 9, fontWeight: 800 };
