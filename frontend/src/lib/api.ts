const BASE = '/api';

export async function reconcile(
  userFile: File,
  exchangeFile: File,
  config: { timestampToleranceSeconds: number; quantityTolerancePct: number }
): Promise<{ runId: string; message: string }> {
  const form = new FormData();
  form.append('userFile', userFile);
  form.append('exchangeFile', exchangeFile);
  form.append('timestampToleranceSeconds', String(config.timestampToleranceSeconds));
  form.append('quantityTolerancePct', String(config.quantityTolerancePct));

  const res = await fetch(`${BASE}/reconcile`, { method: 'POST', body: form });
  if (!res.ok) throw new Error((await res.json()).error ?? 'Failed to start reconciliation');
  return res.json();
}

export async function getReport(
  runId: string,
  params: { category?: string; page?: number; limit?: number } = {}
) {
  const query = new URLSearchParams();
  if (params.category) query.set('category', params.category);
  if (params.page) query.set('page', String(params.page));
  if (params.limit) query.set('limit', String(params.limit));

  const res = await fetch(`${BASE}/report/${runId}?${query}`);
  if (!res.ok) throw new Error('Failed to fetch report');
  return res.json();
}

export async function getSummary(runId: string) {
  const res = await fetch(`${BASE}/report/${runId}/summary`);
  if (!res.ok) throw new Error('Failed to fetch summary');
  return res.json();
}

export async function getRuns() {
  const res = await fetch(`${BASE}/runs`);
  if (!res.ok) throw new Error('Failed to fetch runs');
  return res.json();
}

export function getExportUrl(runId: string, category?: string): string {
  const query = new URLSearchParams({ format: 'csv' });
  if (category) query.set('category', category);
  return `${BASE}/report/${runId}?${query}`;
}