import { getIdToken } from '@/lib/auth';
export async function adventureRequest<T>(body?: unknown, wallet?: string, admin = false): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const controller = new AbortController();
  const timeout = new Promise<never>((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new Error('Adventure access check timed out. Try again.'));},12000);});
  const work = async () => {
  const token = await getIdToken();
  if (controller.signal.aborted) throw new Error('Adventure access check timed out.');
  const response = await fetch(admin ? '/api/admin/adventure' : '/api/adventure', {
    signal: controller.signal,
    method: body ? 'POST' : 'GET',
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(wallet ? { 'x-wallet-address': wallet } : {}), ...(body ? { 'content-type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Adventure is temporarily unavailable.');
  return data as T;
  };
  try { return await Promise.race([work(),timeout]); }
  finally { if(timer!==undefined) clearTimeout(timer); }
}