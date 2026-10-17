import type { SupabaseClient } from '@supabase/supabase-js';
import { getLauremOnboardingReadiness } from './laurem-onboarding-readiness';
import { lauremRoleSlug } from './laurem-role-policy';

export type LauremLifecycleErrorCode =
  | 'APPLICATION_NOT_FOUND'
  | 'CONTRACT_REQUIRED'
  | 'CONTRACT_ROLE_MISMATCH'
  | 'READINESS_INCOMPLETE'
  | 'STAFF_CONTRACT_MISMATCH';

export class LauremLifecycleError extends Error {
  constructor(public readonly code: LauremLifecycleErrorCode, message: string, public readonly details?: Record<string, unknown>) {
    super(message);
    this.name = 'LauremLifecycleError';
  }
}

type ApplicationRecord = { id: string; role_applied?: string|null; living_in_uk?: string|null; start_date?: string|null; [key:string]: unknown };
type ContractRecord = { id: string; status: string; accepted_at?: string|null; job_title?: string|null; start_date?: string|null; [key:string]: unknown };
type StaffRecord = { id: string; contract_id?: string|null; [key:string]: unknown };

export async function loadLauremApplication(client: SupabaseClient, applicationId: string): Promise<ApplicationRecord> {
  const {data,error}=await client.from('recruitment_applications').select('*').eq('id',applicationId).maybeSingle();
  if(error)throw error;
  if(!data)throw new LauremLifecycleError('APPLICATION_NOT_FOUND','Application not found.');
  return data as ApplicationRecord;
}

export function requiresLauremPlatformContract(_application: ApplicationRecord) {
  // Every staff conversion requires an accepted employment contract.
  // Jurisdiction-specific sponsorship/registration rules are layered on top of this baseline gate.
  return true;
}

export async function loadAcceptedLauremContract(client: SupabaseClient, applicationId: string): Promise<ContractRecord> {
  const {data,error}=await client.from('recruitment_contracts').select('*').eq('application_id',applicationId).maybeSingle();
  if(error)throw error;
  if(!data||data.status!=='accepted'||!data.accepted_at)throw new LauremLifecycleError('CONTRACT_REQUIRED','The employment contract must be accepted before this lifecycle transition can proceed.');
  return data as ContractRecord;
}

export function assertLauremContractRole(application: ApplicationRecord, contract: ContractRecord) {
  const applicationRole=lauremRoleSlug(application.role_applied);
  const contractRole=lauremRoleSlug(contract.job_title);
  if(!applicationRole||!contractRole||applicationRole!==contractRole)throw new LauremLifecycleError('CONTRACT_ROLE_MISMATCH',"The accepted contract role does not match the candidate's applied role.",{applicationRole,contractRole});
}

export async function assertLauremOnboardingReady(client: SupabaseClient, application: ApplicationRecord) {
  const readiness=await getLauremOnboardingReadiness(client,application);
  if(!readiness.ready)throw new LauremLifecycleError('READINESS_INCOMPLETE',`Onboarding readiness is incomplete. Complete the following before this lifecycle transition: ${readiness.missing.map((item)=>item.title).join(', ')}`,{readiness});
  return readiness;
}

export function assertLauremStaffContractBinding(staff: StaffRecord, acceptedContract: ContractRecord) {
  if(staff.contract_id&&staff.contract_id!==acceptedContract.id)throw new LauremLifecycleError('STAFF_CONTRACT_MISMATCH','The existing staff profile is linked to a different employment contract.',{staffContractId:staff.contract_id,acceptedContractId:acceptedContract.id});
}

export async function validateLauremStaffTransition(client: SupabaseClient, applicationId: string) {
  const application=await loadLauremApplication(client,applicationId);
  let contract: ContractRecord|null=null;
  if(requiresLauremPlatformContract(application)) contract=await loadAcceptedLauremContract(client,applicationId);
  const readiness=await assertLauremOnboardingReady(client,application);
  const {data:staff,error}=await client.from('staff_profiles').select('*').eq('application_id',applicationId).maybeSingle();
  if(error)throw error;
  if(staff&&contract)assertLauremStaffContractBinding(staff as StaffRecord,contract);
  return {application,contract,readiness,staff:staff as StaffRecord|null};
}
