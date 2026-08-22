import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import { supabase } from './supabase';

const API = import.meta.env.VITE_API_URL || 'http://localhost:10000';

function App() {
  const [session, setSession] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [view, setView] = useState('dashboard');
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: '', url: '', method: 'GET', schedule: '*/5 * * * *', timezone: Intl.DateTimeFormat().resolvedOptions().timeZone });

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session) loadJobs();
  }, [session]);

  async function loadJobs() {
    try {
      const response = await fetch(`${API}/api/jobs`, { headers: { Authorization: `Bearer ${session.access_token}` } });
      if (response.ok) setJobs(await response.json());
    } catch {}
  }

  async function createJob(e) {
    e.preventDefault();
    setLoading(true);
    try {
      const response = await fetch(`${API}/api/jobs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify(form)
      });
      if (!response.ok) throw new Error(await response.text());
      setShowCreate(false);
      setForm({ name: '', url: '', method: 'GET', schedule: '*/5 * * * *', timezone: Intl.DateTimeFormat().resolvedOptions().timeZone });
      await loadJobs();
    } catch (error) {
      alert(error.message || 'Could not create job');
    } finally { setLoading(false); }
  }

  async function toggleJob(job) {
    await fetch(`${API}/api/jobs/${job.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ enabled: !job.enabled })
    });
    loadJobs();
  }

  async function runJob(job) {
    await fetch(`${API}/api/jobs/${job.id}/run`, { method: 'POST', headers: { Authorization: `Bearer ${session.access_token}` } });
    alert('Job queued for execution.');
  }

  async function deleteJob(job) {
    if (!confirm(`Delete ${job.name}?`)) return;
    await fetch(`${API}/api/jobs/${job.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${session.access_token}` } });
    loadJobs();
  }

  async function login() {
    const email = prompt('Email address');
    if (!email) return;
    const password = prompt('Password');
    if (!password) return;
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) alert(error.message);
  }

  async function signup() {
    const email = prompt('Email address');
    if (!email) return;
    const password = prompt('Password, minimum 6 characters');
    if (!password) return;
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) alert(error.message); else alert('Account created. Check your email if confirmation is enabled.');
  }

  if (!session) return <Landing onLogin={login} onSignup={signup} />;

  const active = jobs.filter(j => j.enabled).length;
  const failed = jobs.filter(j => j.last_status === 'failed').length;

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><span className="brand-mark">C</span><span>CronFlow</span></div>
      <nav>
        <button className={view === 'dashboard' ? 'nav active' : 'nav'} onClick={() => setView('dashboard')}>⌂ <span>Dashboard</span></button>
        <button className={view === 'jobs' ? 'nav active' : 'nav'} onClick={() => setView('jobs')}>◷ <span>Cron Jobs</span></button>
        <button className={view === 'history' ? 'nav active' : 'nav'} onClick={() => setView('history')}>↻ <span>Execution History</span></button>
        <button className="nav" onClick={() => setView('settings')}>⚙ <span>Settings</span></button>
      </nav>
      <div className="sidebar-bottom">
        <div className="plan-card"><small>PLAN</small><strong>Free</strong><span>{jobs.length} jobs created</span></div>
        <button className="logout" onClick={() => supabase.auth.signOut()}>Sign out</button>
      </div>
    </aside>

    <main className="main">
      <header className="topbar"><div><p className="eyebrow">AUTOMATION</p><h1>{view === 'dashboard' ? 'Dashboard' : view === 'jobs' ? 'Cron Jobs' : view === 'history' ? 'Execution History' : 'Settings'}</h1></div><div className="top-actions"><span className="status-dot">● All systems operational</span><button className="avatar">{session.user.email?.[0]?.toUpperCase()}</button></div></header>

      {view === 'settings' ? <Settings session={session} /> : view === 'history' ? <History session={session} api={API} /> : <>
        <section className="stats">
          <Stat label="Total Jobs" value={jobs.length} icon="◫" />
          <Stat label="Active Jobs" value={active} icon="✓" />
          <Stat label="Failed Jobs" value={failed} icon="!" />
          <Stat label="Uptime" value="99.9%" icon="↗" />
        </section>
        <section className="panel jobs-panel">
          <div className="panel-head"><div><h2>{view === 'jobs' ? 'All Cron Jobs' : 'Your Cron Jobs'}</h2><p>HTTP requests scheduled by your account.</p></div><button className="primary" onClick={() => setShowCreate(true)}>＋ Create Cron Job</button></div>
          {jobs.length === 0 ? <Empty onCreate={() => setShowCreate(true)} /> : <div className="table-wrap"><table><thead><tr><th>Job</th><th>Schedule</th><th>Method</th><th>Status</th><th>Last Run</th><th>Actions</th></tr></thead><tbody>{jobs.map(job => <tr key={job.id}><td><div className="job-name"><span className="job-icon">◉</span><div><strong>{job.name}</strong><small>{job.url}</small></div></div></td><td><code>{job.schedule}</code></td><td><span className="method">{job.method}</span></td><td><button className={job.enabled ? 'toggle on' : 'toggle'} onClick={() => toggleJob(job)}><span></span>{job.enabled ? 'Active' : 'Paused'}</button></td><td>{job.last_run_at ? new Date(job.last_run_at).toLocaleString() : 'Never'}</td><td><div className="row-actions"><button title="Run now" onClick={() => runJob(job)}>▶</button><button title="Delete" onClick={() => deleteJob(job)}>⌫</button></div></td></tr>)}</tbody></table></div>}
        </section>
      </>}
    </main>

    {showCreate && <div className="modal-backdrop" onMouseDown={() => setShowCreate(false)}><form className="modal" onSubmit={createJob} onMouseDown={e => e.stopPropagation()}><div className="modal-head"><div><p className="eyebrow">NEW AUTOMATION</p><h2>Create Cron Job</h2></div><button type="button" className="close" onClick={() => setShowCreate(false)}>×</button></div><label>Job name<input required value={form.name} onChange={e => setForm({...form, name:e.target.value})} placeholder="Website health check" /></label><label>URL<input required type="url" value={form.url} onChange={e => setForm({...form, url:e.target.value})} placeholder="https://example.com/api/health" /></label><div className="form-grid"><label>Method<select value={form.method} onChange={e => setForm({...form, method:e.target.value})}>{['GET','POST','PUT','PATCH','DELETE'].map(m=><option key={m}>{m}</option>)}</select></label><label>Schedule<select value={form.schedule} onChange={e => setForm({...form, schedule:e.target.value})}><option value="* * * * *">Every minute</option><option value="*/5 * * * *">Every 5 minutes</option><option value="*/15 * * * *">Every 15 minutes</option><option value="0 * * * *">Every hour</option><option value="0 0 * * *">Every day</option><option value="0 0 * * 0">Every week</option><option value="0 0 1 * *">Every month</option></select></label></div><label>Timezone<input value={form.timezone} onChange={e => setForm({...form, timezone:e.target.value})} /></label><div className="cron-help">Cron expression: <code>{form.schedule}</code></div><button className="primary full" disabled={loading}>{loading ? 'Creating...' : 'Create Job'}</button></form></div>}
  </div>;
}

function Stat({label,value,icon}) { return <div className="stat"><div className="stat-icon">{icon}</div><div><span>{label}</span><strong>{value}</strong></div></div> }
function Empty({onCreate}) { return <div className="empty"><div className="empty-icon">◷</div><h3>No cron jobs yet</h3><p>Create your first scheduled HTTP request and CronFlow will execute it automatically.</p><button className="primary" onClick={onCreate}>Create your first job</button></div> }
function Landing({onLogin,onSignup}) { return <div className="landing"><header className="landing-nav"><div className="brand"><span className="brand-mark">C</span>CronFlow</div><div><button className="ghost" onClick={onLogin}>Log in</button><button className="primary" onClick={onSignup}>Get started</button></div></header><section className="hero"><div className="hero-badge">● SIMPLE HTTP CRON SCHEDULER</div><h1>Automate your web tasks.<br/><em>Set it and forget it.</em></h1><p>Schedule HTTP requests, monitor every execution, and keep your APIs running automatically. Built for developers who want a clean, reliable cron service.</p><div className="hero-buttons"><button className="primary large" onClick={onSignup}>Create free account →</button><button className="ghost large" onClick={onLogin}>I already have an account</button></div></section><section className="feature-grid"><Feature icon="◷" title="Flexible schedules" text="From every minute to custom cron expressions and timezones."/><Feature icon="↻" title="Execution history" text="See every request, response code, latency, and failure."/><Feature icon="✓" title="Reliable monitoring" text="Know when your scheduled jobs succeed or fail."/></section></div> }
function Feature({icon,title,text}) { return <div className="feature"><span>{icon}</span><h3>{title}</h3><p>{text}</p></div> }
function Settings({session}) { return <section className="panel settings"><h2>Account settings</h2><p>Signed in as <strong>{session.user.email}</strong></p><div className="setting-row"><span>Account ID</span><code>{session.user.id}</code></div><div className="setting-row"><span>Timezone</span><strong>{Intl.DateTimeFormat().resolvedOptions().timeZone}</strong></div></section> }
function History({api,session}) { const [data,setData]=useState([]); useEffect(()=>{fetch(`${api}/api/executions`,{headers:{Authorization:`Bearer ${session.access_token}`}}).then(r=>r.ok?r.json():[]).then(setData).catch(()=>{})},[]); return <section className="panel"><div className="panel-head"><div><h2>Execution History</h2><p>Recent requests from all your cron jobs.</p></div></div>{data.length ? <div className="table-wrap"><table><thead><tr><th>Job</th><th>Started</th><th>Status</th><th>HTTP</th><th>Duration</th></tr></thead><tbody>{data.map(x=><tr key={x.id}><td>{x.job_name || x.job_id}</td><td>{new Date(x.started_at).toLocaleString()}</td><td>{x.status}</td><td>{x.status_code || '—'}</td><td>{x.response_time_ms ? `${x.response_time_ms} ms` : '—'}</td></tr>)}</tbody></table></div>:<Empty onCreate={()=>{}}/>}</section> }

createRoot(document.getElementById('root')).render(<App />);
