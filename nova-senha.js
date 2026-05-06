/**
 * Define nova senha após link de recuperação (fragmentos na URL).
 */
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.1/+esm';
import { humanizeAuthError } from './signup-flow.js';

async function waitForRecoverySession(sb) {
  const raw = window.location.hash || '';
  const hasTok =
    typeof raw === 'string' &&
    (/access_token=/.test(raw) || /refresh_token=/.test(raw) || /type=recovery/i.test(raw));

  if (hasTok) await new Promise((r) => setTimeout(r, 450));

  let {
    data: { session },
  } = await sb.auth.getSession();
  if (session?.user?.id) return session;

  if (!hasTok) return session;

  await new Promise((resolve) => {
    const to = window.setTimeout(resolve, 4200);
    const { data } = sb.auth.onAuthStateChange((event, sess) => {
      if ((event === 'INITIAL_SESSION' || event === 'SIGNED_IN') && sess?.user?.id) {
        window.clearTimeout(to);
        try {
          data.subscription.unsubscribe();
        } catch (_) {
          /* ignore */
        }
        resolve(undefined);
      }
    });
  });

  const again = await sb.auth.getSession();
  return again.data.session;
}

(function readHashErr() {
  const h = (window.location.hash || '').replace(/^#/, '');
  if (!h.includes('error')) return;
  try {
    const p = new URLSearchParams(h);
    const desc = p.get('error_description');
    const msg = desc ? decodeURIComponent(desc.replace(/\+/g, ' ')) : p.get('error') || 'Erro no link.';
    const el = document.getElementById('nova-senha-global-err');
    if (el) {
      el.textContent = msg + ' — Em Supabase → Authentication → URL Configuration, o Site URL tem de ser o site HTTPS (não localhost).';
      el.hidden = false;
    } else {
      window.alert(msg);
    }
    window.history.replaceState({}, '', window.location.pathname + window.location.search);
  } catch (_) {
    /* ignore */
  }
})();

(async function () {
  const url = window.AURA_SUPABASE_URL;
  const key = window.AURA_SUPABASE_ANON_KEY;
  const form = document.getElementById('form-nova-senha');
  const pass = document.getElementById('nova-senha');
  const confirm = document.getElementById('confirmar-senha');
  const erro = document.getElementById('erro-confirmacao');

  if (!form || !pass || !confirm || !url || !key) return;

  const supabase = createClient(url, key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });

  const session = await waitForRecoverySession(supabase);
  if (!session?.user?.id) {
    const warn = document.createElement('p');
    warn.className = 'nova-senha-warn';
    warn.style.cssText = 'margin-bottom:16px;padding:12px;border-radius:8px;background:#faf6f2;color:#5a4035;font-size:.9rem;line-height:1.45';
    warn.textContent =
      'Ligação inválida ou expirada. Volta a pedir recuperação em Esqueci minha senha, ou confirma que o site em Supabase → URL Configuration é o domínio HTTPS (não localhost).';
    form.parentNode?.insertBefore(warn, form);
    form.querySelector('button[type="submit"]')?.setAttribute('disabled', 'disabled');
    return;
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (erro) erro.hidden = true;
    if (!form.reportValidity()) return;
    if (pass.value !== confirm.value) {
      if (erro) erro.hidden = false;
      confirm.focus();
      return;
    }

    const btn = form.querySelector('button[type="submit"]');
    if (btn) btn.disabled = true;

    const { error } = await supabase.auth.updateUser({ password: pass.value });

    if (btn) btn.disabled = false;

    if (error) {
      window.alert(humanizeAuthError(error.message));
      return;
    }

    await supabase.auth.signOut({ scope: 'local' });
    window.location.href = 'login.html?senha=ok';
  });
})();
