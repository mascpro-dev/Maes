/**
 * Candidatura «Profissional parceiro» — grava no Supabase + notifica por e-mail (FormSubmit).
 * Supabase: tabela partner_professional_applications (ver COLE_PARTNER_PROFESSIONAL_APPS.sql).
 *
 * Opcional em supabase-config.js:
 *   window.AURA_PARTNER_TRIAGE_EMAIL = 'outro@email.com';
 */
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.1/+esm';

const DEFAULT_TRIAGE_EMAIL = 'conelheiros@gmail.com';

function triageEmail() {
  const w = typeof window !== 'undefined' ? window : {};
  const o = w.AURA_PARTNER_TRIAGE_EMAIL;
  const t = o != null ? String(o).trim() : '';
  return t || DEFAULT_TRIAGE_EMAIL;
}

function getAnonClient() {
  const url = typeof window !== 'undefined' ? window.AURA_SUPABASE_URL : '';
  const key = typeof window !== 'undefined' ? window.AURA_SUPABASE_ANON_KEY : '';
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

/**
 * Monta objeto da linha a partir dos campos do formulário já validados no HTML.
 * @param {Record<string, unknown>} raw
 */
const PARTNER_MIN_MOTIVACAO = 20;
const PARTNER_MIN_CURRICULO = 40;

/**
 * Validação adicional no cliente (além do HTML) para não enviar registos vazios ou insuficientes.
 * @param {ReturnType<typeof buildPartnerApplicationRow>} row
 */
export function validatePartnerApplicationStrict(row) {
  const nome = String(row.full_name || '').trim();
  if (nome.length < 3) return { ok: false, message: 'Indica o nome completo.' };

  const doc = String(row.cpf_or_rg || '').trim();
  if (doc.length > 0 && doc.length < 5) {
    return { ok: false, message: 'Se preencher CPF/RG, usa um valor com pelo menos 5 caracteres ou deixa em branco.' };
  }

  const wa = String(row.whatsapp || '').replace(/\D/g, '');
  if (wa.length < 10) return { ok: false, message: 'Indica WhatsApp com DDD (mínimo 10 dígitos).' };

  const em = String(row.email || '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) return { ok: false, message: 'Indica um e-mail válido.' };

  if (String(row.cidade_estado_atuacao || '').trim().length < 4) {
    return { ok: false, message: 'Indica cidade e estado de atuação com mais detalhe.' };
  }

  if (String(row.area_atuacao || '').trim().length < 2) return { ok: false, message: 'Indica a área de atuação.' };

  if (String(row.tempo_experiencia || '').trim().length < 2) {
    return { ok: false, message: 'Indica o tempo de experiência na área.' };
  }

  const mot = String(row.motivacao_parceria || '').trim();
  if (mot.length < PARTNER_MIN_MOTIVACAO) {
    return {
      ok: false,
      message: `Escreve pelo menos ${PARTNER_MIN_MOTIVACAO} caracteres em «Por que deseja ser parceiro».`,
    };
  }

  const cv = String(row.mini_curriculo || '').trim();
  if (cv.length < PARTNER_MIN_CURRICULO) {
    return {
      ok: false,
      message: `O mini currículo deve ter pelo menos ${PARTNER_MIN_CURRICULO} caracteres.`,
    };
  }

  if (!row.periodos || !row.periodos.length) {
    return { ok: false, message: 'Seleciona pelo menos um período (manhã, tarde ou noite).' };
  }
  if (!row.dias_semana || !row.dias_semana.length) {
    return { ok: false, message: 'Marca pelo menos um dia da semana.' };
  }

  if (!row.aceita_precificacao) {
    return { ok: false, message: 'É necessário aceitar o modelo de valores (R$49,90 / repasse R$40).' };
  }
  if (!row.consentimento_triagem) {
    return { ok: false, message: 'Marca o termo de consentimento.' };
  }

  return { ok: true };
}

export function buildPartnerApplicationRow(raw) {
  return {
    full_name: String(raw.full_name || '').trim(),
    cpf_or_rg: String(raw.cpf_or_rg || '').trim() || null,
    whatsapp: String(raw.whatsapp || '').trim(),
    email: String(raw.email || '').trim(),
    cidade_estado_atuacao: String(raw.cidade_estado_atuacao || '').trim(),
    links_redes_site: String(raw.links_redes_site || '').trim() || null,
    area_atuacao: String(raw.area_atuacao || '').trim(),
    tempo_experiencia: String(raw.tempo_experiencia || '').trim(),
    foco_especializacao: String(raw.foco_especializacao || '').trim() || null,
    registro_profissional: String(raw.registro_profissional || '').trim() || null,
    motivacao_parceria: String(raw.motivacao_parceria || '').trim(),
    periodos: Array.isArray(raw.periodos) ? raw.periodos.map((x) => String(x).trim()).filter(Boolean) : [],
    dias_semana: Array.isArray(raw.dias_semana) ? raw.dias_semana.map((x) => String(x).trim()).filter(Boolean) : [],
    aceita_precificacao: !!raw.aceita_precificacao,
    mini_curriculo: String(raw.mini_curriculo || '').trim(),
    consentimento_triagem: !!raw.consentimento_triagem,
  };
}

function rowToEmailFields(row) {
  return {
    _subject: '[Conta Mãe Atípica] Nova candidatura — Profissional parceiro',
    _template: 'table',
    _captcha: false,
    'Nome completo': row.full_name,
    'CPF/RG': row.cpf_or_rg || '—',
    WhatsApp: row.whatsapp,
    'E-mail': row.email,
    'Cidade/Estado atuação': row.cidade_estado_atuacao,
    'Redes / site profissional': row.links_redes_site || '—',
    'Área de atuação': row.area_atuacao,
    'Tempo na área': row.tempo_experiencia,
    'Foco / especialização': row.foco_especializacao || '—',
    'Registro profissional': row.registro_profissional || '—',
    Motivação: row.motivacao_parceria,
    Períodos: row.periodos.join(', ') || '—',
    'Dias da semana': row.dias_semana.join(', ') || '—',
    'Aceita R$49,90 (repasse R$40)': row.aceita_precificacao ? 'Sim' : 'Não',
    'Mini currículo': row.mini_curriculo,
    Consentimento: row.consentimento_triagem ? 'Sim' : 'Não',
  };
}

async function sendTriageEmail(row) {
  const to = encodeURIComponent(triageEmail());
  const url = `https://formsubmit.co/ajax/${to}`;
  const body = rowToEmailFields(row);
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`E-mail (${res.status}): ${t.slice(0, 200)}`);
  }
  const ct = res.headers.get('content-type');
  if (ct && ct.includes('application/json')) {
    await res.json().catch(() => ({}));
  }
  return true;
}

async function insertApplication(client, row) {
  const { error } = await client.from('partner_professional_applications').insert(row);
  if (error) throw error;
}

/**
 * @returns {Promise<{ ok: boolean; message: string }>}
 */
export async function submitPartnerProfessionalApplication(payload) {
  const strict = validatePartnerApplicationStrict(payload);
  if (!strict.ok) return { ok: false, message: strict.message };

  let savedDb = false;
  let emailed = false;

  const client = getAnonClient();
  if (client) {
    try {
      await insertApplication(client, payload);
      savedDb = true;
    } catch (e) {
      const msg = e?.message || String(e);
      if (/relation|does not exist|partner_professional_applications/i.test(msg)) {
        console.warn('[parceiro] Supabase:', msg);
      } else if (/new row violates row-level security|RLS/i.test(msg)) {
        console.warn('[parceiro] RLS:', msg);
      } else {
        console.warn('[parceiro] insert:', msg);
      }
    }
  }

  try {
    await sendTriageEmail(payload);
    emailed = true;
  } catch (e) {
    console.warn('[parceiro] e-mail:', e?.message || e);
  }

  if (savedDb && emailed) {
    return {
      ok: true,
      message:
        'Recebemos a tua candidatura. A equipa vai analisar e entrar em contacto. Também enviámos a notificação por e-mail.',
    };
  }
  if (emailed && !savedDb) {
    return {
      ok: true,
      message:
        'Candidatura enviada por e-mail com sucesso. (Opcional: aplica supabase/COLE_PARTNER_PROFESSIONAL_APPS.sql para também guardares um registo na base de dados.)',
    };
  }
  if (savedDb && !emailed) {
    return {
      ok: true,
      message:
        'Registámos a candidatura na plataforma. O envio automático por e-mail falhou — revisa Table Editor › partner_professional_applications.',
    };
  }

  return {
    ok: false,
    message:
      'Não conseguimos concluir o envio agora: confirma a ligação à internet e volta a tentar dentro de poucos minutos. Se repetir, escribe para conelheiros@gmail.com com os teus dados.',
  };
}
