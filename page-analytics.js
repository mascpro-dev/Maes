/**
 * Regista uma vista de página por sessão (throttle) — só utilizadores autenticados.
 */
const THROTTLE_MS = 45000;

export function currentPagePath() {
  try {
    const raw = typeof window !== 'undefined' ? window.location.pathname || '' : '';
    const parts = raw.split('/').filter(Boolean);
    const last = parts.length ? parts[parts.length - 1] : '';
    return last || 'index.html';
  } catch (_) {
    return 'index.html';
  }
}

export async function trackPageView(supabase) {
  if (!supabase) return;
  try {
    const path = currentPagePath();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.user?.id) return;

    const key = `aura_pv_${path}`;
    const now = Date.now();
    const prev = Number(sessionStorage.getItem(key) || '0');
    if (now - prev < THROTTLE_MS) return;

    const { error } = await supabase.from('app_page_views').insert({
      user_id: session.user.id,
      page_path: path,
    });
    if (!error) sessionStorage.setItem(key, String(now));
  } catch (_) {
    /* tabela opcional até migração aplicada */
  }
}
