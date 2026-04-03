/* =============================================================
   AURA — scanner.js
   Assistente de Reembolso com simulação de câmera e IA
   ============================================================= */

'use strict';

/* ── Confidence bar animation ────────────────────────────── */
(function initConfidence() {
  const fill  = document.getElementById('confidence-fill');
  const label = document.getElementById('confidence-pct');
  if (!fill || !label) return;

  const TARGET = 94;

  // Delay so the user sees the scan line first
  setTimeout(() => {
    fill.style.width = TARGET + '%';

    let cur = 0;
    const step = TARGET / 35;
    const t = setInterval(() => {
      cur = Math.min(cur + step, TARGET);
      label.textContent = Math.round(cur) + '%';
      if (cur >= TARGET) clearInterval(t);
    }, 22);
  }, 900);
})();

/* ── Flash toggle ────────────────────────────────────────── */
(function initFlash() {
  const btn     = document.getElementById('btn-flash');
  const iconOff = document.getElementById('icon-flash-off');
  const iconOn  = document.getElementById('icon-flash-on');
  if (!btn) return;

  let active = false;

  btn.addEventListener('click', () => {
    active = !active;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-pressed', active);
    iconOff.style.display = active ? 'none'  : '';
    iconOn.style.display  = active ? ''      : 'none';
    showToast(active ? '⚡ Flash ativado' : 'Flash desativado');
  });
})();

/* ── Shutter button ──────────────────────────────────────── */
(function initShutter() {
  const btn         = document.getElementById('btn-shutter');
  const instruction = document.getElementById('instruction-text');
  const tagPrestador= document.getElementById('tag-prestador');
  if (!btn) return;

  // Mark as ready after a short delay
  setTimeout(() => {
    btn.classList.add('ready');
    if (instruction) {
      instruction.textContent = 'Recibo detectado — pronto para capturar!';
      instruction.classList.add('detected');
    }
  }, 2800);

  btn.addEventListener('click', handleShutter);

  function handleShutter() {
    // Flash effect
    const flash = document.createElement('div');
    Object.assign(flash.style, {
      position: 'fixed', inset: '0', background: 'white',
      opacity: '0.85', zIndex: '999', pointerEvents: 'none',
      transition: 'opacity .3s ease',
    });
    document.body.appendChild(flash);
    requestAnimationFrame(() => {
      setTimeout(() => {
        flash.style.opacity = '0';
        setTimeout(() => flash.remove(), 300);
      }, 80);
    });

    // Haptic
    if (navigator.vibrate) navigator.vibrate([40, 30, 60]);

    // Button state
    btn.classList.remove('ready');
    btn.classList.add('fired');
    btn.removeEventListener('click', handleShutter);

    // Show third AI tag
    if (tagPrestador) tagPrestador.classList.remove('hidden');

    // Update instruction
    if (instruction) {
      instruction.textContent = '✓ Capturado! Revisando dados com IA…';
      instruction.classList.add('detected');
    }

    // After analysis delay
    setTimeout(() => {
      if (instruction) {
        instruction.textContent = 'Tudo certo! Confirme e envie ao plano.';
      }
      showToast('📄 Recibo processado com 94% de confiança');
    }, 2000);
  }
})();

/* ── Gallery button ──────────────────────────────────────── */
(function initGallery() {
  const btn = document.getElementById('btn-gallery');
  if (!btn) return;
  btn.addEventListener('click', () => showToast('📂 Abrindo galeria de fotos…'));
})();

/* ── Manual entry button ─────────────────────────────────── */
(function initManual() {
  const btn = document.getElementById('btn-manual');
  if (!btn) return;
  btn.addEventListener('click', () => showToast('✏️ Modo de entrada manual'));
})();

/* ── Confirm button ──────────────────────────────────────── */
(function initConfirm() {
  const btn     = document.getElementById('btn-confirm');
  const overlay = document.getElementById('success-overlay');
  const close   = document.getElementById('btn-success-close');
  if (!btn || !overlay) return;

  btn.addEventListener('click', () => {
    // Loading state
    btn.textContent = 'Enviando…';
    btn.disabled = true;
    btn.style.opacity = '.7';

    if (navigator.vibrate) navigator.vibrate([30, 40, 80]);

    setTimeout(() => {
      overlay.classList.remove('hidden');
    }, 1200);
  });

  if (close) {
    close.addEventListener('click', () => {
      overlay.classList.add('hidden');
      window.location.href = 'index.html';
    });
  }
})();

/* ── AI Tag hover hints ──────────────────────────────────── */
(function initTagHints() {
  document.querySelectorAll('.ai-tag').forEach(tag => {
    tag.style.pointerEvents = 'auto';
    tag.style.cursor = 'default';

    tag.addEventListener('mouseenter', () => {
      tag.style.transform = 'scale(1.04)';
      tag.style.transition = 'transform .2s ease';
      tag.style.zIndex = '20';
    });
    tag.addEventListener('mouseleave', () => {
      tag.style.transform = 'scale(1)';
      tag.style.zIndex = '';
    });
  });
})();

/* ── Animated receipt highlight pulse ───────────────────── */
(function animateHighlights() {
  const highlights = document.querySelectorAll('.rline--highlight');
  highlights.forEach((el, i) => {
    el.style.animationDelay = (i * 0.4) + 's';
  });
})();

/* ── Toast ───────────────────────────────────────────────── */
function showToast(message) {
  document.querySelectorAll('.scanner-toast').forEach(t => t.remove());

  const toast = document.createElement('div');
  toast.className = 'scanner-toast';
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');
  toast.textContent = message;

  Object.assign(toast.style, {
    position:       'fixed',
    top:            '80px',
    left:           '50%',
    transform:      'translateX(-50%) translateY(-10px)',
    background:     'rgba(28,26,22,.96)',
    color:          '#f5efe4',
    padding:        '10px 20px',
    borderRadius:   '40px',
    fontSize:       '.8rem',
    fontFamily:     "'DM Sans', sans-serif",
    fontWeight:     '500',
    boxShadow:      '0 8px 30px rgba(0,0,0,.4)',
    backdropFilter: 'blur(12px)',
    border:         '1px solid rgba(255,255,255,.1)',
    zIndex:         '9999',
    opacity:        '0',
    transition:     'all .25s cubic-bezier(.32,.72,0,1)',
    whiteSpace:     'nowrap',
    maxWidth:       '90vw',
  });

  document.body.appendChild(toast);

  requestAnimationFrame(() => requestAnimationFrame(() => {
    toast.style.opacity   = '1';
    toast.style.transform = 'translateX(-50%) translateY(0)';
  }));

  setTimeout(() => {
    toast.style.opacity   = '0';
    toast.style.transform = 'translateX(-50%) translateY(-10px)';
    setTimeout(() => toast.remove(), 260);
  }, 2800);
}
