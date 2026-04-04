/**
 * Login: e-mail/senha + Google OAuth (redirect volta a login.html).
 */
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.1/+esm';
import { humanizeAuthError } from './signup-flow.js';

function redirectAfterLogin(remember) {
  if (typeof AuraAuth !== 'undefined') AuraAuth.setLoggedIn(remember);
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

  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (session?.user) {
    window.location.replace('index.html');
    return;
  }

  const form = document.getElementById('form-login');
  const emailInput = document.getElementById('login-email');
  const passInput = document.getElementById('login-senha');
  const errEl = document.getElementById('login-error');
  const googleBtn = document.getElementById('btn-login-google');

  function showError(msg) {
    if (!errEl) {
      alert(msg);
      return;
    }
    errEl.textContent = msg || '';
    errEl.hidden = !msg;
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
      redirectAfterLogin(remember);
    });
  }

  if (googleBtn) {
    googleBtn.addEventListener('click', async () => {
      showError('');
      const redirectTo = new URL('login.html', window.location.href).href;
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo },
      });
      if (error) showError(humanizeAuthError(error.message));
    });
  }
})();
