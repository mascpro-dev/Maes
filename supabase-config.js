/* URL e anon key do Supabase (Settings → API) */
window.AURA_SUPABASE_URL = 'https://ahjhjzdmkkrcgbuxmhww.supabase.co';
window.AURA_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFoamhqemRta2tyY2didXhtaHd3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUyNDgzMzAsImV4cCI6MjA5MDgyNDMzMH0.6m4i6-imaAMm4OYrPteI8890b5dD9o3JOuwhYUf_TbY';

/**
 * URL pública do site (sem barra final), ex.: https://maes-pi.vercel.app
 * Usado no pagamento Mercado Pago (cabeçalho X-Public-Site-Url) se quiseres forçar o domínio.
 * Em HTTPS, a app também envia window.location.origin automaticamente.
 */
window.AURA_APP_PUBLIC_URL = 'https://maes-pi.vercel.app';

/**
 * URL base do site em produção (HTTPS). Usada em links de convite Auth e recuperação de senha.
 * Se AURA_APP_PUBLIC_URL estiver errado ou em localhost, os e-mails levam ao localhost no telemóvel.
 */
window.auraPublicSiteBase = function auraPublicSiteBase() {
  try {
    var u = (window.AURA_APP_PUBLIC_URL || '').trim().replace(/\/$/, '');
    if (/^https:\/\//i.test(u)) return u;
    if (
      typeof window !== 'undefined' &&
      window.location &&
      /^https:\/\//i.test(window.location.origin || '')
    ) {
      return String(window.location.origin).replace(/\/$/, '');
    }
    return '';
  } catch (_) {
    return '';
  }
};

/** E-mail de triagem das candidaturas «Profissional parceiro» (FormSubmit); omite para usar conelheiros@gmail.com no código */
// window.AURA_PARTNER_TRIAGE_EMAIL = '';