'use client';

import { useEffect, useMemo, useState } from 'react';
import { getLauremCalmFirstInterviewQuestions } from '@/lib/laurem-calm-interviews';
import { type NursePathway } from '@/lib/laurem-nurse-interviews';
import { lauremCompany } from '@/lib/laurem-company-config';

export default function NurseInterviewClient({ token, pathway }: { token: string; pathway: NursePathway }) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [reviewMode, setReviewMode] = useState(false);
  const questions = useMemo(() => getLauremCalmFirstInterviewQuestions(pathway), [pathway]);
  const storageKey = `laurem:nurse-interview:draft:${pathway}:${windowSafePath()}`;
  const currentQuestion = questions[questionIndex];
  const answered = questions.filter((question) => answers[question.id]?.trim()).length;
  const remaining = questions.length - answered;
  const progress = questions.length ? Math.round((answered / questions.length) * 100) : 0;

  useEffect(() => {
    try {
      const raw = window.sessionStorage.getItem(storageKey);
      if (raw) {
        const saved = JSON.parse(raw) as { answers?: Record<string, string>; questionIndex?: number };
        if (saved.answers) setAnswers(saved.answers);
        if (typeof saved.questionIndex === 'number') setQuestionIndex(Math.min(Math.max(saved.questionIndex, 0), questions.length - 1));
      }
    } catch {
      setAnswers({});
    }
  }, [storageKey, questions.length]);

  function save(next: Record<string, string>, nextIndex = questionIndex) {
    setAnswers(next);
    setError(null);
    try {
      window.sessionStorage.setItem(storageKey, JSON.stringify({ answers: next, questionIndex: nextIndex }));
      setSavedAt(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    } catch {
      setSavedAt(null);
    }
  }

  function goTo(index: number) {
    const next = Math.min(Math.max(index, 0), questions.length - 1);
    setQuestionIndex(next);
    try {
      window.sessionStorage.setItem(storageKey, JSON.stringify({ answers, questionIndex: next }));
    } catch {
      // The interview remains usable even when session storage is unavailable.
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function nextQuestion() {
    if (!currentQuestion?.id) return;
    if (!answers[currentQuestion.id]?.trim()) {
      setError('Take your time. Add your answer before moving on.');
      return;
    }
    setError(null);
    goTo(questionIndex + 1);
  }

  function restart() {
    setAnswers({});
    setQuestionIndex(0);
    setReviewMode(false);
    setError(null);
    setSavedAt(null);
    try { window.sessionStorage.removeItem(storageKey); } catch { /* continue without storage */ }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function submit() {
    setError(null);
    const unanswered = questions.filter((question) => !answers[question.id]?.trim());
    if (unanswered.length) {
      setError(`You have ${unanswered.length} question${unanswered.length === 1 ? '' : 's'} left. Use Review to find them.`);
      setReviewMode(true);
      return;
    }

    try {
      const response = await fetch('/api/applications/interview', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-invitation-token': token },
        body: JSON.stringify({ pathway, answers }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Unable to submit your interview.');
      setSubmitted(true);
      window.sessionStorage.removeItem(storageKey);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to submit your interview.');
    }
  }

  if (submitted) {
    return <main className="wrap" style={{ padding: '80px 0' }}><section className="card" style={{ padding: 36, textAlign: 'center' }}><p style={{ color: 'var(--accent)', fontWeight: 800 }}>INTERVIEW RECEIVED</p><h1>Thank you.</h1><p style={{ color: 'var(--muted)', lineHeight: 1.7 }}>Your nursing interview responses have been submitted to {lauremCompany.tradingName}. The recruitment team will contact you about the next stage.</p></section></main>;
  }

  if (reviewMode) {
    return <main className="wrap" style={{ padding: '42px 0 80px', maxWidth: 900 }}><section className="card" style={{ padding: 30 }}><p style={{ color: 'var(--accent)', letterSpacing: '.08em', fontWeight: 800, fontSize: 12 }}>YOUR PROGRESS</p><h1 style={{ margin: '8px 0' }}>Review your answers</h1><p style={{ color: 'var(--muted)', lineHeight: 1.6 }}>Nothing here is timed. Open any question to change your answer. Submit when everything feels complete.</p>{error && <div role="alert" style={{ marginTop: 14, padding: 14, borderRadius: 10, background: '#fff8f8', border: '1px solid #dfb4b4', color: '#8a2323' }}>{error}</div>}<div style={{ display: 'grid', gap: 10, marginTop: 22 }}>{questions.map((question, index) => <button type="button" key={question.id} onClick={() => { setReviewMode(false); goTo(index); }} style={{ textAlign: 'left', padding: 16, border: '1px solid var(--line)', borderRadius: 12, background: answers[question.id]?.trim() ? 'var(--soft)' : 'white', color: 'var(--ink)' }}><span style={{ color: 'var(--accent)', fontWeight: 800, marginRight: 8 }}>Q{index + 1}</span><strong>{answers[question.id]?.trim() ? 'Answered' : 'Needs an answer'}</strong><span style={{ display: 'block', marginTop: 5, lineHeight: 1.45 }}>{question.text}</span></button>)}</div><div style={{ marginTop: 22, display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}><div><span style={{ color: 'var(--muted)' }}>{answered} of {questions.length} answered</span> <button type="button" onClick={restart} style={{ ...secondaryButton, marginLeft: 10 }}>Start again</button></div>{remaining === 0 && <button type="button" onClick={submit} style={primaryButton}>Submit interview</button>}</div></section></main>;
  }

  return <main className="wrap" style={{ padding: '42px 0 80px', maxWidth: 900 }}>
    <section className="card" style={{ padding: 30, marginBottom: 18 }}>
      <p style={{ color: 'var(--accent)', letterSpacing: '.1em', fontWeight: 800, fontSize: 12 }}>{lauremCompany.tradingName.toUpperCase()} · NURSE INTERVIEW</p>
      <h1 style={{ fontSize: 42, margin: '8px 0' }}>Let’s take this one question at a time.</h1>
      <p style={{ color: 'var(--muted)', lineHeight: 1.65, maxWidth: 760 }}>You have {questions.length} focused questions. There is no timer. Your answers are saved while this page is open, so you can pause without losing your place.</p>
      <div style={{ marginTop: 18, height: 8, background: 'var(--line)', borderRadius: 99, overflow: 'hidden' }} aria-hidden="true"><div style={{ width: `${progress}%`, height: '100%', background: 'var(--accent)', transition: 'width .2s ease' }} /></div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginTop: 9, color: 'var(--muted)', fontSize: 13 }}><span>{answered} of {questions.length} answered</span><span>{savedAt ? `Saved ${savedAt}` : 'Ready when you are'}</span></div>
    </section>

    {error && <div role="alert" aria-live="assertive" className="card" style={{ padding: 14, marginBottom: 14, border: '1px solid #dfb4b4', background: '#fff8f8', color: '#8a2323' }}>{error}</div>}

    {currentQuestion && <section className="card" style={{ padding: 28 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'baseline' }}><span style={{ color: 'var(--accent)', fontWeight: 800 }}>Question {questionIndex + 1} of {questions.length}</span><span style={{ color: 'var(--muted)', fontSize: 13, fontWeight: 700 }}>{currentQuestion.category}</span></div>
      <h2 style={{ fontSize: 27, lineHeight: 1.4, margin: '16px 0 10px' }}>{currentQuestion.text}</h2>
      <p style={{ color: 'var(--muted)', lineHeight: 1.6, marginBottom: 16 }}>Answer naturally. We are interested in how you think and work, not in perfect wording.</p>
      {currentQuestion.guidance && <div style={{ padding: 14, borderRadius: 10, background: 'var(--soft)', color: 'var(--muted)', lineHeight: 1.55, marginBottom: 16 }}><strong>Think about:</strong> {currentQuestion.guidance}</div>}
      <textarea aria-label={`Answer to question ${questionIndex + 1}`} value={answers[currentQuestion.id] || ''} onChange={(event) => save({ ...answers, [currentQuestion.id]: event.target.value })} rows={9} autoFocus placeholder="Write naturally. A few clear paragraphs are enough." style={{ width: '100%', resize: 'vertical', minHeight: 210, border: '1px solid var(--line)', borderRadius: 12, padding: 16, font: 'inherit', lineHeight: 1.6 }} />
    </section>}

    <section className="card" style={{ padding: 18, marginTop: 16, position: 'sticky', bottom: 14 }}><div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}><button type="button" onClick={() => goTo(questionIndex - 1)} disabled={questionIndex === 0} style={secondaryButton}>Back</button><button type="button" onClick={() => setReviewMode(true)} style={secondaryButton}>Review answers</button>{questionIndex < questions.length - 1 ? <button type="button" onClick={nextQuestion} style={primaryButton}>Next question</button> : <button type="button" onClick={() => { if (remaining) setReviewMode(true); else submit(); }} style={primaryButton}>{remaining ? 'Review & submit' : 'Submit interview'}</button>}</div></section>
  </main>;
}

function windowSafePath() {
  if (typeof window === 'undefined') return 'server';
  return window.location.pathname.replace(/[^a-zA-Z0-9_-]/g, '_').slice(-80);
}

const primaryButton = { background: 'var(--ink)', color: 'white', border: 0, padding: '12px 18px', borderRadius: 9, fontWeight: 800 };
const secondaryButton = { background: 'white', color: 'var(--ink)', border: '1px solid var(--line)', padding: '12px 18px', borderRadius: 9, fontWeight: 800 };
