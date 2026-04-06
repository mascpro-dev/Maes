/* ============================================================
   AURA — app.js
   Dashboard interativo para mães atípicas
   ============================================================ */

'use strict';

/* ── Nome do cadastro na topbar ─────────────────────────── */
(function initGreetingFromProfile() {
  if (typeof window.AuraAuth === 'undefined') return;

  const profile = window.AuraAuth.getProfile();
  const nome = profile.nomeCompleto && String(profile.nomeCompleto).trim();
  const display = nome || 'Bem-vinda';

  const h1 = document.getElementById('greeting-name');
  const initialsEl = document.getElementById('avatar-initials');
  const avatar = document.getElementById('topbar-avatar');

  if (h1) h1.textContent = display;
  if (initialsEl) initialsEl.textContent = window.AuraAuth.initialsFromNome(nome);
  if (avatar) avatar.setAttribute('aria-label', 'Foto de perfil de ' + display);
})();

/* ── Faixa após cadastro (sessionStorage definido em onboarding-inteligente.js) ── */
(function initOnboardingDashboardBanner() {
  var KEY = 'aura_dashboard_onboarding_banner';
  var el = document.getElementById('onboarding-banner');
  var textEl = document.getElementById('onboarding-banner-text');
  var dismiss = document.getElementById('onboarding-banner-dismiss');
  if (!el || !textEl || !dismiss) return;

  var raw;
  try {
    raw = sessionStorage.getItem(KEY);
  } catch (e) {
    return;
  }

  var params = new URLSearchParams(window.location.search);
  var fromOnboard = params.get('onboarded') === '1';

  if (!raw && !fromOnboard) return;

  try {
    if (raw) {
      var data = JSON.parse(raw);
      textEl.textContent = data.line || data.message || '';
    } else {
      textEl.textContent = 'Explore a Comunidade para encontrar salas de apoio alinhadas ao seu perfil.';
    }
    if (textEl.textContent) {
      el.hidden = false;
    }
  } catch (e) {
    return;
  }

  dismiss.addEventListener('click', function () {
    el.hidden = true;
    try {
      sessionStorage.removeItem(KEY);
    } catch (err) { /* ignore */ }
    if (fromOnboard) {
      history.replaceState({}, '', window.location.pathname || 'index.html');
    }
  });
})();

/* ── Humor + bateria: UI principal em dashboard-supabase.js (Supabase) ── */

/* ── Countdown do compromisso (home + página Agenda) ── */
let auraAppointmentCountdownTimer = null;

/* ── Bateria da Mãe: média mood_score 7d + barra (dashboard-supabase.js) ── */
(function initBatteryDashboardApi() {
  const R = 48;
  const CIRCUM = 2 * Math.PI * R;

  /** Faixas: verde se média > 4; amarelo se entre 2 e 4 (inclusive); vermelho se < 2 */
  function tierFromAverage(avg) {
    if (avg > 4) return 'green';
    if (avg < 2) return 'red';
    return 'yellow';
  }

  function strokeColorForTier(tier) {
    if (tier === 'green') return '#87A96B';
    if (tier === 'red') return '#c94c4c';
    return '#e6c35c';
  }

  function insightForTier(tier, avgFormatted) {
    if (tier === 'green') return `Humor elevado (${avgFormatted}/5). Continue cuidando de você 💛`;
    if (tier === 'red') return `Humor muito baixo (${avgFormatted}/5). Permita-se descanso real 🤍`;
    return `Humor no meio do caminho (${avgFormatted}/5). Pequenos cuidados contam 🌿`;
  }

  window.AuraDashboard = {
    /**
     * @param {string|null} iso Data/hora do próximo compromisso (ISO). null = só texto estático.
     * @param {{
     *   countdownText?: string,
     *   countdownId?: string,
     *   countdownLabelId?: string
     * }} options
     */
    setAppointmentTarget(iso, options = {}) {
      const cid = options.countdownId || 'countdown';
      const lid = options.countdownLabelId || 'appointment-countdown-label';
      const el = document.getElementById(cid);
      const label = document.getElementById(lid);
      if (!el) return;

      if (auraAppointmentCountdownTimer != null) {
        clearInterval(auraAppointmentCountdownTimer);
        auraAppointmentCountdownTimer = null;
      }

      if (!iso) {
        el.dataset.mode = 'static';
        delete el.dataset.appointmentAt;
        if (label) label.textContent = '';
        el.textContent = options.countdownText || 'breve';
        return;
      }

      delete el.dataset.mode;
      el.dataset.appointmentAt = iso;
      if (label) label.textContent = 'Em ';

      const tick = () => {
        const appt = new Date(iso);
        if (Number.isNaN(appt.getTime())) return;
        const diff = appt - Date.now();
        if (diff < 0) {
          if (label) label.textContent = '';
          el.textContent = 'Compromisso encerrado';
          if (auraAppointmentCountdownTimer != null) {
            clearInterval(auraAppointmentCountdownTimer);
            auraAppointmentCountdownTimer = null;
          }
          return;
        }
        if (label) label.textContent = 'Em ';
        const h = Math.floor(diff / 3600000);
        const m = Math.floor((diff % 3600000) / 60000);
        if (h > 0) el.textContent = `${h}h ${m}min`;
        else if (m > 0) el.textContent = `${m} min`;
        else el.textContent = 'agora!';
      };

      tick();
      auraAppointmentCountdownTimer = setInterval(tick, 30000);
    },

    /**
     * @param {number|null} avgScore média 1–5 ou null sem dados
     * @param {{ sampleCount?: number, localOnly?: boolean }} options
     */
    setBatteryFromMoodAverage(avgScore, options = {}) {
      const sampleCount = options.sampleCount ?? 0;
      const localOnly = options.localOnly === true;
      const hasData = sampleCount > 0 && avgScore != null && Number.isFinite(Number(avgScore));

      const avg = hasData ? Math.min(5, Math.max(1, Number(avgScore))) : null;
      const barPct = hasData ? ((avg - 1) / 4) * 100 : 12;

      const tier = hasData ? tierFromAverage(avg) : 'neutral';
      const avgFormatted = hasData ? avg.toFixed(1).replace('.', ',') : '—';

      const fillEl = document.getElementById('battery-mood-bar-fill');
      const captionEl = document.getElementById('battery-mood-caption');
      const circle = document.getElementById('battery-progress-circle');
      const pctEl = document.getElementById('battery-pct');
      const insightEl = document.getElementById('battery-insight-text');

      if (fillEl) {
        fillEl.className =
          'battery-mood-bar__fill battery-mood-bar__fill--' +
          (tier === 'neutral' ? 'neutral' : tier);
        fillEl.style.width = `${Math.round(barPct)}%`;
      }

      if (captionEl) {
        if (localOnly) {
          captionEl.textContent = 'Modo local — configure o Supabase para média de 7 dias';
        } else if (hasData) {
          captionEl.textContent = `Últimos 7 dias · média ${avgFormatted}/5 · ${sampleCount} registro(s)`;
        } else {
          captionEl.textContent = 'Sem registros nos últimos 7 dias — toque num humor acima';
        }
      }

      const strokeTier = hasData ? tier : 'green';
      const strokeColor = hasData ? strokeColorForTier(strokeTier) : '#a8a89a';
      const stops = document.querySelectorAll('#batteryGrad stop');
      if (stops.length >= 1) stops[0].style.stopColor = strokeColor;
      if (stops.length >= 2) stops[1].style.stopColor = '#E2725B';

      if (circle) {
        circle.style.strokeDashoffset = String(CIRCUM * (1 - barPct / 100));
      }

      if (pctEl) {
        pctEl.textContent = hasData ? avgFormatted : '—';
      }

      if (insightEl) {
        if (!hasData) {
          insightEl.textContent = localOnly
            ? 'Preview pelo humor de hoje (dados não foram salvos na nuvem).'
            : 'Sua bateria reflete a média do humor registrado na última semana.';
        } else {
          insightEl.textContent = insightForTier(tier, avgFormatted);
        }
      }
    },

    refreshRefundPendingLabel() {
      const el = document.getElementById('refund-pending-label');
      if (!el) return;
      const raw = localStorage.getItem('aura_refund_pending');
      const c =
        raw === null
          ? 0
          : (() => {
              const n = parseInt(raw, 10);
              return Number.isFinite(n) && n >= 0 ? n : 0;
            })();
      if (c === 0) el.textContent = 'Nenhum reembolso pendente';
      else if (c === 1) el.textContent = '1 reembolso pendente';
      else el.textContent = `${c} reembolsos pendentes`;
      this.refreshHomeNotifications();
    },

    setRefundPendingCount(n) {
      const el = document.getElementById('refund-pending-label');
      if (!el) return;
      const c = typeof n === 'number' && n >= 0 ? n : 0;
      try {
        localStorage.setItem('aura_refund_pending', String(c));
      } catch (e) { /* ignore */ }
      if (c === 0) el.textContent = 'Nenhum reembolso pendente';
      else if (c === 1) el.textContent = '1 reembolso pendente';
      else el.textContent = `${c} reembolsos pendentes`;
      this.refreshHomeNotifications();
    },

    /** Atualiza o badge e o painel do sino (se estiver aberto). */
    refreshHomeNotifications() {
      if (typeof window._auraHomeNotifRefresh === 'function') {
        window._auraHomeNotifRefresh();
      }
    },
  };

  window.AuraDashboard.setBatteryFromMoodAverage(null, { sampleCount: 0 });
  window.AuraDashboard.setAppointmentTarget(null, { countdownText: 'breve' });

  (function applyLocalNextAppointmentHome() {
    if (typeof window.AuraAppointments?.getNextOccurrence !== 'function') {
      window.AuraDashboard?.refreshHomeNotifications?.();
      return;
    }
    const next = window.AuraAppointments.getNextOccurrence();
    if (!next?.startAt) {
      window.AuraDashboard?.refreshHomeNotifications?.();
      return;
    }
    const d = next.startAt;
    const apptTitle = document.getElementById('appointment-title');
    const timeEl = document.getElementById('appointment-time');
    const locEl = document.getElementById('appointment-location');
    const cdLabel = document.getElementById('appointment-countdown-label');
    if (apptTitle) apptTitle.textContent = next.title || 'Próximo compromisso';
    if (timeEl) {
      timeEl.textContent = d.toLocaleString('pt-BR', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        hour: '2-digit',
        minute: '2-digit',
      });
    }
    if (locEl) locEl.textContent = (next.location || '').trim() || 'Local a definir na agenda';
    window.AuraDashboard.setAppointmentTarget(d.toISOString(), {});
    if (cdLabel) cdLabel.textContent = 'Em ';
    window.AuraDashboard?.refreshHomeNotifications?.();
  })();
})();

/* ── Texto de reembolsos pendentes (localStorage; atualizado após upload) ── */
(function initRefundPendingLabel() {
  if (typeof window.AuraDashboard?.refreshRefundPendingLabel === 'function') {
    window.AuraDashboard.refreshRefundPendingLabel();
  }
})();

/* ── Mapa (Agenda) ───────────────────────────────────────── */
(function initAgendaMapsButtons() {
  document.querySelectorAll('[data-aura-maps]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const q = btn.getAttribute('data-maps-query');
      if (q && String(q).trim()) {
        const url =
          'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(String(q).trim());
        window.open(url, '_blank', 'noopener,noreferrer');
        showToast('A abrir o mapa…');
        return;
      }
      showToast('Preenche o local na agenda para abrir rotas no mapa.');
    });
  });
})();

/* ── Sino: painel de notificações (home) ─────────────────── */
(function initHomeNotificationPanel() {
  const panel = document.getElementById('notif-panel');
  const listEl = document.getElementById('notif-panel-list');
  const emptyEl = document.getElementById('notif-panel-empty');
  const btn = document.getElementById('btn-notifications');
  const badge = document.getElementById('notif-badge');
  const backdrop = document.getElementById('notif-panel-backdrop');
  const closeBtn = document.getElementById('notif-panel-close');

  if (!panel || !btn || !listEl || !emptyEl) return;

  let open = false;

  function refundPendingCount() {
    const raw = localStorage.getItem('aura_refund_pending');
    if (raw === null) return 0;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  }

  function buildItems() {
    const items = [];

    if (typeof window.Notification !== 'undefined' && Notification.permission !== 'granted') {
      let hasRemind = false;
      if (typeof window.AuraAppointments?.occurrencesInRange === 'function') {
        const now = new Date();
        const to = new Date(now.getTime() + 14 * 86400000);
        const rows = window.AuraAppointments.occurrencesInRange(now, to);
        hasRemind = rows.some((r) => r.remind15);
      }
      if (hasRemind) {
        items.push({
          id: 'browser',
          title: 'Lembretes no dispositivo',
          body:
            'Ativa as notificações do browser para receberes avisos cerca de 15 minutos antes dos compromissos com lembrete.',
          actions: [
            {
              label: 'Permitir avisos',
              primary: true,
              onClick: (ev) => {
                ev.preventDefault();
                window.AuraAppointmentReminders?.requestPermission?.((ok) => {
                  if (ok && typeof showToast === 'function') showToast('Notificações ativas ✓');
                  else if (!ok && typeof showToast === 'function') {
                    showToast('Não foi possível ativar — verifica as definições do browser.');
                  }
                  syncUI();
                });
              },
            },
            { label: 'Ir a compromissos', href: 'agenda.html', ghost: true },
          ],
        });
      }
    }

    const refunds = refundPendingCount();
    if (refunds > 0) {
      items.push({
        id: 'refund',
        title: 'Reembolsos',
        body:
          refunds === 1
            ? 'Tens 1 pedido de reembolso em análise.'
            : `Tens ${refunds} pedidos de reembolso em análise.`,
        actions: [{ label: 'Ver reembolsos', href: 'reembolsos.html', primary: true }],
      });
    }

    if (typeof window.AuraAppointments?.getNextOccurrence === 'function') {
      const next = window.AuraAppointments.getNextOccurrence();
      if (next?.startAt) {
        const when = next.startAt.toLocaleString('pt-BR', {
          weekday: 'short',
          day: 'numeric',
          month: 'short',
          hour: '2-digit',
          minute: '2-digit',
        });
        const loc = (next.location || '').trim();
        items.push({
          id: 'agenda',
          title: 'Próximo compromisso',
          body: `${next.title || 'Compromisso'} · ${when}${loc ? '\n' + loc : ''}`,
          actions: [{ label: 'Abrir compromissos', href: 'agenda.html', primary: true }],
        });
      }
    }

    return items;
  }

  function renderList() {
    const items = buildItems();
    listEl.innerHTML = '';
    if (items.length === 0) {
      emptyEl.hidden = false;
      listEl.hidden = true;
      return;
    }
    emptyEl.hidden = true;
    listEl.hidden = false;

    items.forEach((item) => {
      const li = document.createElement('li');
      li.className = 'notif-panel__item';
      const title = document.createElement('div');
      title.className = 'notif-panel__item-title';
      title.textContent = item.title;
      const body = document.createElement('div');
      body.className = 'notif-panel__item-body';
      body.textContent = item.body;
      li.appendChild(title);
      li.appendChild(body);

      if (item.actions && item.actions.length) {
        const act = document.createElement('div');
        act.className = 'notif-panel__item-actions';
        item.actions.forEach((a) => {
          if (a.href) {
            const link = document.createElement('a');
            link.href = a.href;
            link.className = 'notif-panel__btn' + (a.ghost ? ' notif-panel__btn--ghost' : '');
            link.textContent = a.label;
            act.appendChild(link);
          } else {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'notif-panel__btn' + (a.ghost ? ' notif-panel__btn--ghost' : '');
            b.textContent = a.label;
            if (a.onClick) b.addEventListener('click', a.onClick);
            act.appendChild(b);
          }
        });
        li.appendChild(act);
      }
      listEl.appendChild(li);
    });
  }

  function updateBadge() {
    const n = buildItems().length;
    if (!badge) return;
    if (n === 0) {
      badge.hidden = true;
      badge.setAttribute('aria-hidden', 'true');
      btn.setAttribute('aria-label', 'Notificações');
      return;
    }
    badge.hidden = false;
    badge.removeAttribute('aria-hidden');
    badge.textContent = n > 9 ? '9+' : String(n);
    btn.setAttribute('aria-label', `Notificações, ${n} ${n === 1 ? 'item' : 'itens'}`);
  }

  function syncUI() {
    updateBadge();
    if (open) renderList();
  }

  window._auraHomeNotifRefresh = syncUI;

  function openPanel() {
    open = true;
    panel.hidden = false;
    panel.setAttribute('aria-hidden', 'false');
    btn.setAttribute('aria-expanded', 'true');
    renderList();
    document.body.style.overflow = 'hidden';
    if (closeBtn) closeBtn.focus();
  }

  function closePanel() {
    open = false;
    panel.hidden = true;
    panel.setAttribute('aria-hidden', 'true');
    btn.setAttribute('aria-expanded', 'false');
    document.body.style.overflow = '';
    btn.focus();
  }

  function togglePanel() {
    if (open) closePanel();
    else openPanel();
  }

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    togglePanel();
  });

  if (backdrop) {
    backdrop.addEventListener('click', closePanel);
  }
  if (closeBtn) {
    closeBtn.addEventListener('click', closePanel);
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && open) {
      e.preventDefault();
      closePanel();
    }
  });

  syncUI();
})();

/* ── Sair (logout) ─────────────────────────────────────── */
(function initLogout() {
  const btn = document.getElementById('btn-logout');
  if (!btn || typeof window.AuraAuth === 'undefined') return;

  btn.addEventListener('click', () => {
    if (navigator.vibrate) navigator.vibrate(25);
    window.AuraAuth.logout();
  });
})();

/* ── Toast Utility ──────────────────────────────────────── */
function showToast(message) {
  // Remove existing toasts
  document.querySelectorAll('.aura-toast').forEach(t => t.remove());

  const toast = document.createElement('div');
  toast.className = 'aura-toast';
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');
  toast.textContent = message;

  Object.assign(toast.style, {
    position:     'fixed',
    bottom:       '96px',
    left:         '50%',
    transform:    'translateX(-50%) translateY(12px)',
    background:   'rgba(45,42,38,.92)',
    color:        '#f5efe4',
    padding:      '11px 20px',
    borderRadius: '40px',
    fontSize:     '.82rem',
    fontFamily:   "'DM Sans', sans-serif",
    fontWeight:   '500',
    boxShadow:    '0 8px 32px rgba(0,0,0,.22)',
    backdropFilter: 'blur(12px)',
    zIndex:       '9999',
    opacity:      '0',
    transition:   'all .28s cubic-bezier(.32,.72,0,1)',
    whiteSpace:   'nowrap',
    maxWidth:     '90vw',
  });

  document.body.appendChild(toast);

  // Animate in
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      toast.style.opacity   = '1';
      toast.style.transform = 'translateX(-50%) translateY(0)';
    });
  });

  // Animate out
  setTimeout(() => {
    toast.style.opacity   = '0';
    toast.style.transform = 'translateX(-50%) translateY(12px)';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

/* ── Card Tilt (subtle 3D on desktop) ──────────────────── */
(function initTilt() {
  const cards = document.querySelectorAll('.bento-card');

  cards.forEach(card => {
    card.addEventListener('mousemove', e => {
      const rect   = card.getBoundingClientRect();
      const x      = (e.clientX - rect.left) / rect.width  - 0.5;
      const y      = (e.clientY - rect.top)  / rect.height - 0.5;
      const tiltX  = (-y * 6).toFixed(2);
      const tiltY  = (x  * 6).toFixed(2);

      card.style.transform = `
        translateY(-4px)
        rotateX(${tiltX}deg)
        rotateY(${tiltY}deg)
      `;
      card.style.transition = 'transform .05s ease';
    });

    card.addEventListener('mouseleave', () => {
      card.style.transform  = '';
      card.style.transition = 'transform .28s cubic-bezier(.32,.72,0,1), box-shadow .28s cubic-bezier(.32,.72,0,1)';
    });
  });
})();
