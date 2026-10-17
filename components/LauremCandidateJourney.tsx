export type LauremCandidateJourneyStage =
  | 'application'
  | 'interview1'
  | 'interview2'
  | 'documents'
  | 'onboarding'
  | 'staff';

const steps: Array<{ key: LauremCandidateJourneyStage; label: string }> = [
  { key: 'application', label: 'Application' },
  { key: 'interview1', label: 'Interview 1' },
  { key: 'interview2', label: 'Interview 2' },
  { key: 'documents', label: 'Offer & documents' },
  { key: 'onboarding', label: 'Onboarding' },
  { key: 'staff', label: 'Staff Portal' },
];

export default function LauremCandidateJourney({
  current,
  compact = false,
}: {
  current: LauremCandidateJourneyStage;
  compact?: boolean;
}) {
  const currentIndex = steps.findIndex((step) => step.key === current);

  return (
    <section
      aria-label="CONAGS recruitment journey"
      style={{
        padding: compact ? 14 : 18,
        border: '1px solid var(--line)',
        borderRadius: 14,
        background: 'var(--soft)',
        marginBottom: compact ? 14 : 18,
      }}
    >
      {!compact && (
        <div
          style={{
            fontSize: 11,
            fontWeight: 900,
            letterSpacing: '.08em',
            color: 'var(--accent)',
            marginBottom: 12,
          }}
        >
          YOUR CONAGS JOURNEY
        </div>
      )}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(' + steps.length + ', minmax(0, 1fr))',
          gap: 8,
        }}
      >
        {steps.map((step, index) => {
          const done = index < currentIndex;
          const active = index === currentIndex;

          return (
            <div key={step.key} style={{ minWidth: 0 }}>
              <div
                aria-current={active ? 'step' : undefined}
                style={{
                  height: 6,
                  borderRadius: 999,
                  background: done || active ? 'var(--accent)' : 'var(--line)',
                }}
              />
              <div
                style={{
                  marginTop: 7,
                  fontSize: compact ? 10 : 11,
                  lineHeight: 1.3,
                  fontWeight: active ? 900 : done ? 800 : 600,
                  color: active || done ? 'var(--ink)' : 'var(--muted)',
                  textAlign:
                    index === 0
                      ? 'left'
                      : index === steps.length - 1
                        ? 'right'
                        : 'center',
                }}
              >
                {step.label}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
