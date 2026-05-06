/**
 * Linha fixa inferior: crédito Conexões Consultorias + suporte WhatsApp.
 * Idempotente — pode incluir várias vezes sem duplicar.
 */
(function () {
  if (document.getElementById('site-attribution-mount')) return;

  var st = document.createElement('style');
  st.textContent =
    '.site-attribution{' +
    'position:fixed;z-index:9998;bottom:0;left:0;right:0;' +
    'padding:2px 8px max(3px, env(safe-area-inset-bottom));' +
    'text-align:center;font-size:clamp(9px, 2vw, 11px);line-height:1.25;' +
    'color:rgba(42,38,32,0.42);background:rgba(247,243,238,0.94);' +
    'border-top:1px solid rgba(42,38,32,0.06);pointer-events:none;' +
    'font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;' +
    'letter-spacing:-0.01em;}' +
    '.site-attribution a{color:inherit;text-decoration:underline;' +
    'text-underline-offset:2px;pointer-events:auto;' +
    '}' +
    '.site-attribution a:hover{color:rgba(42,38,32,0.62);}';

  var head = document.head || document.documentElement.firstChild;
  if (head) head.appendChild(st);

  var el = document.createElement('footer');
  el.id = 'site-attribution-mount';
  el.className = 'site-attribution';
  el.setAttribute('role', 'contentinfo');
  el.setAttribute(
    'aria-label',
    'Desenvolvimento Conexões Consultorias e contacto de suporte',
  );
  el.innerHTML =
    '<span class="site-attribution__txt">by Conexões Consultorias | Suporte</span> ' +
    '<a href="https://wa.me/5514991570389" target="_blank" rel="noopener noreferrer">' +
    '14-99157-0389 WhatsApp</a>';

  (document.body || document.documentElement).appendChild(el);
})();
