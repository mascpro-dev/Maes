'use strict';

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.1/+esm';

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function main() {
  if (window.__auraAuthReady) {
    const ok = await window.__auraAuthReady;
    if (!ok) return;
  }

  const statusEl = document.getElementById('indicados-status');
  const listEl = document.getElementById('indicados-list');

  const url = window.AURA_SUPABASE_URL;
  const key = window.AURA_SUPABASE_ANON_KEY;
  if (!url || !key) {
    if (statusEl) statusEl.textContent = 'Configuração Supabase em falta.';
    return;
  }

  const supabase =
    window.__auraSupabaseClient ||
    createClient(url, key, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });

  document.documentElement.classList.remove('aura-auth-checking');

  const { data: rows, error } = await supabase.rpc('list_my_referrals');

  if (error) {
    if (statusEl) {
      statusEl.textContent =
        'Não foi possível carregar a lista. Confirma se executaste o SQL da rede (COLE_REFUNDS_REDE.sql).';
    }
    console.warn('[indicados]', error.message);
    return;
  }

  if (!rows || !rows.length) {
    if (statusEl) {
      statusEl.textContent =
        'Ainda não há indicadas registadas com o teu código. Quando alguém se registar com o teu link, aparece aqui.';
    }
    if (listEl) listEl.innerHTML = '';
    return;
  }

  if (statusEl) statusEl.textContent = `${rows.length} indicada(s) direta(s).`;

  if (listEl) {
    listEl.innerHTML = rows
      .map((r) => {
        const name = (r.full_name || 'Utilizadora').trim() || 'Utilizadora';
        const href = `mensagens.html?user=${encodeURIComponent(r.id)}`;
        return `<li>
          <article class="indicados-card">
            <div>
              <p class="indicados-card__name">${esc(name)}</p>
              <p class="indicados-card__meta">Mensagens no app Conta Mãe</p>
            </div>
            <a class="indicados-card__btn" href="${href}">Mensagem</a>
          </article>
        </li>`;
      })
      .join('');
  }
}

main();
