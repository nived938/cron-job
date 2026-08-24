import crypto from 'crypto';

// CronFlow 3.0 foundation helpers. These are intentionally dependency-free so
// the existing Render deployment can adopt the feature contracts incrementally.
export function createApiKey(prefix = 'cf_live') {
  return `${prefix}_${crypto.randomBytes(32).toString('hex')}`;
}

export function maskSecret(value) {
  if (!value) return '';
  return value.length <= 8 ? '••••••••' : `${value.slice(0, 3)}••••••••${value.slice(-3)}`;
}

export function classifyFailure({ statusCode, errorMessage, responseTimeMs }) {
  if (errorMessage) {
    if (/timeout/i.test(errorMessage)) return { category: 'timeout', severity: 'high' };
    return { category: 'network', severity: 'high' };
  }
  if (statusCode >= 500) return { category: 'server_error', severity: 'high' };
  if (statusCode === 429) return { category: 'rate_limited', severity: 'medium' };
  if (statusCode >= 400) return { category: 'client_error', severity: 'medium' };
  if (responseTimeMs > 5000) return { category: 'slow_response', severity: 'medium' };
  return { category: 'unknown', severity: 'low' };
}

export function calculateSla(successes, total) {
  if (!total) return 100;
  return Number(((successes / total) * 100).toFixed(3));
}

export function detectIncident(history, threshold = 3) {
  const recent = history.slice(0, threshold);
  if (recent.length < threshold) return false;
  return recent.every(item => item.status !== 'success');
}

export function nextEscalation(level, rules) {
  return rules[Math.min(level, Math.max(0, rules.length - 1))] || null;
}
