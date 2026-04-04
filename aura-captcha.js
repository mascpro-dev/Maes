/**
 * Cloudflare Turnstile opcional — alinhar com Supabase Attack Protection (CAPTCHA).
 * supabase-config.js: window.AURA_TURNSTILE_SITE_KEY = '...' ou '' para desligar no front.
 */
const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js';

let scriptPromise = null;
let widgetId = null;

export function isTurnstileConfigured() {
  const k = window.AURA_TURNSTILE_SITE_KEY;
  return !!(k && String(k).trim());
}

function loadTurnstileScript() {
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    if (typeof window.turnstile !== 'undefined') {
      resolve();
      return;
    }
    const s = document.createElement('script');
    s.src = SCRIPT_SRC;
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Falha ao carregar Turnstile'));
    document.head.appendChild(s);
  });
  return scriptPromise;
}

/**
 * Renderiza o widget dentro de `container` (elemento HTMLElement).
 * @returns {Promise<string|null>} widget id interno do Turnstile ou null
 */
export async function mountTurnstile(container) {
  if (!isTurnstileConfigured() || !container) return null;
  try {
    await loadTurnstileScript();
  } catch (e) {
    console.warn('[Aura] Turnstile:', e);
    return null;
  }
  if (typeof window.turnstile === 'undefined' || !window.turnstile.render) return null;

  container.innerHTML = '';
  widgetId = window.turnstile.render(container, {
    sitekey: String(window.AURA_TURNSTILE_SITE_KEY).trim(),
    theme: 'light',
  });
  return widgetId;
}

export function getTurnstileToken() {
  if (widgetId == null || typeof window.turnstile === 'undefined') return null;
  const t = window.turnstile.getResponse(widgetId);
  return t && String(t).length ? t : null;
}

export function resetTurnstile() {
  if (widgetId != null && window.turnstile?.reset) {
    try {
      window.turnstile.reset(widgetId);
    } catch (e) { /* ignore */ }
  }
}
