export const UK_SWITCH_UPFRONT_AMOUNT_PENCE = 50_000;
export const UK_SWITCH_DEFERRED_AMOUNT_PENCE = 150_000;
export const UK_SWITCH_WEEK_COUNT = 13;
export const UK_SWITCH_WEEKLY_AMOUNT_PENCE = 11_538;
export const UK_SWITCH_FINAL_WEEK_AMOUNT_PENCE = 11_544;

export type LauremVisaPaymentPlanKind = 'uk_switch_split' | 'full_upfront';

export function isUkSwitchSplitRole(role: string | null | undefined) {
  const value = (role || '').trim().toLowerCase();
  return value.includes('healthcare assistant') || value.includes('support worker');
}

export function isInternationalNurseRole(role: string | null | undefined) {
  const value = (role || '').trim().toLowerCase();
  return value.includes('registered nurse') || value === 'nurse' || value.includes(' nurse');
}

export function buildUkSwitchPaymentPlan() {
  return {
    kind: 'uk_switch_split' as const,
    upfrontAmountPence: UK_SWITCH_UPFRONT_AMOUNT_PENCE,
    deferredAmountPence: UK_SWITCH_DEFERRED_AMOUNT_PENCE,
    weeklyDeductionCount: UK_SWITCH_WEEK_COUNT,
    weeklyDeductionPence: UK_SWITCH_WEEKLY_AMOUNT_PENCE,
    finalWeeklyDeductionPence: UK_SWITCH_FINAL_WEEK_AMOUNT_PENCE,
    firstDeductionWeek: 'First training week after successful visa and commencement of employment',
    cadence: 'weekly',
    period: 'first three months',
  };
}

export function getVisaPaymentPlan(role: string | null | undefined, pathway: string, isUk: boolean): LauremVisaPaymentPlanKind {
  return pathway === 'visa_switch' && isUk && isUkSwitchSplitRole(role)
    ? 'uk_switch_split'
    : 'full_upfront';
}
