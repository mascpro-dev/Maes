'use strict';
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.1/+esm';

/** Contagem exibida no dashboard e aqui; pode ser atualizada pelo fluxo do scanner no futuro. */
(function syncPendingSummary() {
  const summaryEl = document.getElementById('reemb-summary');
  if (!summaryEl) return;

  const raw = localStorage.getItem('aura_refund_pending');
  const c =
    raw === null
      ? 2
      : (() => {
          const n = parseInt(raw, 10);
          return Number.isFinite(n) && n >= 0 ? n : 2;
        })();

  if (c === 0) {
    summaryEl.textContent =
      'Nenhum reembolso pendente no momento. Quando escanear um recibo, ele aparecerá aqui.';
    return;
  }

  const pedido = c === 1 ? 'pedido' : 'pedidos';
  const verb = c === 1 ? 'aguarda' : 'aguardam';
  summaryEl.innerHTML = `Você tem <strong id="reemb-pending-count">${c}</strong> ${pedido} que ${verb} envio ou análise.`;
})();

/** Estrutura pronta para programa de parceiros/comissões (modo "em breve"). */
(function setupAffiliatePreview() {
  const statusEl = document.getElementById('reemb-affiliate-status');
  const linkEl = document.getElementById('reemb-affiliate-link');
  const copyBtn = document.getElementById('btn-copy-affiliate-link');
  const commissionPendingEl = document.getElementById('reemb-commission-pending');
  const cashbackPendingEl = document.getElementById('reemb-cashback-pending');
  const totalReleasedEl = document.getElementById('reemb-total-released');
  if (!statusEl || !linkEl || !copyBtn || !commissionPendingEl || !cashbackPendingEl || !totalReleasedEl) return;

  const STORAGE_KEY = 'aura_partner_program_v1';

  function toMoney(cents) {
    const v = Number.isFinite(cents) ? cents : 0;
    return (v / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
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

  function loadState() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') return parsed;
      } catch (_) {
        // ignora e recria abaixo
      }
    }

    const initial = {
      enabled: false,
      referral_code: createCode(),
      referral_base_url: getDefaultBaseUrl(),
      commission_pending_cents: 0,
      cashback_pending_cents: 0,
      total_released_cents: 0,
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
    const link = `${state.referral_base_url}?ref=${encodeURIComponent(state.referral_code)}`;
    linkEl.value = link;
    commissionPendingEl.textContent = toMoney(state.commission_pending_cents);
    cashbackPendingEl.textContent = toMoney(state.cashback_pending_cents);
    totalReleasedEl.textContent = toMoney(state.total_released_cents);

    if (state.enabled) {
      statusEl.textContent = 'Programa ativo: o teu link já pode gerar comissões e cashback.';
      return;
    }
    statusEl.textContent =
      source === 'supabase'
        ? 'Programa em preparação: os dados já estão ligados ao Supabase e prontos para ativação.'
        : 'Programa em preparação: já deixamos o teu link pronto para ativar quando os parceiros entrarem.';
  }

  function bindCopy() {
    const copyNow = async () => {
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
    };
    copyBtn.addEventListener('click', copyNow);
  }

  async function getSupabaseUser() {
    if (!window.AURA_SUPABASE_URL || !window.AURA_SUPABASE_ANON_KEY) return null;
    const supabase = createClient(window.AURA_SUPABASE_URL, window.AURA_SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.user?.id) return null;
    return { supabase, userId: session.user.id };
  }

  async function loadFromSupabase() {
    const auth = await getSupabaseUser();
    if (!auth) return null;
    const { supabase, userId } = auth;

    const { data: row, error } = await supabase
      .from('partner_program_accounts')
      .select(
        'user_id, enabled, referral_code, referral_base_url, commission_pending_cents, cashback_pending_cents, total_released_cents, updated_at'
      )
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      const msg = String(error.message || '').toLowerCase();
      // Se a tabela ainda não existe, mantém fallback local sem quebrar UI.
      if (msg.includes('relation') || msg.includes('does not exist')) return null;
      throw error;
    }

    if (row) return row;

    const seed = {
      user_id: userId,
      enabled: false,
      referral_code: createCode(),
      referral_base_url: getDefaultBaseUrl(),
      commission_pending_cents: 0,
      cashback_pending_cents: 0,
      total_released_cents: 0,
    };

    const { data: inserted, error: insertError } = await supabase
      .from('partner_program_accounts')
      .insert(seed)
      .select(
        'user_id, enabled, referral_code, referral_base_url, commission_pending_cents, cashback_pending_cents, total_released_cents, updated_at'
      )
      .single();

    if (insertError) {
      // Conflito raro de referral_code, ou tabela ainda não aplicada.
      return null;
    }
    return inserted;
  }

  bindCopy();

  (async () => {
    try {
      const serverState = await loadFromSupabase();
      if (serverState) {
        renderState(serverState, 'supabase');
        saveState({
          enabled: !!serverState.enabled,
          referral_code: serverState.referral_code || createCode(),
          referral_base_url: serverState.referral_base_url || getDefaultBaseUrl(),
          commission_pending_cents: Number(serverState.commission_pending_cents) || 0,
          cashback_pending_cents: Number(serverState.cashback_pending_cents) || 0,
          total_released_cents: Number(serverState.total_released_cents) || 0,
        });
        return;
      }
    } catch (_) {
      // fallback local já cobre o caso
    }

    const local = saveState(loadState());
    renderState(local, 'local');
  })();
})();
