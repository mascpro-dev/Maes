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
  if (status === 'enviado') return 'No relatório';
  if (status === 'cancelado') return 'Cancelado';
  return 'A conferir';
}

function renderRefundCard(row, { showRecipient, showOkButton, showRevertButton }) {
  const tag = (row.service_type || 'Recibo').trim() || 'Recibo';
  const provider = (row.provider_name || 'Prestador não indicado').trim();
  const metaDate = formatRefundDate(row);
  const amount = amountLine(row);
  const recipient =
    showRecipient && row.recipient_label
      ? `<p class="reemb-card__recipient">Sugestão de destino (envio por ti): ${esc(row.recipient_label)}</p>`
      : '';
  const okClass = row.status === 'enviado' ? ' reemb-card__status--ok' : '';
  const cardClass = row.status === 'enviado' ? 'reemb-card reemb-card--done' : 'reemb-card reemb-card--pending';
  const rid = row.id ? esc(String(row.id)) : '';
  const okBtn =
    showOkButton && rid
      ? `<button type="button" class="reemb-card__ok" data-reemb-ok="${rid}">Tudo certo — incluir no relatório</button>`
      : '';
  const revertBtn =
    showRevertButton && rid
      ? `<button type="button" class="reemb-card__revert" data-reemb-revert="${rid}">Voltar para Pendentes</button>`
      : '';

  return `<li>
    <article class="${cardClass}">
      <div class="reemb-card__top">
        <span class="reemb-card__tag">${esc(tag)}</span>
        <span class="reemb-card__status${okClass}">${esc(statusLabel(row.status))}</span>
      </div>
      <p class="reemb-card__provider">${esc(provider)}</p>
      <p class="reemb-card__meta">${esc(metaDate)} · ${amount}</p>
      ${recipient}
      ${okBtn}
      ${revertBtn}
    </article>
  </li>`;
}

function setSummary(count) {
  const summaryEl = document.getElementById('reemb-summary');
  if (!summaryEl) return;

  if (count === 0) {
    summaryEl.textContent =
      'Nenhum pedido a conferir. Novos scans ou envios pelo painel aparecem em Pendentes até confirmares com OK.';
    return;
  }

  const pedido = count === 1 ? 'pedido' : 'pedidos';
  const verb = count === 1 ? 'aguarda' : 'aguardam';
  summaryEl.innerHTML = `Tens <strong id="reemb-pending-count">${count}</strong> ${pedido} que ${verb} a tua confirmação (OK) para entrarem no relatório.`;
}

function renderRefundLists(rows) {
  const pendingList = document.getElementById('reemb-pending-list');
  const sentList = document.getElementById('reemb-sent-list');
  const pendingEmpty = document.getElementById('reemb-pending-empty');
  const sentEmpty = document.getElementById('reemb-sent-empty');

  const pending = (rows || []).filter((r) => r.status === 'pendente');
  const sent = (rows || []).filter((r) => r.status === 'enviado');

  if (pendingList) {
    pendingList.innerHTML = pending
      .map((r) => renderRefundCard(r, { showRecipient: false, showOkButton: true }))
      .join('');
  }
  if (sentList) {
    sentList.innerHTML = sent
      .map((r) => renderRefundCard(r, { showRecipient: true, showRevertButton: true }))
      .join('');
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

/** Última lista carregada (para relatório impresso). */
let cachedRefundRows = [];

function openPrintableReport(rows) {
  const list = (rows || []).filter((r) => r.status === 'enviado');
  if (!list.length) {
    window.alert(
      'Ainda não há pedidos no relatório. Confirma primeiro os itens em Pendentes com «Tudo certo — incluir no relatório».'
    );
    return;
  }
  const generated = new Date().toLocaleString('pt-BR');
  const rowsHtml = list
    .map((r) => {
      const st = statusLabel(r.status);
      const prov = esc((r.provider_name || '—').trim());
      const dt = esc(formatRefundDate(r));
      const val =
        r.amount_cents != null && Number.isFinite(Number(r.amount_cents))
          ? esc(toMoney(r.amount_cents))
          : '—';
      const tipo = esc((r.service_type || '—').trim());
      return `<tr><td>${esc(st)}</td><td>${tipo}</td><td>${prov}</td><td>${dt}</td><td>${val}</td></tr>`;
    })
    .join('');

  const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"/><title>Relatório de reembolsos — Conta Mãe</title>
<style>
  body{font-family:system-ui,-apple-system,sans-serif;padding:20px;color:#1a1714;max-width:800px;margin:0 auto;}
  h1{font-size:1.25rem;margin:0 0 8px;}
  .lead{font-size:.85rem;color:#444;line-height:1.5;margin:0 0 16px;}
  .meta{font-size:.75rem;color:#666;margin-bottom:20px;}
  table{width:100%;border-collapse:collapse;font-size:.8rem;}
  th,td{border:1px solid #ccc;padding:8px;text-align:left;}
  th{background:#f0f4f1;}
  .foot{margin-top:24px;font-size:.75rem;color:#555;line-height:1.5;}
  @media print{body{padding:12px}}
</style></head><body>
  <h1>Relatório de pedidos de reembolso</h1>
  <p class="lead">Conta Mãe — resumo gerado pela titular para <strong>impressão</strong>. Junta este documento aos recibos originais e envia <strong>tu</strong> ao teu plano de saúde ou ao genitor, conforme o teu caso. O Conta Mãe não envia estes papéis por ti.</p>
  <p class="meta">Gerado em ${esc(generated)}</p>
  <table>
    <thead><tr><th>Estado</th><th>Tipo</th><th>Prestador</th><th>Data</th><th>Valor</th></tr></thead>
    <tbody>${rowsHtml}</tbody>
  </table>
  <p class="foot">Assinatura: ________________________________ &nbsp; Data: ____/____/________</p>
</body></html>`;

  const w = window.open('', '_blank', 'noopener,noreferrer');
  if (!w) {
    window.alert('Permite pop-ups para abrir o relatório.');
    return;
  }
  w.document.write(html);
  w.document.close();
  w.focus();
  setTimeout(() => {
    try {
      w.print();
    } catch (_) {
      /* ignore */
    }
  }, 250);
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

  cachedRefundRows = data || [];
  renderRefundLists(cachedRefundRows);
}

document.getElementById('btn-reemb-print-report')?.addEventListener('click', () => {
  openPrintableReport(cachedRefundRows);
});

document.getElementById('reemb-pending-list')?.addEventListener('click', async (ev) => {
  const btn = ev.target.closest('[data-reemb-ok]');
  if (!btn) return;
  const id = btn.getAttribute('data-reemb-ok');
  if (!id) return;
  const auth = await getSupabaseUser();
  if (!auth) {
    window.alert('Sessão expirada. Entra de novo.');
    return;
  }
  btn.disabled = true;
  const { supabase, userId } = auth;
  const { error } = await supabase
    .from('refunds')
    .update({ status: 'enviado' })
    .eq('id', id)
    .eq('user_id', userId);
  btn.disabled = false;
  if (error) {
    window.alert('Não foi possível confirmar: ' + (error.message || 'erro'));
    return;
  }
  await loadRefundsFromSupabase();
});

document.getElementById('reemb-sent-list')?.addEventListener('click', async (ev) => {
  const btn = ev.target.closest('[data-reemb-revert]');
  if (!btn) return;
  const id = btn.getAttribute('data-reemb-revert');
  if (!id) return;
  if (!window.confirm('Voltar este pedido para Pendentes? Sai do relatório até voltares a confirmar.')) return;
  const auth = await getSupabaseUser();
  if (!auth) {
    window.alert('Sessão expirada. Entra de novo.');
    return;
  }
  btn.disabled = true;
  const { supabase, userId } = auth;
  const { error } = await supabase
    .from('refunds')
    .update({ status: 'pendente' })
    .eq('id', id)
    .eq('user_id', userId);
  btn.disabled = false;
  if (error) {
    window.alert('Não foi possível reverter: ' + (error.message || 'erro'));
    return;
  }
  await loadRefundsFromSupabase();
});

function createCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = 'AURA-';
  for (let i = 0; i < 8; i += 1) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

/**
 * URL absoluta da landing de indicação (pasta indicacao/ com index.html).
 * Usa o mesmo domínio em que a app está aberta (https). Opcional: AURA_APP_PUBLIC_URL em supabase-config.js.
 */
function getReferralLandingUrl() {
  if (typeof window === 'undefined') return '';

  const configured =
    typeof window.AURA_APP_PUBLIC_URL === 'string' ? window.AURA_APP_PUBLIC_URL.trim().replace(/\/$/, '') : '';

  try {
    const u = new URL(window.location.href);
    if (u.protocol === 'http:' || u.protocol === 'https:') {
      let path = u.pathname;
      const marker = '/indicacao';
      const idx = path.indexOf(marker);
      if (idx >= 0) {
        const basePath = path.slice(0, idx + marker.length);
        return `${u.origin}${basePath}/`;
      }
      const i = path.lastIndexOf('/');
      const dir = i >= 0 ? path.slice(0, i + 1) : '/';
      return `${u.origin}${dir}indicacao/`;
    }
  } catch (_) {
    /* ignore */
  }

  if (configured) {
    return `${configured}/indicacao/`;
  }

  return '';
}

function buildAffiliateShareLink(code) {
  const c = String(code || '').trim();
  if (!c) return '';
  try {
    const u = new URL(getReferralLandingUrl());
    u.searchParams.set('ref', c);
    return u.toString();
  } catch (_) {
    return `${getReferralLandingUrl()}?ref=${encodeURIComponent(c)}`;
  }
}

/** Valor gravado em partner_program_accounts.referral_base_url (sem query). */
function getDefaultBaseUrl() {
  return getReferralLandingUrl();
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

  function renderState(state) {
    const code = (state.referral_code || '').trim();
    linkEl.value = buildAffiliateShareLink(code);
    commissionPendingEl.textContent = toMoney(Number(state.commission_pending_cents) || 0);

    if (state.enabled) {
      statusEl.textContent = 'Programa ativo: o teu link já pode gerar comissões (3% sobre pagamentos das indicadas diretas no app).';
      return;
    }
    statusEl.textContent =
      'Programa em preparação: o teu link já está pronto; a comissão de 3% sobre o que as tuas indicadas diretas pagarem no app entrará quando o programa estiver ativo.';
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
        renderState(local);
        return;
      }

      if (row) {
        renderState(row);
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
        renderState(inserted);
        saveState({
          enabled: !!inserted.enabled,
          referral_code: inserted.referral_code || createCode(),
          referral_base_url: inserted.referral_base_url || getDefaultBaseUrl(),
          commission_pending_cents: Number(inserted.commission_pending_cents) || 0,
        });
        return;
      }

      const local = saveState(loadState());
      renderState(local);
    }

    const local = saveState(loadState());
    renderState(local);
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

(function setupInstallAppButton() {
  const btn = document.getElementById('btn-reemb-install-app');
  if (!btn) return;
  if (window.matchMedia('(display-mode: standalone)').matches) {
    btn.textContent = 'Instalar App';
    btn.disabled = true;
    btn.classList.add('reemb-affiliate__install-btn--done');
    return;
  }
  let deferredPrompt = null;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    btn.setAttribute('data-install-ready', 'true');
  });
  btn.addEventListener('click', async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      deferredPrompt = null;
      return;
    }
    const ua = navigator.userAgent || '';
    const isIOS =
      /iphone|ipad|ipod/i.test(ua) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const msg = isIOS
      ? 'No iPhone ou iPad: em Safari, toca em Partilhar e escolhe «Adicionar ao ecrã principal».'
      : 'No Chrome (telemóvel ou computador): menu (⋮) → «Instalar app» ou «Adicionar à página inicial». Se não aparecer, usa um marcador ao site — continua a funcionar bem.';
    window.alert(msg);
  });
})();
