const API_BASE = '/api';

export async function fetchApi(path: string, options?: RequestInit) {
  const token = localStorage.getItem("token");
  const headers = new Headers(options?.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (!headers.has("Content-Type") && options?.body) headers.set("Content-Type", "application/json");
  
  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  if (!res.ok) throw new Error(`API error: ${res.statusText}`);
  const text = await res.text();
  try { return JSON.parse(text); } catch { return text; }
}

export const getPlans = () => fetchApi('/plans');
export const createPlan = (data: any) => fetchApi('/plans', { method: 'POST', body: JSON.stringify(data) });
export const updatePlan = (id: string, data: any) => fetchApi(`/plans/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deletePlan = (id: string) => fetchApi(`/plans/${id}`, { method: 'DELETE' });
export const runPlanNow = (id: string) => fetchApi(`/plans/${id}/run`, { method: 'POST' });
export const executeRestore = (id: string, password?: string) => fetchApi(`/plans/${id}/restore`, { method: 'POST', body: JSON.stringify({ password }) });
export const checkPlanRemoteData = (id: string) => fetchApi(`/plans/${id}/check_remote_data`);
export const purgePlanRemoteData = (id: string) => fetchApi(`/plans/${id}/purge`, { method: 'POST' });
export const cancelPlan = (id: string) => fetchApi(`/plans/${id}/cancel`, { method: 'POST' });

export const getSources = () => fetchApi('/sources');
export const createSource = (data: any) => fetchApi('/sources', { method: 'POST', body: JSON.stringify(data) });
export const updateSource = (id: string, data: any) => fetchApi(`/sources/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteSource = (id: string) => fetchApi(`/sources/${id}`, { method: 'DELETE' });
export const validateSourcePath = (path: string) => fetchApi('/sources/validate', { method: 'POST', body: JSON.stringify({ path }) });
export const listDirectories = (path: string) => fetchApi('/sources/ls', { method: 'POST', body: JSON.stringify({ path }) });

export const getRemotes = () => fetchApi('/remotes');
export const createRemote = (data: any) => fetchApi('/remotes', { method: 'POST', body: JSON.stringify(data) });
export const updateRemote = (id: string, data: any) => fetchApi(`/remotes/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteRemote = (id: string) => fetchApi(`/remotes/${id}`, { method: 'DELETE' });
export const validateRemoteById = (id: string) => fetchApi(`/remotes/${id}/validate`, { method: 'POST' });
export const verifyRemoteConfig = (type: string, config: any) => fetchApi('/remotes/verify', { method: 'POST', body: JSON.stringify({ type, config }) });

export const getLogs = () => fetchApi('/logs');
export const deleteLog = (id: string) => fetchApi(`/logs/${id}`, { method: 'DELETE' });
export const deleteMultipleLogs = (ids: string[]) => fetchApi('/logs', { method: 'DELETE', body: JSON.stringify({ ids }) });

export const setupAdmin = (username: string, password?: string) => fetchApi('/auth/setup', { method: 'POST', body: JSON.stringify({ username, password }) });
export const markConfigValidated = (id?: string) => fetchApi(`/remotes/${id || 'all'}/mark_validated`, { method: 'POST' });
export const exportDecryptedConfig = (password?: string) => fetchApi('/settings/export', { method: 'POST', body: JSON.stringify({ password }) });
