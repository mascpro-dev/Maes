'use strict';

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
