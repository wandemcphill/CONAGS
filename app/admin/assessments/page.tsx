'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

type Assessment = {
  id: string;
  application_id: string;
  round: number;
  role: string;
  pathway: string;
  question_snapshot: any[];
  answers: Record<string, unknown> | null;
  status: string;
  score: number | null;
  total_questions: number | null;
  pass_percent: number | null;
  percent: number | null;
  started_at: string;
  submitted_at: string | null;
  application: {
    id: string;
    full_name: string;
    email: string;
    role_applied: string | null;
    status: string;
    country_of_residence: string | null;
    living_in_uk: string | null;
  } | null;
};

const card: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #e5eaf0',
  borderRadius: 16,
  padding: 20,
  boxShadow: '0 8px 28px rgba(15,23,42,.04)',
};
const subcard: React.CSSProperties = {
  border: '1px solid #edf2f7',
  borderRadius: 12,
  padding: 14,
  background: '#fbfcfe',
};
const muted: React.CSSProperties = { color: '#627d98' };
const button: React.CSSProperties = {
  border: '1px solid #d9e2ec',
  background: '#fff',
  color: '#102a43',
  padding: '9px 12px',
  borderRadius: 9,
  fontWeight: 800,
  cursor: 'pointer',
};
const primary: React.CSSProperties = {
  ...button,
  border: 0,
  background: '#102a43',
  color: '#fff',
};

function fmt(value: string | null) {
  if (!value) return 'Not submitted';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
}

function answerText(assessment: Assessment, question: any) {
  const value = assessment.answers?.[String(question.id)];
  if (assessment.round === 1) {
    const index = Number(value);
    return Number.isInteger(index) && Array.isArray(question.options) && index >= 0 && index < question.options.length
      ? question.options[index]
      : 'No recorded answer';
  }
  return value === undefined || value === null || value === '' ? 'No recorded answer' : String(value);
}

function Review({ assessment }: { assessment: Assessment }) {
  const questions = Array.isArray(assessment.question_snapshot) ? assessment.question_snapshot : [];
  const score = assessment.score === null || assessment.score === undefined
    ? 'Not scored'
    : `${assessment.score}/${assessment.total_questions || questions.length}`;
  const percent = assessment.percent === null || assessment.percent === undefined ? 'Not scored' : `${assessment.percent}%`;

  return (
    <section style={{ ...card, marginTop: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
        <div>
          <strong>Round {assessment.round} assessment</strong>
          <div style={{ ...muted, marginTop: 4 }}>
            {assessment.status} · {assessment.role} · {assessment.pathway} · {questions.length || assessment.total_questions || 0} questions
          </div>
        </div>
        <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
          <span style={{ padding: '6px 9px', borderRadius: 999, background: '#edf2f7', fontSize: 12, fontWeight: 800 }}>Score: {score}</span>
          <span style={{ padding: '6px 9px', borderRadius: 999, background: '#edf2f7', fontSize: 12, fontWeight: 800 }}>Percentage: {percent}</span>
          {assessment.round === 1 && <span style={{ padding: '6px 9px', borderRadius: 999, background: '#edf2f7', fontSize: 12, fontWeight: 800 }}>Pass mark: {assessment.pass_percent ?? 'Not set'}%</span>}
        </div>
      </div>

      <div style={{ marginTop: 12, ...muted, fontSize: 12 }}>
        Started {fmt(assessment.started_at)} · Submitted {fmt(assessment.submitted_at)}
      </div>

      {assessment.round === 2 && (
        <div style={{ ...subcard, marginTop: 12, background: '#fffaf2', borderColor: '#f0d7a7' }}>
          <strong>Round 2 recruiter review</strong>
          <div style={{ ...muted, marginTop: 4, fontSize: 13 }}>
            Written answers are stored here for staff review. The current workflow does not calculate an automatic Round 2 score.
          </div>
        </div>
      )}

      {questions.length === 0 ? (
        <div style={{ ...muted, marginTop: 14 }}>No question snapshot was stored for this assessment.</div>
      ) : (
        <div style={{ display: 'grid', gap: 10, marginTop: 14 }}>
          {questions.map((question: any, index: number) => {
            const answer = answerText(assessment, question);
            const round1 = assessment.round === 1;
            const selectedIndex = round1 ? Number(assessment.answers?.[String(question.id)]) : -1;
            const correct = round1 && Number.isInteger(selectedIndex) && selectedIndex === Number(question.correctIndex);
            const correctAnswer = round1 && Array.isArray(question.options) && Number.isInteger(Number(question.correctIndex))
              ? question.options[Number(question.correctIndex)]
              : null;

            return (
              <article key={question.id || index} style={{ ...subcard, background: '#fff' }}>
                <div style={{ fontSize: 12, fontWeight: 900, color: '#0f766e' }}>
                  {index + 1}. {question.category || 'Assessment question'}
                </div>
                <div style={{ marginTop: 6, fontWeight: 800 }}>{question.text}</div>
                <div style={{ marginTop: 10 }}>
                  <div style={{ ...muted, fontSize: 12 }}>Candidate answer</div>
                  <div style={{ marginTop: 3, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{answer}</div>
                </div>
                {round1 && (
                  <div style={{ marginTop: 8 }}>
                    <span style={{ padding: '5px 8px', borderRadius: 999, background: correct ? '#e7f8ef' : '#fff1f1', fontSize: 11, fontWeight: 900 }}>
                      {correct ? 'Correct' : 'Incorrect'}
                    </span>
                    <div style={{ marginTop: 7 }}>
                      <span style={{ ...muted, fontSize: 12 }}>Correct answer</span>
                      <div style={{ marginTop: 3 }}>{correctAnswer || 'Not available'}</div>
                    </div>
                  </div>
                )}
                {question.guidance && (
                  <div style={{ ...muted, fontSize: 12, marginTop: 8 }}>
                    Review guidance: {question.guidance}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

export default function AssessmentsPage() {
  const router = useRouter();
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [query, setQuery] = useState('');
  const [round, setRound] = useState('all');
  const [result, setResult] = useState('all');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  const limit = 50;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function load(pageOffset: number) {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`/api/admin/assessments?limit=${limit}&offset=${pageOffset}`, { cache: 'no-store' });
      const body = await response.json();
      if (response.status === 401) {
        router.replace('/admin/login');
        return;
      }
      if (!response.ok) throw new Error(body.error || 'Unable to load assessments.');
      setAssessments(body.assessments || []);
      setTotal(Number(body.total || 0));
      setOffset(pageOffset);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load assessments.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load(0);
  }, []);

  const filtered = useMemo(() => assessments.filter((item) => {
    const candidate = item.application;
    const searchText = [candidate?.full_name, candidate?.email, candidate?.role_applied, candidate?.status, item.role, item.pathway, item.status].filter(Boolean).join(' ').toLowerCase();
    const matchesQuery = searchText.includes(query.trim().toLowerCase());
    const matchesRound = round === 'all' || String(item.round) === round;
    const matchesResult =
      result === 'all'
      || (result === 'passed' && item.round === 1 && item.status === 'passed')
      || (result === 'failed' && item.round === 1 && item.status === 'failed')
      || (result === 'submitted' && item.round === 2 && item.status === 'submitted');
    return matchesQuery && matchesRound && matchesResult;
  }), [assessments, query, round, result]);

  const hasPrevious = offset > 0;
  const hasNext = offset + assessments.length < total;

  return (
    <main className="wrap" style={{ padding: '40px 0 80px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 18, alignItems: 'end', flexWrap: 'wrap' }}>
        <div>
          <Link href="/admin" style={{ color: '#627d98', textDecoration: 'none', fontWeight: 700 }}>← Recruiter workspace</Link>
          <p style={{ color: '#0f766e', fontWeight: 900, letterSpacing: '.08em', marginBottom: 5 }}>ASSESSMENT REVIEW</p>
          <h1 style={{ margin: 0 }}>All recruitment assessments</h1>
          <p style={{ ...muted, marginTop: 8, maxWidth: 840, lineHeight: 1.6 }}>
            Every recorded Round 1 and Round 2 assessment is reviewable here, including failed assessments. Question snapshots and candidate answers are retained with the assessment record.
          </p>
        </div>
      </div>

      {error && <div role="alert" style={{ ...card, marginTop: 18, color: '#8a2323', background: '#fff8f8' }}>{error}</div>}

      <section style={{ ...card, marginTop: 20 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(260px,2fr) 160px 180px', gap: 10 }}>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search candidate, email, role or status" style={{ padding: 12, border: '1px solid #d9e2ec', borderRadius: 9 }} />
          <select value={round} onChange={(e) => setRound(e.target.value)} style={{ padding: 12, border: '1px solid #d9e2ec', borderRadius: 9 }}>
            <option value="all">All rounds</option>
            <option value="1">Round 1</option>
            <option value="2">Round 2</option>
          </select>
          <select value={result} onChange={(e) => setResult(e.target.value)} style={{ padding: 12, border: '1px solid #d9e2ec', borderRadius: 9 }}>
            <option value="all">All outcomes</option>
            <option value="passed">Round 1 passed</option>
            <option value="failed">Round 1 failed</option>
            <option value="submitted">Round 2 submitted</option>
          </select>
        </div>
        <div style={{ ...muted, fontSize: 12, marginTop: 10 }}>Showing {filtered.length} of {assessments.length} records on this page · {total} total assessment records</div>
      </section>

      {loading ? (
        <section style={{ ...card, marginTop: 16 }}>Loading assessments…</section>
      ) : filtered.length === 0 ? (
        <section style={{ ...card, marginTop: 16 }}>No assessments match the current filters.</section>
      ) : (
        filtered.map((assessment) => {
          const candidate = assessment.application;
          const open = expanded === assessment.id;
          const score = assessment.score === null || assessment.score === undefined ? 'Not scored' : `${assessment.score}/${assessment.total_questions || assessment.question_snapshot?.length || 0}`;
          return (
            <section key={assessment.id} style={{ ...card, marginTop: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
                <div>
                  <Link href={candidate ? `/admin/applications/${candidate.id}` : '#'} style={{ fontSize: 20, fontWeight: 900, color: '#102a43', textDecoration: 'none' }}>
                    {candidate?.full_name || 'Candidate record unavailable'}
                  </Link>
                  <div style={{ ...muted, marginTop: 5 }}>
                    {candidate?.email || 'No email'} · {candidate?.role_applied || assessment.role} · Candidate status: {candidate?.status || 'Unknown'}
                  </div>
                  <div style={{ ...muted, fontSize: 12, marginTop: 3 }}>
                    Round {assessment.round} · {assessment.status} · {assessment.pathway}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 7, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={{ padding: '6px 9px', borderRadius: 999, background: '#edf2f7', fontSize: 12, fontWeight: 800 }}>Score: {score}</span>
                  <button type="button" onClick={() => setExpanded(open ? null : assessment.id)} style={open ? primary : button}>
                    {open ? 'Hide questions & answers' : 'View questions & answers'}
                  </button>
                </div>
              </div>
              {open && <Review assessment={assessment} />}
            </section>
          );
        })
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 18 }}>
        <button type="button" disabled={!hasPrevious || loading} onClick={() => void load(Math.max(0, offset - limit))} style={{ ...button, opacity: hasPrevious ? 1 : .45 }}>
          Previous
        </button>
        <span style={{ ...muted, fontSize: 13, alignSelf: 'center' }}>
          Page {Math.floor(offset / limit) + 1} of {Math.max(1, Math.ceil(total / limit))}
        </span>
        <button type="button" disabled={!hasNext || loading} onClick={() => void load(offset + limit)} style={{ ...button, opacity: hasNext ? 1 : .45 }}>
          Next
        </button>
      </div>
    </main>
  );
}
