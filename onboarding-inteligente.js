/**
 * Onboarding "inteligente": mapeia desafios → texto e escolhe variante da mensagem
 * (lógica determinística leve, sem API — podes ligar OpenAI depois neste módulo).
 */

export const CHALLENGE_LABELS = {
  sono: 'sono',
  alimentacao: 'alimentação',
  escola: 'escola',
  comportamento: 'comportamento',
  rotina: 'rotina e tempo',
  saude_mental: 'saúde mental da família',
  inclusao_social: 'inclusão social e lazer',
  rede_apoio: 'rede de apoio e serviços',
};

/**
 * Primeiro nome a partir do nome completo (tratamento simples).
 */
export function firstNameFromFull(full) {
  if (!full || !String(full).trim()) return 'mãe atípica';
  const parts = String(full).trim().split(/\s+/).filter(Boolean);
  const first = parts[0] || '';
  if (!first) return 'mãe atípica';
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
}

function capitalizePhrase(s) {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Lista em português: "A", "A e B", "A, B e C"
 */
export function joinChallengesReadable(slugs) {
  const labels = (slugs || [])
    .map((s) => capitalizePhrase(CHALLENGE_LABELS[s] || s.replace(/_/g, ' ')))
    .filter(Boolean);
  if (!labels.length) return 'cuidar de você e da sua família';
  if (labels.length === 1) return labels[0];
  if (labels.length === 2) return `${labels[0]} e ${labels[1]}`;
  const head = labels.slice(0, -1).join(', ');
  return `${head} e ${labels[labels.length - 1]}`;
}

/**
 * Várias formulações (efeito "IA" sem custo). Escolha estável pelo hash dos slugs.
 */
export function pickWelcomeVariant(firstName, challengeSlugs) {
  const focus = joinChallengesReadable(challengeSlugs);
  const seed =
    (challengeSlugs || []).reduce((a, s) => a + s.charCodeAt(0), 0) +
    (firstName || '').length * 7;
  const variants = [
    `Bem-vinda, ${firstName}! Vimos que seu desafio é ${focus}. Já separamos as melhores salas de apoio para você.`,
    `${firstName}, é um prazer ter você aqui. Registámos ${focus} como prioridade agora — reunimos sugestões de salas e conteúdos nessa linha.`,
    `Olá, ${firstName}! Percebemos que ${focus} está no centro dos seus dias. A Aura já destacou espaços de apoio pensados para si.`,
    `Bem-vinda, ${firstName}. Com base no que partilhou, o foco é ${focus}. Pode explorar já as salas que combinam com este momento.`,
  ];
  return variants[seed % variants.length];
}

export const WELCOME_STORAGE_KEY = 'aura_onboarding_welcome';
export const DASHBOARD_BANNER_KEY = 'aura_dashboard_onboarding_banner';

/**
 * Grava payload para onboarding-boasvindas.html e um resumo para banner no index.
 */
export function persistWelcomeExperience({ fullName, challengeSlugs }) {
  const firstName = firstNameFromFull(fullName);
  const message = pickWelcomeVariant(firstName, challengeSlugs);
  const focus = joinChallengesReadable(challengeSlugs);

  const payload = {
    firstName,
    fullName: fullName || '',
    challengeSlugs: challengeSlugs || [],
    focusPhrase: focus,
    message,
    savedAt: new Date().toISOString(),
  };

  try {
    sessionStorage.setItem(WELCOME_STORAGE_KEY, JSON.stringify(payload));
    sessionStorage.setItem(
      DASHBOARD_BANNER_KEY,
      JSON.stringify({
        line: `Salas de apoio sugeridas para: ${focus}.`,
        message,
        savedAt: payload.savedAt,
      })
    );
  } catch (e) {
    console.warn('[Aura] sessionStorage onboarding:', e);
  }

  return payload;
}
