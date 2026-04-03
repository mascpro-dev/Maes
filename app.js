/* ============================================================
   AURA — app.js
   Dashboard interativo para mães atípicas
   ============================================================ */

'use strict';

/* ── Mood Selector ──────────────────────────────────────── */
(function initMood() {
  const moods = document.querySelectorAll('.mood-btn');

  moods.forEach(btn => {
    btn.addEventListener('click', () => {
      moods.forEach(b => b.classList.remove('mood-btn--active'));
      btn.classList.add('mood-btn--active');

      // Mini haptic feedback via vibration API (mobile)
      if (navigator.vibrate) navigator.vibrate(30);

      // Ripple effect
      const ripple = document.createElement('span');
      ripple.style.cssText = `
        position:absolute; border-radius:50%;
        width:60px; height:60px;
        background:rgba(122,158,126,.25);
        transform:scale(0); animation:ripple .4s ease forwards;
        top:50%; left:50%; margin:-30px 0 0 -30px;
        pointer-events:none;
      `;
      btn.style.position = 'relative';
      btn.style.overflow = 'hidden';
      btn.appendChild(ripple);
      setTimeout(() => ripple.remove(), 400);
    });
  });

  // Inject ripple keyframe
  const style = document.createElement('style');
  style.textContent = `@keyframes ripple { to { transform:scale(2.5); opacity:0; } }`;
  document.head.appendChild(style);
})();

/* ── Countdown Timer ────────────────────────────────────── */
(function initCountdown() {
  const el = document.getElementById('countdown');
  if (!el) return;

  // Appointment fixed at 14:30
  function update() {
    const now  = new Date();
    const appt = new Date();
    appt.setHours(14, 30, 0, 0);

    let diff = appt - now;

    if (diff < 0) {
      el.parentElement.textContent = 'Compromisso encerrado';
      return;
    }

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
  setInterval(update, 30000); // update every 30s
})();

/* ── Battery Gauge Animation ────────────────────────────── */
(function initBattery() {
  const circle = document.getElementById('battery-progress-circle');
  const pctEl  = document.getElementById('battery-pct');
  if (!circle || !pctEl) return;

  const ENERGY = 70; // % (would come from AI in production)
  const R      = 48;
  const CIRCUM = 2 * Math.PI * R; // ≈ 301.59

  // Start from empty (full dashoffset = circumference)
  circle.style.strokeDashoffset = CIRCUM;

  // Animate to target
  requestAnimationFrame(() => {
    setTimeout(() => {
      const offset = CIRCUM * (1 - ENERGY / 100);
      circle.style.strokeDashoffset = offset;
    }, 300);
  });

  // Count-up for percentage label
  let current = 0;
  const step  = ENERGY / 40;
  const timer = setInterval(() => {
    current = Math.min(current + step, ENERGY);
    pctEl.textContent = Math.round(current) + '%';
    if (current >= ENERGY) clearInterval(timer);
  }, 25);

  // Color based on level
  function getBatteryColor(pct) {
    if (pct >= 70) return '#7a9e7e';   // sage
    if (pct >= 40) return '#c47a5b';   // terracotta
    return '#e05050';                   // low
  }

  // Apply dynamic color to gradient stops
  const stops = document.querySelectorAll('#batteryGrad stop');
  const color  = getBatteryColor(ENERGY);
  if (stops.length) {
    stops[0].style.stopColor = color;
  }
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

/* ── Texto de reembolsos pendentes (sincroniza com localStorage, mesma chave que reembolsos.html) ── */
(function initRefundPendingLabel() {
  const el = document.getElementById('refund-pending-label');
  if (!el) return;

  const raw = localStorage.getItem('aura_refund_pending');
  const c =
    raw === null
      ? 2
      : (() => {
          const n = parseInt(raw, 10);
          return Number.isFinite(n) && n >= 0 ? n : 2;
        })();

  if (c === 0) el.textContent = 'Nenhum reembolso pendente';
  else if (c === 1) el.textContent = '1 reembolso pendente';
  else el.textContent = `${c} reembolsos pendentes`;
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
