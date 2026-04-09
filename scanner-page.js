'use strict';

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.1/+esm';

const STORAGE_BUCKET = 'receipts';
const DEFAULT_RECIPIENT =
  'Plano de saúde ou genitor (envio por ti, com relatório impresso do Conta Mãe)';

const inputCamera = document.getElementById('input-camera');
const inputGallery = document.getElementById('input-gallery');
const btnShutter = document.getElementById('btn-shutter');
const btnGallery = document.getElementById('btn-gallery');
const btnManual = document.getElementById('btn-manual');
const btnFlash = document.getElementById('btn-flash');
const instruction = document.getElementById('instruction-text');
const receiptSim = document.getElementById('receipt-sim');
const tagPrestador = document.getElementById('tag-prestador');
const confidenceFill = document.getElementById('confidence-fill');
const confidencePct = document.getElementById('confidence-pct');
const btnConfirm = document.getElementById('btn-confirm');
const successOverlay = document.getElementById('success-overlay');
const btnSuccessClose = document.getElementById('btn-success-close');
const iconFlashOff = document.getElementById('icon-flash-off');
const iconFlashOn = document.getElementById('icon-flash-on');
const manualPanel = document.getElementById('scan-manual-panel');
const successAmountEl = document.getElementById('success-amount-line');
const successSubEl = document.getElementById('success-sub-dynamic');

const isMobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);

/** @type {{ file: File | null, dataUrl: string | null, ocrText: string, ocrConfidence: number | null, amountCents: number | null, serviceDate: Date | null, providerName: string, serviceType: string }} */
let scanState = {
  file: null,
  dataUrl: null,
  ocrText: '',
  ocrConfidence: null,
  amountCents: null,
  serviceDate: null,
  providerName: '',
  serviceType: '',
};

function extFromMime(file) {
  const t = (file.type || '').toLowerCase();
  if (t.includes('png')) return 'png';
  if (t.includes('webp')) return 'webp';
  if (t.includes('heic')) return 'heic';
  return 'jpg';
}

function formatBRL(cents) {
  if (cents == null || !Number.isFinite(Number(cents))) return '—';
  return (Number(cents) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatDateBR(d) {
  if (!d || !(d instanceof Date) || Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
}

function toISODate(d) {
  if (!d || !(d instanceof Date) || Number.isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseMoneyToCents(input) {
  const s = String(input || '')
    .trim()
    .replace(/R\$\s*/i, '')
    .replace(/\s/g, '')
    .replace(/\./g, '')
    .replace(',', '.');
  const n = parseFloat(s);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

function parseDateBRField(input) {
  const s = String(input || '').trim();
  const m = s.match(/^(\d{2})[/.-](\d{2})[/.-](\d{4})$/);
  if (!m) return null;
  const d = new Date(+m[3], +m[2] - 1, +m[1]);
  return Number.isNaN(d.getTime()) ? null : d;
}

function inferServiceType(full, lines) {
  const lower = (full || '').toLowerCase();
  if (/fisio|fisioterapia/.test(lower)) return 'Fisioterapia';
  if (/consulta|clínico|clinico|médico|medico/.test(lower)) return 'Consulta';
  if (/exame|laborat|análise|analise/.test(lower)) return 'Exame';
  if (/aba|terapia/.test(lower)) return 'Terapia / ABA';
  const joined = lines.slice(0, 5).join(' ');
  if (/fisio/i.test(joined)) return 'Fisioterapia';
  return 'Serviço de saúde';
}

function parseReceiptText(text) {
  const full = text || '';
  let amountCents = null;
  let bestVal = 0;
  const moneyRe =
    /R\$\s*([\d]{1,3}(?:\.\d{3})*,\d{2}|[\d]+,\d{2})|(?:^|\s)(\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2})(?=\s*$|\s*\n)/gi;
  let mm;
  while ((mm = moneyRe.exec(full)) !== null) {
    const raw = (mm[1] || mm[2] || '').replace(/\./g, '').replace(',', '.');
    const num = parseFloat(raw);
    if (Number.isFinite(num) && num > bestVal && num < 1_000_000) {
      bestVal = num;
      amountCents = Math.round(num * 100);
    }
  }
  let serviceDate = null;
  const dateRe = /(\d{2})[/.-](\d{2})[/.-](\d{4})/g;
  let dm;
  while ((dm = dateRe.exec(full)) !== null) {
    const d = new Date(+dm[3], +dm[2] - 1, +dm[1]);
    const y = d.getFullYear();
    if (!Number.isNaN(d.getTime()) && y >= 2020 && y <= 2035) serviceDate = d;
  }
  const lines = full
    .split(/\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  let providerName = '';
  for (const line of lines.slice(0, 12)) {
    if (/^\d{2}\.\d{3}\.\d{3}\//.test(line)) continue;
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(line)) continue;
    if (/^CNPJ/i.test(line)) continue;
    if (line.length < 3) continue;
    if (/^[\d\s./-]+$/.test(line)) continue;
    providerName = line.slice(0, 120);
    break;
  }
  const serviceType = inferServiceType(full, lines);
  return { amountCents, serviceDate, providerName, serviceType };
}

function resizeDataUrl(dataUrl, maxSide) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      if (width <= maxSide && height <= maxSide) {
        resolve(dataUrl);
        return;
      }
      const scale = maxSide / Math.max(width, height);
      width = Math.round(width * scale);
      height = Math.round(height * scale);
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', 0.88));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

function setTagText(tagRoot, value) {
  if (!tagRoot) return;
  const el = tagRoot.querySelector('.ai-tag__value');
  if (el) el.textContent = value;
}

function updateDetectionUI() {
  const vCents = readAmountCents();
  const d = readServiceDate();
  const prov = readProvider();
  const tipo = readServiceTypeField();

  setTagText(document.getElementById('tag-valor'), formatBRL(vCents));
  setTagText(document.getElementById('tag-data'), formatDateBR(d));
  setTagText(document.getElementById('tag-prestador'), prov || '—');

  const chipValor = document.getElementById('chip-valor-val');
  const chipData = document.getElementById('chip-data-val');
  const chipTipo = document.getElementById('chip-tipo-val');
  if (chipValor) chipValor.textContent = formatBRL(vCents);
  if (chipData) chipData.textContent = formatDateBR(d);
  if (chipTipo) chipTipo.textContent = tipo || '—';
}

function readAmountCents() {
  const field = document.getElementById('scan-field-valor');
  if (field && String(field.value || '').trim()) {
    const p = parseMoneyToCents(field.value);
    if (p != null) return p;
  }
  return scanState.amountCents;
}

function readServiceDate() {
  const field = document.getElementById('scan-field-data');
  if (field && String(field.value || '').trim()) {
    const p = parseDateBRField(field.value);
    if (p) return p;
  }
  return scanState.serviceDate;
}

function readProvider() {
  const field = document.getElementById('scan-field-prestador');
  if (field && String(field.value || '').trim()) return String(field.value).trim().slice(0, 200);
  return scanState.providerName || '';
}

function readServiceTypeField() {
  const field = document.getElementById('scan-field-tipo');
  if (field && String(field.value || '').trim()) return String(field.value).trim().slice(0, 120);
  return scanState.serviceType || '';
}

function fillManualFields() {
  const fv = document.getElementById('scan-field-valor');
  const fd = document.getElementById('scan-field-data');
  const fp = document.getElementById('scan-field-prestador');
  const ft = document.getElementById('scan-field-tipo');
  if (fv && scanState.amountCents != null) {
    fv.value = (scanState.amountCents / 100).toFixed(2).replace('.', ',');
  }
  if (fd && scanState.serviceDate) {
    const d = scanState.serviceDate;
    fd.value = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
  }
  if (fp) fp.value = scanState.providerName || '';
  if (ft) ft.value = scanState.serviceType || '';
}

function setInstruction(text, isDetected) {
  if (!instruction) return;
  instruction.textContent = text;
  instruction.classList.toggle('detected', !!isDetected);
}

function animateConfidence(target) {
  if (!confidenceFill || !confidencePct) return;
  const t = Math.max(0, Math.min(100, Math.round(target)));
  confidenceFill.style.width = '0%';
  setTimeout(() => {
    confidenceFill.style.width = `${t}%`;
    let cur = 0;
    const step = t / 35 || 0.01;
    const id = setInterval(() => {
      cur = Math.min(cur + step, t);
      confidencePct.textContent = `${Math.round(cur)}%`;
      if (cur >= t) clearInterval(id);
    }, 22);
  }, 200);
}

function triggerFlash() {
  const flash = document.createElement('div');
  Object.assign(flash.style, {
    position: 'fixed',
    inset: '0',
    background: 'white',
    opacity: '0.9',
    zIndex: '999',
    pointerEvents: 'none',
    transition: 'opacity .25s ease',
  });
  document.body.appendChild(flash);
  requestAnimationFrame(() =>
    setTimeout(() => {
      flash.style.opacity = '0';
      setTimeout(() => flash.remove(), 260);
    }, 60)
  );
}

function showToast(message) {
  document.querySelectorAll('.scanner-toast').forEach((t) => t.remove());
  const toast = document.createElement('div');
  toast.className = 'scanner-toast';
  toast.setAttribute('role', 'status');
  toast.textContent = message;
  Object.assign(toast.style, {
    position: 'fixed',
    top: '76px',
    left: '50%',
    transform: 'translateX(-50%) translateY(-8px)',
    background: 'rgba(28,26,22,.96)',
    color: '#f5efe4',
    padding: '10px 20px',
    borderRadius: '40px',
    fontSize: '.8rem',
    fontFamily: "'DM Sans', sans-serif",
    fontWeight: '500',
    boxShadow: '0 8px 30px rgba(0,0,0,.4)',
    zIndex: '9999',
    opacity: '0',
    transition: 'all .22s cubic-bezier(.32,.72,0,1)',
    maxWidth: '90vw',
    textAlign: 'center',
  });
  document.body.appendChild(toast);
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      toast.style.opacity = '1';
      toast.style.transform = 'translateX(-50%) translateY(0)';
    })
  );
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(-50%) translateY(-8px)';
    setTimeout(() => toast.remove(), 250);
  }, 3200);
}

async function runOcrOnDataUrl(dataUrl) {
  const { createWorker } = await import('https://cdn.jsdelivr.net/npm/tesseract.js@5/+esm');
  const worker = await createWorker('por');
  try {
    const resized = await resizeDataUrl(dataUrl, 1400);
    const {
      data: { text, confidence },
    } = await worker.recognize(resized);
    return { text: text || '', confidence: typeof confidence === 'number' ? confidence : 0 };
  } finally {
    await worker.terminate();
  }
}

function renderReceiptPreview(dataUrl) {
  if (!receiptSim) return;
  receiptSim.innerHTML = '';
  receiptSim.style.padding = '0';
  receiptSim.style.background = 'transparent';
  receiptSim.style.boxShadow = 'none';
  const img = document.createElement('img');
  img.src = dataUrl;
  img.alt = 'Recibo fotografado';
  Object.assign(img.style, {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    borderRadius: '4px',
    display: 'block',
  });
  receiptSim.appendChild(img);
}

async function handlePhoto(file) {
  if (!file || !file.type || !file.type.startsWith('image/')) {
    showToast('Escolhe uma imagem válida.');
    return;
  }

  scanState.file = file;
  const reader = new FileReader();
  reader.onload = async (ev) => {
    const dataUrl = ev.target.result;
    scanState.dataUrl = dataUrl;
    renderReceiptPreview(dataUrl);
    triggerFlash();
    if (navigator.vibrate) navigator.vibrate([40, 30, 60]);

    btnShutter.classList.remove('ready');
    btnShutter.classList.add('fired');

    setInstruction('⏳ A preparar leitura do recibo…', false);
    animateConfidence(5);
    if (tagPrestador) tagPrestador.classList.add('hidden');

    try {
      const { text, confidence } = await runOcrOnDataUrl(dataUrl);
      scanState.ocrText = text;
      scanState.ocrConfidence = confidence;
      const parsed = parseReceiptText(text);
      scanState.amountCents = parsed.amountCents;
      scanState.serviceDate = parsed.serviceDate;
      scanState.providerName = parsed.providerName;
      scanState.serviceType = parsed.serviceType;

      fillManualFields();
      updateDetectionUI();
      if (manualPanel) manualPanel.classList.remove('hidden');

      if (tagPrestador) tagPrestador.classList.remove('hidden');

      const confDisplay = Math.max(0, Math.min(100, Math.round(confidence)));
      animateConfidence(confDisplay);
      setInstruction(
        confDisplay >= 55
          ? '✓ Dados sugeridos — confirma ou corrige abaixo antes de enviar.'
          : 'Leitura incerta — ajusta valor, data e prestador manualmente.',
        true
      );
      showToast(
        confDisplay >= 55
          ? `Recibo analisado (~${confDisplay}% confiança)`
          : 'Confere os dados manualmente'
      );
    } catch (err) {
      console.warn('[scanner] OCR:', err);
      scanState.ocrText = '';
      scanState.ocrConfidence = 0;
      fillManualFields();
      updateDetectionUI();
      if (manualPanel) manualPanel.classList.remove('hidden');
      if (tagPrestador) tagPrestador.classList.remove('hidden');
      animateConfidence(0);
      setInstruction('Não foi possível ler automaticamente. Preenche os dados à mão.', true);
      showToast('Preenche valor, data e prestador manualmente');
    }
  };
  reader.readAsDataURL(file);
}

async function main() {
  if (window.__auraAuthReady) {
    const ok = await window.__auraAuthReady;
    if (!ok) return;
  }

  const url = window.AURA_SUPABASE_URL;
  const key = window.AURA_SUPABASE_ANON_KEY;
  const supabase =
    window.__auraSupabaseClient ||
    (url && key
      ? createClient(url, key, {
          auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
        })
      : null);

  const {
    data: { session },
  } = supabase ? await supabase.auth.getSession() : { data: { session: null } };
  const userId = session?.user?.id;
  if (!supabase || !userId) {
    showToast('Sessão inválida. Entra de novo.');
    setTimeout(() => {
      window.location.href = 'login.html';
    }, 1600);
    return;
  }

  document.documentElement.classList.remove('aura-auth-checking');

  btnShutter.addEventListener('click', () => {
    if (isMobile) inputCamera.click();
    else {
      showToast('Escolhe o recibo na galeria.');
      inputGallery.click();
    }
  });

  inputCamera.addEventListener('change', (e) => {
    const file = e.target.files && e.target.files[0];
    inputCamera.value = '';
    if (file) handlePhoto(file);
  });

  btnGallery.addEventListener('click', () => inputGallery.click());
  inputGallery.addEventListener('change', (e) => {
    const file = e.target.files && e.target.files[0];
    inputGallery.value = '';
    if (file) handlePhoto(file);
  });

  ['scan-field-valor', 'scan-field-data', 'scan-field-prestador', 'scan-field-tipo'].forEach((id) => {
    const el = document.getElementById(id);
    el &&
      el.addEventListener('input', () => {
        updateDetectionUI();
      });
  });

  btnManual &&
    btnManual.addEventListener('click', () => {
      if (manualPanel) {
        manualPanel.classList.toggle('hidden');
        if (!manualPanel.classList.contains('hidden')) {
          fillManualFields();
          document.getElementById('scan-field-valor')?.focus();
          showToast('Ajusta os campos e confirma o envio');
        }
      }
    });

  let flashActive = false;
  btnFlash &&
    btnFlash.addEventListener('click', () => {
      flashActive = !flashActive;
      btnFlash.classList.toggle('active', flashActive);
      btnFlash.setAttribute('aria-pressed', String(flashActive));
      if (iconFlashOff) iconFlashOff.style.display = flashActive ? 'none' : '';
      if (iconFlashOn) iconFlashOn.style.display = flashActive ? '' : 'none';
      showToast(flashActive ? 'Flash ativado (quando o dispositivo permitir)' : 'Flash desativado');
    });

  let sending = false;
  btnConfirm &&
    btnConfirm.addEventListener('click', async () => {
      if (sending) return;
      if (!scanState.file && !scanState.dataUrl) {
        showToast('Primeiro fotografa ou escolhe o recibo.');
        return;
      }

      const amountCents = readAmountCents();
      const serviceDate = readServiceDate();
      const providerName = readProvider();
      const serviceType = readServiceTypeField();

      sending = true;
      const originalHtml = btnConfirm.innerHTML;
      btnConfirm.innerHTML = `
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"
         stroke-linecap="round" stroke-linejoin="round"
         style="animation:spin .7s linear infinite">
      <circle cx="12" cy="12" r="10" stroke-opacity=".25"/>
      <path d="M12 2a10 10 0 0 1 10 10" />
    </svg>
    A enviar…
  `;
      btnConfirm.disabled = true;
      btnConfirm.style.opacity = '.75';

      const spin = document.createElement('style');
      spin.textContent = '@keyframes spin { to { transform: rotate(360deg); } }';
      document.head.appendChild(spin);
      if (navigator.vibrate) navigator.vibrate([30, 40, 80]);

      try {
        const file = scanState.file;
        const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extFromMime(file)}`;

        const { error: upErr } = await supabase.storage.from(STORAGE_BUCKET).upload(path, file, {
          cacheControl: '3600',
          upsert: false,
          contentType: file.type || 'image/jpeg',
        });

        if (upErr) {
          console.warn('[scanner] storage:', upErr.message);
          showToast('Falha no upload do recibo. Verifica o bucket receipts.');
          return;
        }

        const row = {
          user_id: userId,
          status: 'pendente',
          receipt_path: path,
          amount_cents: amountCents,
          service_date: toISODate(serviceDate),
          provider_name: providerName || null,
          service_type: serviceType || null,
          recipient_label: DEFAULT_RECIPIENT,
          ocr_confidence:
            scanState.ocrConfidence != null ? Math.round(Math.max(0, Math.min(100, scanState.ocrConfidence))) : null,
          raw_ocr_snippet: (scanState.ocrText || '').slice(0, 2000) || null,
        };

        const { error: insErr } = await supabase.from('refunds').insert(row);

        if (insErr) {
          console.warn('[scanner] refunds insert:', insErr.message);
          showToast('Upload ok, mas falhou ao registar o pedido. Aplica a migração SQL dos reembolsos.');
          return;
        }

        try {
          const { count } = await supabase
            .from('refunds')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', userId)
            .eq('status', 'pendente');
          const pendingN = typeof count === 'number' ? count : 0;
          localStorage.setItem('aura_refund_pending', String(pendingN));
        } catch (_) {
          /* ignore */
        }

        window.AuraDashboard?.refreshRefundPendingLabel?.();

        const amountLine = formatBRL(amountCents);
        if (successAmountEl) {
          successAmountEl.innerHTML = `Pedido de <strong>${amountLine}</strong> está em <strong>Pendentes</strong>. Confere os dados e toca em <strong>Tudo certo</strong> para o passar ao relatório.`;
        }
        if (successSubEl) {
          successSubEl.textContent =
            'Só depois desse OK é que o pedido entra na lista para imprimires e enviares tu ao plano ou ao genitor.';
        }
        successOverlay && successOverlay.classList.remove('hidden');
      } finally {
        sending = false;
        btnConfirm.innerHTML = originalHtml;
        btnConfirm.disabled = false;
        btnConfirm.style.opacity = '';
      }
    });

  btnSuccessClose &&
    btnSuccessClose.addEventListener('click', () => {
      window.location.href = 'index.html';
    });

  document.querySelectorAll('.ai-tag').forEach((tag) => {
    tag.style.pointerEvents = 'auto';
    tag.addEventListener('mouseenter', () => {
      tag.style.transform = 'scale(1.04)';
      tag.style.transition = 'transform .2s ease';
      tag.style.zIndex = '20';
    });
    tag.addEventListener('mouseleave', () => {
      tag.style.transform = '';
      tag.style.zIndex = '';
    });
  });

  const vf = document.getElementById('viewfinder');
  if (vf && !isMobile) {
    vf.addEventListener('mousemove', (e) => {
      const r = vf.getBoundingClientRect();
      const x = ((e.clientX - r.left) / r.width - 0.5) * 5;
      const y = ((e.clientY - r.top) / r.height - 0.5) * 5;
      vf.style.transform = `perspective(700px) rotateY(${x}deg) rotateX(${-y}deg)`;
      vf.style.transition = 'transform .05s ease';
    });
    vf.addEventListener('mouseleave', () => {
      vf.style.transform = '';
      vf.style.transition = 'transform .4s ease';
    });
  }

  setTimeout(() => {
    btnShutter.classList.add('ready');
    setInstruction(
      isMobile ? 'Toca em 📷 para fotografar o recibo' : 'Usa Galeria ou 📷 para escolher o recibo',
      true
    );
    animateConfidence(0);
    if (confidencePct) confidencePct.textContent = '0%';
  }, 600);
}

main();
