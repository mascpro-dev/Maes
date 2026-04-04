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

/* ── Countdown / próximo compromisso (horário dinâmico via AuraDashboard.setAppointmentTarget) ── */
let auraAppointmentCountdownTimer = null;

(function initCountdown() {
  const el = document.getElementById('countdown');
  if (!el) return;

  function clearTimer() {
    if (auraAppointmentCountdownTimer != null) {
      clearInterval(auraAppointmentCountdownTimer);
      auraAppointmentCountdownTimer = null;
    }
  }

  function update() {
    if (el.dataset.mode === 'static') return;
    const iso = el.dataset.appointmentAt;
    if (!iso) return;

    const appt = new Date(iso);
    if (Number.isNaN(appt.getTime())) return;

    const now = new Date();
    let diff = appt - now;
    const label = document.getElementById('appointment-countdown-label');

    if (diff < 0) {
      if (label) label.textContent = '';
      el.textContent = 'Compromisso encerrado';
      clearTimer();
      return;
    }

    if (label) label.textContent = 'Em ';

    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);

    if (h > 0) {
      el.textContent = `${h}h ${m}min`;
    } else if (m > 0) {
      el.textContent = `${m} min`;
    } else {
      el.textContent = 'agora!';
    }
  }

  update();
  auraAppointmentCountdownTimer = setInterval(update, 30000);
})();

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
    },
  };

  window.AuraDashboard.setBatteryFromMoodAverage(null, { sampleCount: 0 });
})();

/* ── Navigation ─────────────────────────────────────────── */
(function initNav() {
  const navBtns = document.querySelectorAll('.nav-btn');

  navBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      navBtns.forEach(b => {
        b.classList.remove('nav-btn--active');
        b.removeAttribute('aria-current');
      });
      btn.classList.add('nav-btn--active');
      btn.setAttribute('aria-current', 'page');
    });
  });
})();

/* ── Texto de reembolsos pendentes (localStorage; atualizado após upload) ── */
(function initRefundPendingLabel() {
  if (typeof window.AuraDashboard?.refreshRefundPendingLabel === 'function') {
    window.AuraDashboard.refreshRefundPendingLabel();
  }
})();

/* ── Directions Button ──────────────────────────────────── */
(function initDirections() {
  const btn = document.getElementById('btn-directions');
  if (!btn) return;

  btn.addEventListener('click', () => {
    showToast('🗺️ Abrindo rotas para Clínica Crescer…');
  });
})();

/* ── Bell Notifications ─────────────────────────────────── */
(function initBell() {
  const btn = document.getElementById('btn-notifications');
  if (!btn) return;

  btn.addEventListener('click', () => {
    showToast('🔔 3 notificações pendentes');
  });
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
