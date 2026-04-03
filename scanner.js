/* =============================================================
   AURA — scanner.js  (v2 — câmera real no celular)
   ============================================================= */

'use strict';

/* ── Elementos principais ────────────────────────────────── */
const inputCamera  = document.getElementById('input-camera');
const inputGallery = document.getElementById('input-gallery');
const btnShutter   = document.getElementById('btn-shutter');
const btnGallery   = document.getElementById('btn-gallery');
const btnManual    = document.getElementById('btn-manual');
const btnFlash     = document.getElementById('btn-flash');
const instruction  = document.getElementById('instruction-text');
const receiptSim   = document.getElementById('receipt-sim');
const tagPrestador = document.getElementById('tag-prestador');
const confidenceFill = document.getElementById('confidence-fill');
const confidencePct  = document.getElementById('confidence-pct');
const btnConfirm   = document.getElementById('btn-confirm');
const successOverlay = document.getElementById('success-overlay');
const btnSuccessClose = document.getElementById('btn-success-close');
const iconFlashOff = document.getElementById('icon-flash-off');
const iconFlashOn  = document.getElementById('icon-flash-on');

/* ── Detecta mobile ──────────────────────────────────────── */
const isMobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);

/* ────────────────────────────────────────────────────────────
   BOTÃO OBTURADOR
   - Mobile: abre a câmera traseira do celular via input[capture]
   - Desktop: anima a captura simulada
   ──────────────────────────────────────────────────────────── */
btnShutter.addEventListener('click', () => {
  if (isMobile) {
    // Abre câmera nativa traseira
    inputCamera.click();
  } else {
    // Desktop: simula captura
    simulateCapture();
  }
});

/* ── Quando o usuário tira/escolhe foto (câmera) ─────────── */
inputCamera.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (file) handlePhoto(file);
  // Limpa para permitir re-seleção da mesma foto
  inputCamera.value = '';
});

/* ────────────────────────────────────────────────────────────
   BOTÃO GALERIA
   ──────────────────────────────────────────────────────────── */
btnGallery.addEventListener('click', () => {
  inputGallery.click();
});

inputGallery.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (file) handlePhoto(file);
  inputGallery.value = '';
});

/* ────────────────────────────────────────────────────────────
   LIDA COM A FOTO SELECIONADA
   Mostra preview no visor e dispara fluxo de "análise IA"
   ──────────────────────────────────────────────────────────── */
function handlePhoto(file) {
  const reader = new FileReader();

  reader.onload = (ev) => {
    // Substitui o recibo simulado pela foto real
    receiptSim.innerHTML = '';
    receiptSim.style.padding = '0';
    receiptSim.style.background = 'transparent';
    receiptSim.style.boxShadow = 'none';

    const img = document.createElement('img');
    img.src = ev.target.result;
    img.alt = 'Recibo fotografado';
    Object.assign(img.style, {
      width: '100%',
      height: '100%',
      objectFit: 'cover',
      borderRadius: '4px',
      display: 'block',
    });
    receiptSim.appendChild(img);

    // Efeito de flash ao capturar
    triggerFlash();

    // Inicia análise IA
    startAIAnalysis();
  };

  reader.readAsDataURL(file);
}

/* ────────────────────────────────────────────────────────────
   SIMULAÇÃO DESKTOP (sem câmera real)
   ──────────────────────────────────────────────────────────── */
function simulateCapture() {
  triggerFlash();
  if (navigator.vibrate) navigator.vibrate([40, 30, 60]);

  btnShutter.classList.remove('ready');
  btnShutter.classList.add('fired');

  startAIAnalysis();
}

/* ────────────────────────────────────────────────────────────
   FLUXO DE "ANÁLISE IA"
   ──────────────────────────────────────────────────────────── */
function startAIAnalysis() {
  // Feedback imediato
  setInstruction('⏳ Analisando recibo com IA…', false);
  btnShutter.classList.add('fired');

  // Barra de confiança
  animateConfidence(94);

  // Aparece 3ª tag após 1.5s
  setTimeout(() => {
    if (tagPrestador) tagPrestador.classList.remove('hidden');
  }, 1500);

  // Mensagem final após 2.5s
  setTimeout(() => {
    setInstruction('✓ Tudo certo! Confirme e envie ao plano.', true);
    showToast('📄 Recibo processado com 94% de confiança');
  }, 2500);
}

/* ── Barra de confiança ──────────────────────────────────── */
function animateConfidence(target) {
  confidenceFill.style.width = '0%';

  setTimeout(() => {
    confidenceFill.style.width = target + '%';
    let cur = 0;
    const step = target / 35;
    const t = setInterval(() => {
      cur = Math.min(cur + step, target);
      confidencePct.textContent = Math.round(cur) + '%';
      if (cur >= target) clearInterval(t);
    }, 22);
  }, 200);
}

/* ── Instrução de status ─────────────────────────────────── */
function setInstruction(text, isDetected) {
  if (!instruction) return;
  instruction.textContent = text;
  instruction.classList.toggle('detected', isDetected);
}

/* ── Efeito de flash ─────────────────────────────────────── */
function triggerFlash() {
  const flash = document.createElement('div');
  Object.assign(flash.style, {
    position: 'fixed', inset: '0',
    background: 'white', opacity: '0.9',
    zIndex: '999', pointerEvents: 'none',
    transition: 'opacity .25s ease',
  });
  document.body.appendChild(flash);
  requestAnimationFrame(() => setTimeout(() => {
    flash.style.opacity = '0';
    setTimeout(() => flash.remove(), 260);
  }, 60));
}

/* ────────────────────────────────────────────────────────────
   ESTADO INICIAL — "pronto para capturar" após 2.8s
   ──────────────────────────────────────────────────────────── */
setTimeout(() => {
  btnShutter.classList.add('ready');
  setInstruction(
    isMobile
      ? 'Toque 📷 para abrir a câmera'
      : 'Recibo detectado — pronto para capturar!',
    true
  );
}, 2800);

/* ── Barra de confiança inicial ──────────────────────────── */
(function initConfidenceBar() {
  setTimeout(() => animateConfidence(94), 900);
})();

/* ────────────────────────────────────────────────────────────
   FLASH BUTTON
   ──────────────────────────────────────────────────────────── */
let flashActive = false;

btnFlash && btnFlash.addEventListener('click', () => {
  flashActive = !flashActive;
  btnFlash.classList.toggle('active', flashActive);
  btnFlash.setAttribute('aria-pressed', flashActive);
  iconFlashOff.style.display = flashActive ? 'none' : '';
  iconFlashOn.style.display  = flashActive ? ''     : 'none';
  showToast(flashActive ? '⚡ Flash ativado' : 'Flash desativado');
});

/* ────────────────────────────────────────────────────────────
   ENTRADA MANUAL
   ──────────────────────────────────────────────────────────── */
btnManual && btnManual.addEventListener('click', () => {
  showToast('✏️ Modo de entrada manual');
});

/* ────────────────────────────────────────────────────────────
   CONFIRMAR E ENVIAR
   ──────────────────────────────────────────────────────────── */
btnConfirm && btnConfirm.addEventListener('click', () => {
  btnConfirm.innerHTML = `
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"
         stroke-linecap="round" stroke-linejoin="round"
         style="animation:spin .7s linear infinite">
      <circle cx="12" cy="12" r="10" stroke-opacity=".25"/>
      <path d="M12 2a10 10 0 0 1 10 10" />
    </svg>
    Enviando…
  `;
  btnConfirm.disabled = true;
  btnConfirm.style.opacity = '.75';

  const style = document.createElement('style');
  style.textContent = '@keyframes spin { to { transform: rotate(360deg); } }';
  document.head.appendChild(style);

  if (navigator.vibrate) navigator.vibrate([30, 40, 80]);

  setTimeout(() => {
    successOverlay && successOverlay.classList.remove('hidden');
  }, 1300);
});

btnSuccessClose && btnSuccessClose.addEventListener('click', () => {
  window.location.href = 'index.html';
});

/* ────────────────────────────────────────────────────────────
   AI TAGS — hover interativo
   ──────────────────────────────────────────────────────────── */
document.querySelectorAll('.ai-tag').forEach(tag => {
  tag.style.pointerEvents = 'auto';
  tag.addEventListener('mouseenter', () => {
    tag.style.transform  = 'scale(1.04)';
    tag.style.transition = 'transform .2s ease';
    tag.style.zIndex     = '20';
  });
  tag.addEventListener('mouseleave', () => {
    tag.style.transform = '';
    tag.style.zIndex    = '';
  });
});

/* ────────────────────────────────────────────────────────────
   TILT 3D NO CARD (desktop)
   ──────────────────────────────────────────────────────────── */
const vf = document.getElementById('viewfinder');
if (vf && !isMobile) {
  vf.addEventListener('mousemove', e => {
    const r = vf.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width  - 0.5) * 5;
    const y = ((e.clientY - r.top)  / r.height - 0.5) * 5;
    vf.style.transform = `perspective(700px) rotateY(${x}deg) rotateX(${-y}deg)`;
    vf.style.transition = 'transform .05s ease';
  });
  vf.addEventListener('mouseleave', () => {
    vf.style.transform  = '';
    vf.style.transition = 'transform .4s ease';
  });
}

/* ────────────────────────────────────────────────────────────
   TOAST
   ──────────────────────────────────────────────────────────── */
function showToast(message) {
  document.querySelectorAll('.scanner-toast').forEach(t => t.remove());

  const toast = document.createElement('div');
  toast.className = 'scanner-toast';
  toast.setAttribute('role', 'status');
  toast.textContent = message;

  Object.assign(toast.style, {
    position:       'fixed',
    top:            '76px',
    left:           '50%',
    transform:      'translateX(-50%) translateY(-8px)',
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
    transition:     'all .22s cubic-bezier(.32,.72,0,1)',
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
    toast.style.transform = 'translateX(-50%) translateY(-8px)';
    setTimeout(() => toast.remove(), 250);
  }, 2800);
}
