/**
 * Login: e-mail + senha (Supabase Auth).
 */
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.1/+esm';
import { humanizeAuthError } from './signup-flow.js';
import { computeMotherSignupRedirect } from './mother-onboarding-guard.js';

/** Erros devolvidos no hash/query após redirect do convite (Supabase). */
function readOAuthRedirectError() {
  try {
    const h = (window.location.hash || '').replace(/^#/, '');
    if (h.includes('error')) {
      const p = new URLSearchParams(h);
      const desc = p.get('error_description');
      if (desc) return decodeURIComponent(desc.replace(/\+/g, ' '));
      const code = p.get('error_code');
      if (code) return code;
      return p.get('error') || null;
    }
  } catch (_) {
    /* ignore */
  }
  try {
    const p = new URLSearchParams(window.location.search);
    if (!p.get('error') && !p.get('error_description')) return null;
    const d = p.get('error_description');
    if (d) return decodeURIComponent(d.replace(/\+/g, ' '));
    return p.get('error');
  } catch (_) {
    return null;
  }
}

function clearOAuthErrorFromUrl() {
  try {
    const u = new URL(window.location.href);
    u.hash = '';
    ['error', 'error_code', 'error_description'].forEach((k) => u.searchParams.delete(k));
    window.history.replaceState({}, '', u.pathname + (u.search ? u.search : '') + u.hash);
  } catch (_) {
    /* ignore */
  }
}

/** Espera o cliente processar tokens no hash (convite / magic link) antes de decidir redirect. */
async function waitForInviteSession(supabase) {
  const raw = window.location.hash || '';
  const maybeRecovery =
    typeof raw === 'string' &&
    (/access_token=/.test(raw) || /refresh_token=/.test(raw) || /type=invite/i.test(raw));

  if (maybeRecovery) await new Promise((r) => setTimeout(r, 450));

  let {
    data: { session },
  } = await supabase.auth.getSession();
  if (session?.user?.id) return;

  if (!maybeRecovery) return;

  await new Promise((resolve) => {
    const to = window.setTimeout(resolve, 4200);
    const { data } = supabase.auth.onAuthStateChange((event, sess) => {
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

  await supabase.auth.getSession();
}

async function redirectAfterLogin(remember, supabase) {
  if (typeof AuraAuth !== 'undefined') AuraAuth.setLoggedIn(remember);
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (session?.user?.id) {
      const next = await computeMotherSignupRedirect(supabase, session.user.id, 'login.html');
      window.location.href = next || 'index.html';
      return;
    }
  } catch (_) {
    /* ignore */
  }
  window.location.href = 'index.html';
}

(async function initLoginPage() {
  const url = window.AURA_SUPABASE_URL;
  const key = window.AURA_SUPABASE_ANON_KEY;
  if (!url || !key) return;

  const supabase = createClient(url, key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });

  const form = document.getElementById('form-login');
  const emailInput = document.getElementById('login-email');
  const passInput = document.getElementById('login-senha');
  const errEl = document.getElementById('login-error');

  function showError(msg) {
    if (!errEl) {
      alert(msg);
      return;
    }
    errEl.textContent = msg || '';
    errEl.hidden = !msg;
  }

  try {
    if (new URLSearchParams(window.location.search).get('senha') === 'ok') {
      const hint = document.getElementById('login-password-hint');
      if (hint) {
        hint.textContent = 'Senha atualizada. Entra com o e-mail e a nova senha.';
      }
      window.history.replaceState({}, '', window.location.pathname);
    }
  } catch (_) {
    /* ignore */
  }

  const oauthErr = readOAuthRedirectError();
  if (oauthErr) {
    showError(
      oauthErr +
        ' — Confirma em Supabase → Authentication → URL Configuration que o redirect (login) está permitido; abre o convite no browser completo.',
    );
    clearOAuthErrorFromUrl();
  }

  await waitForInviteSession(supabase);

  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (session?.user?.id) {
    const next = await computeMotherSignupRedirect(supabase, session.user.id, 'login.html');
    window.location.replace(next || 'index.html');
    return;
  }

  if (form && emailInput && passInput) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!form.reportValidity()) return;
      showError('');

      const email = emailInput.value.trim();
      const password = passInput.value;
      const lembrar = form.querySelector('input[name="lembrar"]');
      const remember = lembrar && lembrar.checked;

      const { error } = await supabase.auth.signInWithPassword({ email, password });

      if (error) {
        showError(humanizeAuthError(error.message));
        return;
      }

      const prev = typeof AuraAuth !== 'undefined' ? AuraAuth.getProfile() : {};
      const prevEmail = (prev.email && String(prev.email).toLowerCase()) || '';
      if (typeof AuraAuth !== 'undefined') {
        if (prevEmail && prevEmail !== email.toLowerCase()) {
          AuraAuth.saveProfile({ email, nomeCompleto: '' });
        } else {
          AuraAuth.saveProfile({ email });
        }
      }
      await redirectAfterLogin(remember, supabase);
    });
  }
})();
