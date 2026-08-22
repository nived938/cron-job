import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import cron from 'node-cron';
import { createClient } from '@supabase/supabase-js';

const app = express();
const port = Number(process.env.PORT || 10000);
const supabase = createClient(process.env.SUPABASE_URL || '', process.env.SUPABASE_SERVICE_ROLE_KEY || '');
const activeTasks = new Map();

app.use(cors({ origin: process.env.FRONTEND_URL ? process.env.FRONTEND_URL.split(',') : true }));
app.use(express.json({ limit: '256kb' }));

async function auth(req, res, next) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ error: 'Missing access token' });
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return res.status(401).json({ error: 'Invalid access token' });
  req.user = data.user;
  next();
}

function validUrl(value) {
  try {
    const u = new URL(value);
    return ['http:', 'https:'].includes(u.protocol);
  } catch { return false; }
}

async function executeJob(job) {
  const started = Date.now();
  let status = 'failed';
  let statusCode = null;
  let errorMessage = null;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), Number(process.env.REQUEST_TIMEOUT_MS || 30000));
    const response = await fetch(job.url, {
      method: job.method || 'GET',
      headers: job.headers || {},
      body: ['GET','HEAD'].includes(job.method || 'GET') ? undefined : (job.body || undefined),
      signal: controller.signal,
      redirect: 'follow'
    });
    clearTimeout(timeout);
    statusCode = response.status;
    await response.text();
    status = response.ok ? 'success' : 'failed';
  } catch (error) {
    errorMessage = error.name === 'AbortError' ? 'Request timed out' : error.message;
  }
  const responseTime = Date.now() - started;
  await supabase.from('job_executions').insert({
    job_id: job.id,
    user_id: job.user_id,
    started_at: new Date(started).toISOString(),
    finished_at: new Date().toISOString(),
    status,
    status_code: statusCode,
    response_time_ms: responseTime,
    error_message: errorMessage
  });
  await supabase.from('cron_jobs').update({ last_run_at: new Date().toISOString(), last_status: status }).eq('id', job.id);
  return { status, statusCode, responseTime, errorMessage };
}

function scheduleJob(job) {
  if (activeTasks.has(job.id)) activeTasks.get(job.id).stop();
  if (!job.enabled || !cron.validate(job.schedule)) return;
  const task = cron.schedule(job.schedule, () => executeJob(job).catch(console.error), { timezone: job.timezone || 'UTC' });
  activeTasks.set(job.id, task);
}

async function loadSchedules() {
  const { data, error } = await supabase.from('cron_jobs').select('*').eq('enabled', true);
  if (error) return console.error('Could not load schedules:', error.message);
  data.forEach(scheduleJob);
  console.log(`Loaded ${data.length} active cron jobs`);
}

app.get('/health', (_req, res) => res.json({ ok: true, service: 'cronflow-api', time: new Date().toISOString() }));

app.get('/api/jobs', auth, async (req, res) => {
  const { data, error } = await supabase.from('cron_jobs').select('*').eq('user_id', req.user.id).order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
});

app.post('/api/jobs', auth, async (req, res) => {
  const { name, url, method = 'GET', schedule, timezone = 'UTC', headers = {}, body = null } = req.body || {};
  if (!name || !url || !schedule) return res.status(400).json({ error: 'name, url and schedule are required' });
  if (!validUrl(url)) return res.status(400).json({ error: 'Only HTTP and HTTPS URLs are supported' });
  if (!cron.validate(schedule)) return res.status(400).json({ error: 'Invalid cron expression' });
  if (!['GET','POST','PUT','PATCH','DELETE','HEAD'].includes(method)) return res.status(400).json({ error: 'Unsupported HTTP method' });
  const { data, error } = await supabase.from('cron_jobs').insert({ user_id: req.user.id, name, url, method, schedule, timezone, headers, body, enabled: true }).select().single();
  if (error) return res.status(500).json({ error: error.message });
  scheduleJob(data);
  res.status(201).json(data);
});

app.patch('/api/jobs/:id', auth, async (req, res) => {
  const allowed = ['name','url','method','schedule','timezone','headers','body','enabled'];
  const updates = Object.fromEntries(Object.entries(req.body || {}).filter(([key]) => allowed.includes(key)));
  if (updates.url && !validUrl(updates.url)) return res.status(400).json({ error: 'Invalid URL' });
  if (updates.schedule && !cron.validate(updates.schedule)) return res.status(400).json({ error: 'Invalid cron expression' });
  const { data, error } = await supabase.from('cron_jobs').update(updates).eq('id', req.params.id).eq('user_id', req.user.id).select().single();
  if (error) return res.status(404).json({ error: 'Job not found' });
  scheduleJob(data);
  res.json(data);
});

app.delete('/api/jobs/:id', auth, async (req, res) => {
  if (activeTasks.has(req.params.id)) { activeTasks.get(req.params.id).stop(); activeTasks.delete(req.params.id); }
  const { error } = await supabase.from('cron_jobs').delete().eq('id', req.params.id).eq('user_id', req.user.id);
  if (error) return res.status(500).json({ error: error.message });
  res.status(204).end();
});

app.post('/api/jobs/:id/run', auth, async (req, res) => {
  const { data: job, error } = await supabase.from('cron_jobs').select('*').eq('id', req.params.id).eq('user_id', req.user.id).single();
  if (error || !job) return res.status(404).json({ error: 'Job not found' });
  executeJob(job).catch(console.error);
  res.status(202).json({ queued: true });
});

app.get('/api/executions', auth, async (req, res) => {
  const { data, error } = await supabase.from('job_executions').select('*, cron_jobs(name)').eq('user_id', req.user.id).order('started_at', { ascending: false }).limit(100);
  if (error) return res.status(500).json({ error: error.message });
  res.json((data || []).map(x => ({ ...x, job_name: x.cron_jobs?.name })));
});

app.listen(port, '0.0.0.0', async () => {
  console.log(`CronFlow API running on port ${port}`);
  if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) await loadSchedules();
});
