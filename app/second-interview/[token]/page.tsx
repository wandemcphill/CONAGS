'use client';

import { useEffect, useState } from 'react';
import LauremCandidateJourney from '@/components/LauremCandidateJourney';

export default function SecondInterviewPage({ params }: { params: Promise<{ token: string }> }) {
  const [token,setToken]=useState('');
  const [attemptId,setAttemptId]=useState('');
  const [role,setRole]=useState('');
  const [questions,setQuestions]=useState<Array<{id:string;category:string;text:string;guidance?:string}>>([]);
  const [answers,setAnswers]=useState<Record<string,string>>({});
  const [index,setIndex]=useState(0);
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [done,setDone]=useState(false);
  const [error,setError]=useState<string|null>(null);

  useEffect(()=>{params.then(p=>setToken(p.token));},[params]);
  useEffect(()=>{
    if(!token)return;
    let active=true;
    async function load(){
      setLoading(true);
      try{const response=await fetch('/api/second-interview',{headers:{'x-second-interview-token':token},cache:'no-store'});const body=await response.json();if(!response.ok)throw new Error(body.error||'Unable to load your second-stage assessment.');if(!active)return;setAttemptId(body.attemptId);setRole(body.role);setQuestions(body.questions||[]);setAnswers(body.answers||{});if(body.status==='submitted')setDone(true);}catch(e){if(active)setError(e instanceof Error?e.message:'Unable to load your second-stage assessment.');}finally{if(active)setLoading(false);}}
    void load(); return()=>{active=false;};
  },[token]);

  const current=questions[index];
  const answered=questions.filter(q=>answers[q.id]?.trim()).length;
  function saveAnswer(value:string){if(!current)return;setAnswers({...answers,[current.id]:value});setError(null);}
  function go(next:number){setIndex(Math.max(0,Math.min(next,questions.length-1)));window.scrollTo({top:0,behavior:'smooth'});}
  async function submit(){
    if(saving)return;
    if(answered!==questions.length){setError(`You still have ${questions.length-answered} question${questions.length-answered===1?'':'s'} to answer.`);return;}
    setSaving(true);setError(null);
    try{const response=await fetch('/api/second-interview',{method:'POST',headers:{'content-type':'application/json','x-second-interview-token':token},body:JSON.stringify({attemptId,answers})});const body=await response.json();if(!response.ok)throw new Error(body.error||'Unable to submit your second-stage assessment.');setDone(true);}catch(e){setError(e instanceof Error?e.message:'Unable to submit your second-stage assessment.');}finally{setSaving(false);}
  }

  if(loading)return <main className="wrap" style={{padding:'80px 0',maxWidth:900}}><section className="card" style={{padding:32,textAlign:'center'}}><p style={{color:'var(--muted)'}}>Preparing your second-stage questions…</p></section></main>;
  if(error&&!questions.length)return <main className="wrap" style={{padding:'80px 0',maxWidth:900}}><section className="card" style={{padding:32,textAlign:'center'}}><h1>We couldn't open your second-stage assessment</h1><p style={{color:'var(--muted)',lineHeight:1.6}}>{error}</p></section></main>;
  if(done)return <main className="wrap" style={{padding:'70px 0',maxWidth:900}}><LauremCandidateJourney current="interview2" /><section className="card" style={{padding:34,textAlign:'center'}}><p style={{color:'var(--accent)',fontWeight:800,letterSpacing:'.08em'}}>INTERVIEW 2 COMPLETE</p><h1>Thank you for taking the time.</h1><p style={{color:'var(--muted)',lineHeight:1.7}}>Your answers have been submitted securely. The Conags recruitment team will review this practical and theory stage and contact you about the next step.</p></section></main>;

  return <main className="wrap" style={{padding:'38px 0 80px',maxWidth:900}}><LauremCandidateJourney current="interview2" compact />
    <section className="card" style={{padding:30,marginBottom:16}}><p style={{color:'var(--accent)',fontWeight:800,letterSpacing:'.08em',fontSize:12}}>CONAGS CARE · INTERVIEW 2</p><h1 style={{margin:'8px 0'}}>Let's talk about how you would handle the job.</h1><p style={{color:'var(--muted)',lineHeight:1.65}}>This stage is tailored to the <strong>{role}</strong> role. You will see {questions.length} practical and theory-based scenarios selected from our question bank. There is no timer. Explain your thinking in your own words.</p><div style={{height:8,background:'var(--line)',borderRadius:99,overflow:'hidden',marginTop:18}}><div style={{width:`${Math.round(answered/questions.length*100)}%`,height:'100%',background:'var(--accent)'}}/></div><div style={{display:'flex',justifyContent:'space-between',marginTop:9,fontSize:13,color:'var(--muted)'}}><span>{answered} of {questions.length} answered</span><span>No timer</span></div></section>
    {error&&<div role="alert" className="card" style={{padding:14,marginBottom:14,border:'1px solid #dfb4b4',background:'#fff8f8',color:'#8a2323'}}>{error}</div>}
    <section className="card" style={{padding:28}}>{current&&<><div style={{display:'flex',justifyContent:'space-between',gap:12,flexWrap:'wrap'}}><span style={{color:'var(--accent)',fontWeight:800}}>Question {index+1} of {questions.length}</span><span style={{color:'var(--muted)',fontSize:13,fontWeight:700}}>{current.category}</span></div><h2 style={{fontSize:27,lineHeight:1.4,margin:'16px 0 10px'}}>{current.text}</h2>{current.guidance&&<div style={{padding:14,borderRadius:10,background:'var(--soft)',color:'var(--muted)',lineHeight:1.55,marginBottom:16}}><strong>Think about:</strong> {current.guidance}</div>}<textarea autoFocus aria-label={`Answer to question ${index+1}`} value={answers[current.id]||''} onChange={e=>saveAnswer(e.target.value)} rows={9} placeholder="Take your time. A few clear paragraphs are enough." style={{width:'100%',resize:'vertical',minHeight:220,border:'1px solid var(--line)',borderRadius:12,padding:16,font:'inherit',lineHeight:1.6}}/></>}</section>
    <section className="card" style={{padding:18,marginTop:16,position:'sticky',bottom:14}}><div style={{display:'flex',justifyContent:'space-between',gap:10,alignItems:'center',flexWrap:'wrap'}}><button type="button" onClick={()=>go(index-1)} disabled={index===0} style={secondaryButton}>Back</button><span style={{fontSize:13,color:'var(--muted)'}}>{answered}/{questions.length} answered</span>{index<questions.length-1?<button type="button" onClick={()=>go(index+1)} disabled={!answers[current?.id||'']?.trim()} style={primaryButton}>Next</button>:<button type="button" onClick={submit} disabled={saving} style={primaryButton}>{saving?'Submitting…':'Submit second stage'}</button>}</div></section>
  </main>;
}
const primaryButton={background:'var(--ink)',color:'white',border:0,padding:'12px 18px',borderRadius:9,fontWeight:800};
const secondaryButton={background:'white',color:'var(--ink)',border:'1px solid var(--line)',padding:'12px 18px',borderRadius:9,fontWeight:800};
