'use strict';
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.1/+esm';

const WA_OPS = '5514991570389';
const PIX_MSG = encodeURIComponent(
  'Olá! Vim do app Conta Mãe e quero solicitar o saque da minha comissão via PIX. Entendo que há desconto de R$ 10,00 por transferência PIX.'
);

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function toMoney(cents) {
  const v = Number.isFinite(Number(cents)) ? Number(cents) : 0;
  return (v / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatRefundDate(row) {
  if (row.service_date) {
    const d = new Date(`${row.service_date}T12:00:00`);
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', year: 'numeric' });
    }
  }
  if (row.created_at) {
    const d = new Date(row.created_at);
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', year: 'numeric' });
    }
  }
  return '—';
}

function amountLine(row) {
  if (row.amount_cents != null && Number.isFinite(Number(row.amount_cents))) {
    return `<strong>${esc(toMoney(row.amount_cents))}</strong>`;
  }
  return '<strong>Valor a confirmar</strong>';
}

function statusLabel(status) {
  if (status === 'enviado') return 'Enviado';
  if (status === 'cancelado') return 'Cancelado';
  return 'Aguardando análise';
}

function renderRefundCard(row, { showRecipient }) {
  const tag = (row.service_type || 'Recibo').trim() || 'Recibo';
  const provider = (row.provider_name || 'Prestador não indicado').trim();
  const metaDate = formatRefundDate(row);
  const amount = amountLine(row);
  const recipient =
    showRecipient && row.recipient_label
      ? `<p class="reemb-card__recipient">Encaminhado a: ${esc(row.recipient_label)}</p>`
      : '';
  const okClass = row.status === 'enviado' ? ' reemb-card__status--ok' : '';
  const cardClass = row.status === 'enviado' ? 'reemb-card reemb-card--done' : 'reemb-card reemb-card--pending';

  return `<li>
    <article class="${cardClass}">
      <div class="reemb-card__top">
        <span class="reemb-card__tag">${esc(tag)}</span>
        <span class="reemb-card__status${okClass}">${esc(statusLabel(row.status))}</span>
      </div>
      <p class="reemb-card__provider">${esc(provider)}</p>
      <p class="reemb-card__meta">${esc(metaDate)} · ${amount}</p>
      ${recipient}
    </article>
  </li>`;
}

function setSummary(count) {
  const summaryEl = document.getElementById('reemb-summary');
  if (!summaryEl) return;

  if (count === 0) {
    summaryEl.textContent =
      'Nenhum reembolso pendente no momento. Quando escanear um recibo ou enviar pelo painel, ele aparecerá aqui.';
    return;
  }

  const pedido = count === 1 ? 'pedido' : 'pedidos';
  const verb = count === 1 ? 'aguarda' : 'aguardam';
  summaryEl.innerHTML = `Tens <strong id="reemb-pending-count">${count}</strong> ${pedido} que ${verb} envio ou análise.`;
}

function renderRefundLists(rows) {
  const pendingList = document.getElementById('reemb-pending-list');
  const sentList = document.getElementById('reemb-sent-list');
  const pendingEmpty = document.getElementById('reemb-pending-empty');
  const sentEmpty = document.getElementById('reemb-sent-empty');

  const pending = (rows || []).filter((r) => r.status === 'pendente');
  const sent = (rows || []).filter((r) => r.status === 'enviado');

  if (pendingList) {
    pendingList.innerHTML = pending.map((r) => renderRefundCard(r, { showRecipient: false })).join('');
  }
  if (sentList) {
    sentList.innerHTML = sent.map((r) => renderRefundCard(r, { showRecipient: true })).join('');
  }
  if (pendingEmpty) {
    pendingEmpty.hidden = pending.length > 0;
  }
  if (sentEmpty) {
    sentEmpty.hidden = sent.length > 0;
  }

  setSummary(pending.length);

  try {
    localStorage.setItem('aura_refund_pending', String(pending.length));
  } catch (_) {
    /* ignore */
  }
  if (typeof window.AuraDashboard?.refreshRefundPendingLabel === 'function') {
    window.AuraDashboard.refreshRefundPendingLabel();
  }
}

async function getSupabaseUser() {
  if (!window.AURA_SUPABASE_URL || !window.AURA_SUPABASE_ANON_KEY) return null;
  const supabase =
    window.__auraSupabaseClient ||
    createClient(window.AURA_SUPABASE_URL, window.AURA_SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user?.id) return null;
  return { supabase, userId: session.user.id };
}

async function loadRefundsFromSupabase() {
  const summaryEl = document.getElementById('reemb-summary');
  const auth = await getSupabaseUser();
  if (!auth) {
    if (summaryEl) {
      summaryEl.textContent = 'Inicia sessão para veres os teus reembolsos.';
    }
    return;
  }

  const { supabase, userId } = auth;
  const { data, error } = await supabase
    .from('refunds')
    .select(
      'id,status,receipt_path,amount_cents,service_date,provider_name,service_type,recipient_label,created_at'
    )
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    const msg = String(error.message || '').toLowerCase();
    if (summaryEl) {
      if (msg.includes('relation') || msg.includes('does not exist')) {
        summaryEl.textContent =
          'A tabela de reembolsos ainda não está criada no projeto. Executa o SQL em supabase/COLE_REFUNDS_REDE.sql (ou a migração correspondente).';
      } else {
        summaryEl.textContent = 'Não foi possível carregar os reembolsos: ' + esc(error.message);
      }
    }
    return;
  }

  renderRefundLists(data || []);
}

function createCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = 'AURA-';
  for (let i = 0; i < 8; i += 1) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

function getDefaultBaseUrl() {
  return 'https://contamae.app/indicacao';
}

(function setupAffiliatePreview() {
  const statusEl = document.getElementById('reemb-affiliate-status');
  const linkEl = document.getElementById('reemb-affiliate-link');
  const copyBtn = document.getElementById('btn-copy-affiliate-link');
  const commissionPendingEl = document.getElementById('reemb-commission-pending');
  const networkCountEl = document.getElementById('reemb-network-count');
  const networkDetailEl = document.getElementById('reemb-network-detail');
  const pixBtn = document.getElementById('btn-pix-withdraw');
  if (!statusEl || !linkEl || !copyBtn || !commissionPendingEl || !networkCountEl) return;

  const STORAGE_KEY = 'aura_partner_program_v1';

  function loadState() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') return parsed;
      } catch (_) {
        /* ignore */
      }
    }
    const initial = {
      enabled: false,
      referral_code: createCode(),
      referral_base_url: getDefaultBaseUrl(),
      commission_pending_cents: 0,
      updated_at: new Date().toISOString(),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(initial));
    return initial;
  }

  function saveState(state) {
    const next = { ...state, updated_at: new Date().toISOString() };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    return next;
  }

  function renderState(state, source) {
    const base = (state.referral_base_url || getDefaultBaseUrl()).replace(/\/$/, '');
    const code = (state.referral_code || '').trim();
    linkEl.value = code ? `${base}?ref=${encodeURIComponent(code)}` : '';
    commissionPendingEl.textContent = toMoney(Number(state.commission_pending_cents) || 0);

    if (state.enabled) {
      statusEl.textContent = 'Programa ativo: o teu link já pode gerar comissões (3% sobre pagamentos das indicadas diretas no app).';
      return;
    }
    statusEl.textContent =
      source === 'supabase'
        ? 'Programa em preparação: os dados estão ligados ao Supabase; a comissão de 3% será aplicada quando os pagamentos no app estiverem ativos.'
        : 'Programa em preparação: o teu link já está pronto; a comissão de 3% sobre o que as tuas indicadas diretas pagarem no app entrará quando o programa estiver ativo.';
  }

  copyBtn.addEventListener('click', async () => {
    const link = linkEl.value || '';
    try {
      await navigator.clipboard.writeText(link);
    } catch (_) {
      linkEl.focus();
      linkEl.select();
      document.execCommand('copy');
    }
    const old = copyBtn.textContent;
    copyBtn.textContent = 'Copiado!';
    setTimeout(() => {
      copyBtn.textContent = old || 'Copiar';
    }, 1400);
  });

  pixBtn &&
    pixBtn.addEventListener('click', () => {
      window.open(`https://wa.me/${WA_OPS}?text=${PIX_MSG}`, '_blank', 'noopener,noreferrer');
    });

  async function loadNetworkStats(supabase) {
    networkCountEl.textContent = '—';
    if (networkDetailEl) networkDetailEl.textContent = '';
    try {
      const { data, error } = await supabase.rpc('my_referral_network_stats');
      if (error) throw error;
      const total = Number(data?.network_total) || 0;
      const direct = Number(data?.direct_count) || 0;
      networkCountEl.textContent = String(total);
      if (networkDetailEl) {
        networkDetailEl.textContent = `${direct} indicada(s) direta(s) · ${total} pessoa(s) na rede (inclui níveis abaixo)`;
      }
    } catch (_) {
      networkCountEl.textContent = '0';
      if (networkDetailEl) {
        networkDetailEl.textContent =
          'Executa o SQL da rede (COLE_REFUNDS_REDE.sql) para ativar a contagem, ou ainda não tens indicadas registadas.';
      }
    }
  }

  (async () => {
    const auth = await getSupabaseUser();
    if (auth) {
      await loadNetworkStats(auth.supabase);
      const { supabase, userId } = auth;
      const { data: row, error } = await supabase
        .from('partner_program_accounts')
        .select('user_id, enabled, referral_code, referral_base_url, commission_pending_cents, updated_at')
        .eq('user_id', userId)
        .maybeSingle();

      if (error) {
        const msg = String(error.message || '').toLowerCase();
        if (!msg.includes('relation') && !msg.includes('does not exist')) {
          console.warn('[reembolsos] partner_program_accounts:', error.message);
        }
        const local = saveState(loadState());
        renderState(local, 'local');
        return;
      }

      if (row) {
        renderState(row, 'supabase');
        saveState({
          enabled: !!row.enabled,
          referral_code: row.referral_code || createCode(),
          referral_base_url: row.referral_base_url || getDefaultBaseUrl(),
          commission_pending_cents: Number(row.commission_pending_cents) || 0,
        });
        return;
      }

      const seed = {
        user_id: userId,
        enabled: false,
        referral_code: createCode(),
        referral_base_url: getDefaultBaseUrl(),
        commission_pending_cents: 0,
        cashback_pending_cents: 0,
        total_released_cents: 0,
      };
      const { data: inserted, error: insErr } = await supabase
        .from('partner_program_accounts')
        .insert(seed)
        .select('user_id, enabled, referral_code, referral_base_url, commission_pending_cents, updated_at')
        .single();

      if (!insErr && inserted) {
        renderState(inserted, 'supabase');
        saveState({
          enabled: !!inserted.enabled,
          referral_code: inserted.referral_code || createCode(),
          referral_base_url: inserted.referral_base_url || getDefaultBaseUrl(),
          commission_pending_cents: Number(inserted.commission_pending_cents) || 0,
        });
        return;
      }

      const local = saveState(loadState());
      renderState(local, 'local');
    }

    const local = saveState(loadState());
    renderState(local, 'local');
    networkCountEl.textContent = '0';
    if (networkDetailEl) networkDetailEl.textContent = 'Inicia sessão para veres a tua rede.';
  })();
})();

(async function initRefundsPage() {
  if (window.__auraAuthReady) {
    const ok = await window.__auraAuthReady;
    if (!ok) return;
  }
  await loadRefundsFromSupabase();
})();
