'use client';

import { useEffect, useMemo, useState } from 'react';
import LauremCandidateJourney from '@/components/LauremCandidateJourney';

export default function InterviewPage({ params }: { params: Promise<{ token: string }> }) {
  const [token, setToken] = useState('');
  const [attemptId, setAttemptId] = useState('');
  const [role, setRole] = useState('');
  const [questions, setQuestions] = useState<Array<{ id:string; category:string; text:string; options:string[] }>>([]);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [result, setResult] = useState<{ score:number; totalQuestions:number; percent:number; passed:boolean; secondInterviewIssued:boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { params.then((p) => setToken(p.token)); }, [params]);

  const storageKey = useMemo(() => token ? `laurem:round1:${token.slice(0,16)}` : '', [token]);
  useEffect(() => {
    if (!token) return;
    let active = true;
    async function load() {
      setLoading(true);
      try {
        const response = await fetch('/api/interview', { headers: { 'x-invitation-token': token }, cache: 'no-store' });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || 'Unable to load your assessment.');
        if (!active) return;
        setAttemptId(body.attemptId); setRole(body.role); setQuestions(body.questions || []);
        if (body.status === 'passed' || body.status === 'failed' || body.status === 'submitted') setSubmitted(true);
        try {
          const raw = window.sessionStorage.getItem(storageKey);
          if (raw) {
            const saved = JSON.parse(raw) as { answers?:Record<string,number>; index?:number };
            if (saved.answers) setAnswers(saved.answers);
            if (typeof saved.index === 'number') setIndex(Math.max(0, Math.min(saved.index, (body.questions || []).length - 1)));
          }
        } catch { /* continue */ }
      } catch (e) { if (active) setError(e instanceof Error ? e.message : 'Unable to load your assessment.'); }
      finally { if (active) setLoading(false); }
    }
    void load();
    return () => { active = false; };
  }, [token, storageKey]);

  const current = questions[index];
  const answered = questions.filter((q) => Number.isInteger(answers[q.id])).length;

  function selectAnswer(value:number) {
    if (!current) return;
    const next = { ...answers, [current.id]: value };
    setAnswers(next); setError(null);
    try { window.sessionStorage.setItem(storageKey, JSON.stringify({ answers: next, index })); } catch { /* continue */ }
  }

  function go(next:number) {
    const safe = Math.max(0, Math.min(next, questions.length - 1));
    setIndex(safe);
    try { window.sessionStorage.setItem(storageKey, JSON.stringify({ answers, index: safe })); } catch { /* continue */ }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function submit() {
    if (saving || !attemptId) return;
    if (answered !== questions.length) { setError(`You still have ${questions.length - answered} question${questions.length - answered === 1 ? '' : 's'} to answer.`); return; }
    setSaving(true); setError(null);
    try {
      const response = await fetch('/api/interview', { method:'POST', headers:{'content-type':'application/json','x-invitation-token':token}, body:JSON.stringify({ attemptId, answers }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Unable to submit your assessment.');
      setResult(body); setSubmitted(true);
      try { window.sessionStorage.removeItem(storageKey); } catch { /* continue */ }
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to submit your assessment.'); }
    finally { setSaving(false); }
  }

  if (loading) return <main className="wrap" style={{ padding:'80px 0', maxWidth:900 }}><section className="card" style={{ padding:32, textAlign:'center' }}><p style={{color:'var(--muted)'}}>Preparing your questions…</p></section></main>;
  if (error && !questions.length) return <main className="wrap" style={{ padding:'80px 0', maxWidth:900 }}><section className="card" style={{ padding:32, textAlign:'center' }}><h1>We couldn't open your assessment</h1><p style={{color:'var(--muted)',lineHeight:1.6}}>{error}</p></section></main>;

  if (submitted || result) return <main className="wrap" style={{ padding:'70px 0 90px', maxWidth:900 }}><LauremCandidateJourney current="interview1" /><section className="card" style={{ padding:34, textAlign:'center' }}><p style={{color:'var(--accent)',fontWeight:800,letterSpacing:'.08em'}}>INTERVIEW 1 COMPLETE</p><h1>{result?.passed ? 'Well done. You have reached the next stage.' : result?.passed === false ? 'Thank you for completing the assessment.' : 'Your assessment has already been submitted.'}</h1>{result ? <><div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))',gap:10,margin:'26px 0'}}><Metric label="Score" value={`${result.score}/${result.totalQuestions}`} /><Metric label="Result" value={`${result.percent}%`} /><Metric label="Pass mark" value="80%" /></div><p style={{color:'var(--muted)',lineHeight:1.7}}>{result.passed ? 'Your Interview 2 has been created automatically. Check your email for the private link.' : 'The recruitment team will retain your result as part of the recruitment process.'}</p></> : <p style={{color:'var(--muted)',lineHeight:1.7}}>Your assessment status is already recorded. Please use the latest recruitment link you received.</p>}</section></main>;

  return <main className="wrap" style={{ padding:'38px 0 80px', maxWidth:900 }}><LauremCandidateJourney current="interview1" compact />
    <section className="card" style={{padding:30,marginBottom:16}}>
      <p style={{color:'var(--accent)',fontWeight:800,letterSpacing:'.08em',fontSize:12}}>CONAGS CARE · INTERVIEW 1</p>
      <h1 style={{margin:'8px 0'}}>A few quick questions about how you work.</h1>
      <p style={{color:'var(--muted)',lineHeight:1.65,maxWidth:740}}>This is the first stage for your <strong>{role}</strong> application. You will answer {questions.length} short questions selected for you from our question bank. There is no timer. Take your time and choose the answer that best matches safe, respectful practice.</p>
      <div style={{height:8,background:'var(--line)',borderRadius:99,overflow:'hidden',marginTop:18}}><div style={{width:`${Math.round(answered/questions.length*100)}%`,height:'100%',background:'var(--accent)',transition:'width .2s ease'}} /></div>
      <div style={{display:'flex',justifyContent:'space-between',gap:12,marginTop:9,fontSize:13,color:'var(--muted)',flexWrap:'wrap'}}><span>{answered} of {questions.length} answered</span><span>No timer</span></div>
    </section>
    {error && <div role="alert" className="card" style={{padding:14,marginBottom:14,border:'1px solid #dfb4b4',background:'#fff8f8',color:'#8a2323'}}>{error}</div>}
    <section className="card" style={{padding:28}}>
      {current && <><div style={{display:'flex',justifyContent:'space-between',gap:12,flexWrap:'wrap',alignItems:'baseline'}}><span style={{color:'var(--accent)',fontWeight:800}}>Question {index+1} of {questions.length}</span><span style={{color:'var(--muted)',fontSize:13,fontWeight:700}}>{current.category}</span></div><h2 style={{fontSize:27,lineHeight:1.4,margin:'16px 0 20px'}}>{current.text}</h2><div style={{display:'grid',gap:10}}>{current.options.map((option,optionIndex)=><button key={optionIndex} type="button" onClick={()=>selectAnswer(optionIndex)} aria-pressed={answers[current.id]===optionIndex} style={{textAlign:'left',padding:'16px 18px',border:'1px solid var(--line)',borderRadius:12,background:answers[current.id]===optionIndex?'var(--soft)':'white',color:'var(--ink)',fontWeight:answers[current.id]===optionIndex?800:500}}><span style={{display:'inline-flex',width:28,height:28,borderRadius:'50%',border:'1px solid currentColor',alignItems:'center',justifyContent:'center',marginRight:10}}>{String.fromCharCode(65+optionIndex)}</span>{option}</button>)}</div></>}
    </section>
    <section className="card" style={{padding:18,marginTop:16,position:'sticky',bottom:14}}><div style={{display:'flex',justifyContent:'space-between',gap:10,alignItems:'center',flexWrap:'wrap'}}><button type="button" onClick={()=>go(index-1)} disabled={index===0} style={secondaryButton}>Back</button><span style={{color:'var(--muted)',fontSize:13}}>{answered}/{questions.length} answered</span>{index<questions.length-1?<button type="button" onClick={()=>go(index+1)} disabled={!Number.isInteger(answers[current?.id || ''])} style={primaryButton}>Next</button>:<button type="button" onClick={submit} disabled={saving} style={primaryButton}>{saving?'Submitting…':'Submit assessment'}</button>}</div></section>
  </main>;
}

function Metric({label,value}:{label:string;value:string}){return <div style={{padding:16,border:'1px solid var(--line)',borderRadius:12}}><div style={{fontSize:12,color:'var(--muted)'}}>{label}</div><div style={{fontSize:24,fontWeight:800,marginTop:4}}>{value}</div></div>}
const primaryButton={background:'var(--ink)',color:'white',border:0,padding:'12px 18px',borderRadius:9,fontWeight:800};
const secondaryButton={background:'white',color:'var(--ink)',border:'1px solid var(--line)',padding:'12px 18px',borderRadius:9,fontWeight:800};
