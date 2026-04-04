/**
 * Páginas protegidas: exige sessão Supabase Auth (RLS).
 * Espera: supabase-config.js + auth.js antes deste módulo.
 * window.__auraAuthReady: Promise<boolean> — outros módulos devem await antes de usar o cliente.
 */
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.1/+esm';

async function syncOAuthAvatarToProfile(supabase, session) {
  const uid = session?.user?.id;
  if (!uid) return;
  const meta = session.user.user_metadata || {};
  const pic = (meta.avatar_url || meta.picture || '').trim();
  if (!pic) return;

  const { data: row, error: selErr } = await supabase
    .from('profiles')
    .select('avatar_url')
    .eq('id', uid)
    .maybeSingle();
  if (selErr || row?.avatar_url) return;

  await supabase.from('profiles').update({ avatar_url: pic }).eq('id', uid);
}

window.__auraAuthReady = (async function auraSessionGuard() {
  const url = window.AURA_SUPABASE_URL;
  const key = window.AURA_SUPABASE_ANON_KEY;
  if (!url || !key) {
    window.location.replace('login.html');
    return false;
  }

  const supabase = createClient(url, key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });

  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();

  if (error || !session?.user?.id) {
    window.location.replace('login.html');
    return false;
  }

  window.__auraSupabaseClient = supabase;
  window.__auraSignOut = () => supabase.auth.signOut({ scope: 'global' });

  if (typeof AuraAuth !== 'undefined') {
    AuraAuth.setLoggedIn(true);
    const email = session.user.email;
    if (email) AuraAuth.saveProfile({ email: email });
  }

  await syncOAuthAvatarToProfile(supabase, session);

  document.documentElement.classList.remove('aura-auth-checking');
  return true;
})();
