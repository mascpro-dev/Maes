/**
 * Pedido de recuperação de senha — redirectTo aponta para o domínio público (nunca localhost).
 */
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.1/+esm';

function base() {
  if (typeof window.auraPublicSiteBase === 'function') {
    return window.auraPublicSiteBase() || '';
  }
  return (window.AURA_APP_PUBLIC_URL || '').trim().replace(/\/$/, '') || window.location.origin.replace(/\/$/, '');
}

(async function () {
  const url = window.AURA_SUPABASE_URL;
  const key = window.AURA_SUPABASE_ANON_KEY;
  const form = document.getElementById('form-recuperar');
  const emailInp = document.getElementById('email-cadastrado');
  const btn = form?.querySelector('button[type="submit"]');

  if (!form || !emailInp || !url || !key) return;

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const hint = document.createElement('p');
  hint.className = 'recuperar-hint';
  hint.style.cssText = 'margin-top:12px;font-size:.9rem;color:#5a5550;line-height:1.45';
  hint.setAttribute('role', 'status');
  hint.hidden = true;
  form.insertAdjacentElement('afterend', hint);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!form.reportValidity()) return;
    const email = emailInp.value.trim();
    const site = base();
    const okSite =
      site &&
      (/^https:\/\//i.test(site) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(site));
    if (!okSite) {
      hint.hidden = false;
      hint.textContent =
        'Configuração em falta: em supabase-config.js define AURA_APP_PUBLIC_URL com o site em HTTPS (ex.: https://maes-pi.vercel.app). Localhost no telemóvel não funciona.';
      return;
    }

    const redirectTo = `${site}/nova-senha.html`;
    if (btn) btn.disabled = true;
    hint.hidden = false;
    hint.textContent = 'A enviar…';

    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });

    if (btn) btn.disabled = false;

    if (error) {
      hint.textContent = error.message || String(error);
      return;
    }

    hint.textContent =
      'Se existir uma conta com este e-mail, enviámos uma ligação para criares uma nova senha. Verifica spam e abre o link no browser (Chrome/Safari), não só na app de e-mail.';
    emailInp.value = '';
  });
})();
