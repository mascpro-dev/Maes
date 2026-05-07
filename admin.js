/**
 * admin.html — painel restrito a utilizadores em public.aura_admins.
 * onclick nas abas chama isto antes de main() async acabar — encaminha após init.
 */
window.__adminOpenTabPending = [];
window.__adminOpenTab = function (name) {
  if (!name) return;
  if (typeof window.__adminOpenTabImpl === 'function') {
    window.__adminOpenTabImpl(name);
  } else {
    window.__adminOpenTabPending.push(name);
  }
};

async function waitAuth() {
  const p = window.__auraAuthReady;
  if (!p) {
    window.location.replace('login.html');
    return null;
  }
  const ok = await p;
  if (!ok) return null;
  return window.__auraSupabaseClient;
}

function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

function setStatus(el, msg, isErr) {
  if (!el) return;
  el.textContent = msg || '';
  el.style.color = isErr ? 'var(--terracotta, #E2725B)' : '';
}

function setKpi(id, value) {
  const el = document.getElementById(id);
  if (!el) return;
  if (value == null || value === '') {
    el.textContent = '—';
    return;
  }
  const n = Number(value);
  el.textContent = Number.isFinite(n) ? String(n) : '—';
}

/** Identificador do projeto na URL (ex. ahjhjzdmkkrcgbuxmhww) — para alinhar com o Dashboard do Supabase. */
function supabaseProjectRef() {
  try {
    const u = window.AURA_SUPABASE_URL || '';
    const m = u.match(/https?:\/\/([^.]+)\.supabase\.co/i);
    return m ? m[1] : u || '—';
  } catch {
    return '—';
  }
}

/** Corrige colagens tipo «mailto:a@b.com»; o Auth guarda só o e-mail. */
function normalizeAuthEmailInput(raw) {
  if (raw == null) return '';
  let s = String(raw).trim();
  if (/^mailto:/i.test(s)) s = s.slice(7).trim();
  s = s.split('?')[0].split('#')[0].trim();
  return s;
}

function tabSwitch(root, name) {
  root.querySelectorAll('.admin-tab').forEach((btn) => {
    const on = btn.dataset.tab === name;
    btn.classList.toggle('admin-tab--active', on);
    btn.setAttribute('aria-selected', on ? 'true' : 'false');
  });
  ['spec', 'book', 'chk', 'par', 'reg'].forEach((k) => {
    const panel = document.getElementById(`panel-${k}`);
    if (panel) panel.hidden = k !== name;
  });
}

function clearSpecForm(root) {
  root.querySelector('#adm-spec-id').value = '';
  const idView = root.querySelector('#adm-spec-id-view');
  if (idView) idView.value = '';
  const contact = root.querySelector('#adm-spec-contact');
  if (contact) contact.value = '';
  const contactHint = root.querySelector('#adm-spec-contact-hint');
  if (contactHint) contactHint.textContent = '';
  root.querySelector('#adm-spec-name').value = '';
  root.querySelector('#adm-spec-specialty').value = '';
  root.querySelector('#adm-spec-phone').value = '';
  root.querySelector('#adm-spec-bio').value = '';
  root.querySelector('#adm-spec-photo').value = '';
  root.querySelector('#adm-spec-sort').value = '0';
  root.querySelector('#adm-spec-active').checked = true;
  const d30 = root.querySelector('#adm-spec-dur-30');
  if (d30) d30.checked = true;
}

async function loadSpecialists(sb) {
  const { data, error } = await sb.from('specialists').select('*').order('sort_order', { ascending: true });
  if (error) throw error;
  return data || [];
}

async function fillSpecialistAdminContact(sb, specialistRow) {
  const inp = document.getElementById('adm-spec-contact');
  const hint = document.getElementById('adm-spec-contact-hint');
  if (!inp) return;
  inp.value = '';
  if (hint) hint.textContent = '';

  const appId = specialistRow?.origin_partner_application_id;
  if (!appId) {
    if (hint) hint.textContent = 'Sem origem em candidatura parceira. Usa «Ligar conta do médico» com UUID Auth.';
    return;
  }

  try {
    const { data, error } = await sb
      .from('partner_professional_applications')
      .select('whatsapp,email,cidade_estado_atuacao,links_redes_site')
      .eq('id', appId)
      .maybeSingle();
    if (error) throw error;
    if (!data) {
      if (hint) hint.textContent = 'Candidatura de origem não encontrada.';
      return;
    }
    const whatsapp = String(data.whatsapp || '').trim();
    const email = String(data.email || '').trim();
    const local = String(data.cidade_estado_atuacao || '').trim();
    inp.value = [whatsapp && `WhatsApp: ${whatsapp}`, email && `E-mail: ${email}`]
      .filter(Boolean)
      .join(' · ');
    if (hint) {
      const link = String(data.links_redes_site || '').trim();
      hint.textContent = [local && `Atuação: ${local}`, link && `Link: ${link}`].filter(Boolean).join(' · ');
    }
  } catch (e) {
    if (hint) hint.textContent = 'Falha ao carregar contato: ' + (e.message || String(e));
  }
}

function renderSpecialists(rows, tbody, specNameById) {
  tbody.innerHTML = '';
  rows.forEach((r) => {
    specNameById.set(r.id, r.display_name || r.id);
    const tr = document.createElement('tr');
    const dur = Number(r.consultation_duration_minutes) === 60 ? '60 min' : '30 min';
    tr.innerHTML = `
      <td>${r.sort_order ?? 0}</td>
      <td>${escapeHtml(r.display_name || '')}</td>
      <td>${escapeHtml(r.specialty || '')}</td>
      <td>${escapeHtml(r.phone || '—')}</td>
      <td>${escapeHtml(dur)}</td>
      <td>${r.active ? 'sim' : 'não'}</td>
      <td class="btn-cell">
        <button type="button" class="admin-btn" data-edit="${r.id}">Editar</button>
        <button type="button" class="admin-btn" data-del-spec="${r.id}">Excluir</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatSbError(err) {
  if (!err) return '';
  const parts = [err.message, err.details, err.hint].filter(Boolean);
  return parts.join(' — ');
}

/** Clique no texto dentro do botão dá `target` = TextNode — `closest` falha sem isto. */
function clickEventTargetElement(ev) {
  const t = ev.target;
  if (t instanceof Element) return t;
  if (t && t.nodeType === Node.TEXT_NODE && t.parentElement) return t.parentElement;
  return null;
}

function promiseWithTimeout(promise, ms, timeoutMsg) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(timeoutMsg)), ms);
    Promise.resolve(promise)
      .then((v) => {
        clearTimeout(timer);
        resolve(v);
      })
      .catch((e) => {
        clearTimeout(timer);
        reject(e);
      });
  });
}

function rpcMissing(err) {
  const m = String(err?.message || err || '');
  return (
    err?.code === '42883' ||
    /admin_save_cadastro_profile/i.test(m) ||
    /could not find.*function/i.test(m) ||
    /schema cache/i.test(m)
  );
}

function initAdminAnalyticsDates() {
  const toEl = document.getElementById('adm-an-to');
  const fromEl = document.getElementById('adm-an-from');
  if (!toEl || !fromEl || (fromEl.value && toEl.value)) return;
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 15);
  toEl.value = end.toISOString().slice(0, 10);
  fromEl.value = start.toISOString().slice(0, 10);
}

function renderAdminMiniTable(tbody, rows, emptyColspan, rowHtml) {
  if (!tbody) return;
  tbody.innerHTML = '';
  if (!rows || !rows.length) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td colspan="${emptyColspan}" class="admin-muted">Sem dados.</td>`;
    tbody.appendChild(tr);
    return;
  }
  rows.forEach((r) => {
    const tr = document.createElement('tr');
    tr.innerHTML = rowHtml(r);
    tbody.appendChild(tr);
  });
}

async function refreshAdminAnalytics(sb, statusEl) {
  const fromEl = document.getElementById('adm-an-from');
  const toEl = document.getElementById('adm-an-to');
  if (!fromEl?.value || !toEl?.value) return;
  const d0 = new Date(`${fromEl.value}T00:00:00`);
  const d1 = new Date(`${toEl.value}T23:59:59.999`);
  if (Number.isNaN(d0.getTime()) || Number.isNaN(d1.getTime())) return;

  const setKpiText = (id, v) => {
    const el = document.getElementById(id);
    if (el) el.textContent = v == null ? '—' : String(v);
  };

  try {
    const { data, error } = await sb.rpc('admin_analytics_dashboard', {
      p_presence_minutes: 10,
      p_from: d0.toISOString(),
      p_to: d1.toISOString(),
    });
    if (error) throw error;

    setKpi('adm-kpi-online-now', data?.online_now);
    setKpi('adm-kpi-online-today', data?.online_today);
    setKpi('adm-kpi-active-range', data?.distinct_active_in_range);

    renderAdminMiniTable(
      document.getElementById('adm-an-estado'),
      Array.isArray(data?.by_estado) ? data.by_estado : [],
      2,
      (r) => `<td>${escapeHtml(String(r.estado || '—'))}</td><td>${escapeHtml(String(r.count ?? ''))}</td>`
    );
    renderAdminMiniTable(
      document.getElementById('adm-an-cidade'),
      Array.isArray(data?.by_cidade) ? data.by_cidade : [],
      3,
      (r) =>
        `<td>${escapeHtml(String(r.cidade || '—'))}</td><td>${escapeHtml(String(r.estado || '—'))}</td><td>${escapeHtml(String(r.count ?? ''))}</td>`
    );
    renderAdminMiniTable(
      document.getElementById('adm-an-pais'),
      Array.isArray(data?.by_pais) ? data.by_pais : [],
      2,
      (r) => `<td>${escapeHtml(String(r.pais || '—'))}</td><td>${escapeHtml(String(r.count ?? ''))}</td>`
    );
    renderAdminMiniTable(
      document.getElementById('adm-an-pages'),
      Array.isArray(data?.top_pages) ? data.top_pages : [],
      2,
      (r) =>
        `<td class="mono">${escapeHtml(String(r.page_path || '—'))}</td><td>${escapeHtml(String(r.count ?? ''))}</td>`
    );

    const hint = document.getElementById('adm-an-hint');
    if (hint) {
      hint.textContent = data?.total_profiles != null ? `Total de perfis na base: ${data.total_profiles}.` : '';
    }
  } catch (e) {
    const msg = formatSbError(e) || e.message || String(e);
    if (/function|schema cache|admin_analytics_dashboard|42883/i.test(msg)) {
      setStatus(
        statusEl,
        'Métricas: aplica a migração 20260506220000_admin_analytics_page_views_and_rpc.sql no Supabase.',
        true
      );
    } else {
      setStatus(statusEl, 'Métricas: ' + msg.slice(0, 200), true);
    }
  }
}

async function loadBookings(sb) {
  const { data, error } = await sb.rpc('admin_list_consultation_bookings', { p_limit: 300 });
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

function renderBookings(rows, tbody, specNameById) {
  tbody.innerHTML = '';
  if (!rows.length) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td colspan="6" class="admin-muted">Nenhuma reserva encontrada.</td>`;
    tbody.appendChild(tr);
    return;
  }
  rows.forEach((r) => {
    const spec = specNameById.get(r.specialist_id) || r.specialist_id?.slice(0, 8) || '—';
    const canCancel = r.status === 'confirmed' || r.status === 'pending_payment';
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${fmtDate(r.starts_at)}</td>
      <td>${escapeHtml(String(spec))}</td>
      <td class="mono" title="${r.mother_id || ''}">${r.mother_id ? r.mother_id.slice(0, 8) + '…' : '—'}</td>
      <td>${escapeHtml(r.status || '')}</td>
      <td>${escapeHtml(r.payment_method || '—')}</td>
      <td class="btn-cell">
        ${
          canCancel
            ? `<button type="button" class="admin-btn" data-cancel-booking="${r.id}">Cancelar</button>`
            : '—'
        }
      </td>
    `;
    tbody.appendChild(tr);
  });
}

async function loadIntents(sb) {
  const { data, error } = await sb.rpc('admin_list_checkout_intents', { p_limit: 300 });
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

function isAppPublicLegalMissingError(err) {
  if (!err) return false;
  const msg = [err.message, err.details, err.hint, String(err.code || '')].filter(Boolean).join(' ');
  return /404|schema cache|does not exist|Not Found|Could not find.*table|PGRST205/i.test(msg);
}

async function loadAdminTerms(sb) {
  const { data, error } = await sb.from('app_public_legal').select('title,body').eq('slug', 'terms').maybeSingle();
  if (error) {
    if (isAppPublicLegalMissingError(error)) {
      return { title: '', body: '', __missingAppPublicLegal: true };
    }
    throw error;
  }
  return data || { title: '', body: '' };
}

async function loadMothers(sb, qRaw) {
  const q = (qRaw || '')
    .trim()
    .replace(/%/g, '')
    .replace(/,/g, ' ')
    .slice(0, 80);
  let qb = sb
    .from('profiles')
    .select('id,email,full_name,phone,account_type,terms_accepted_at,updated_at')
    .order('updated_at', { ascending: false })
    .limit(250);
  if (q.length) {
    qb = qb.or(`email.ilike.%${q}%,full_name.ilike.%${q}%`);
  }
  const { data, error } = await qb;
  if (error) throw error;
  return data || [];
}

function renderMothers(rows, tbody) {
  tbody.innerHTML = '';
  if (!rows.length) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td colspan="6" class="admin-muted">Nenhum perfil encontrado.</td>`;
    tbody.appendChild(tr);
    return;
  }
  rows.forEach((r) => {
    const tr = document.createElement('tr');
    const ta = r.terms_accepted_at ? fmtDate(r.terms_accepted_at) : '—';
    const tipo = r.account_type === 'medic' ? 'Médico' : 'Mãe';
    tr.innerHTML = `
      <td>${escapeHtml(r.full_name || '—')}</td>
      <td>${escapeHtml(r.email || '—')}</td>
      <td>${escapeHtml(tipo)}</td>
      <td>${escapeHtml(ta)}</td>
      <td>${escapeHtml(fmtDate(r.updated_at))}</td>
      <td class="btn-cell"><button type="button" class="admin-btn" data-edit-mother="${r.id}">Editar</button></td>
    `;
    tbody.appendChild(tr);
  });
}

function renderIntents(rows, tbody, specNameById) {
  tbody.innerHTML = '';
  if (!rows.length) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td colspan="6" class="admin-muted">Nenhuma intenção de checkout.</td>`;
    tbody.appendChild(tr);
    return;
  }
  rows.forEach((r) => {
    const spec = specNameById.get(r.specialist_id) || r.specialist_id?.slice(0, 8) || '—';
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${fmtDate(r.created_at)}</td>
      <td>${escapeHtml(r.status || '')}</td>
      <td>${escapeHtml(r.payment_method || '')}</td>
      <td class="mono" title="${r.mother_id || ''}">${r.mother_id ? r.mother_id.slice(0, 8) + '…' : '—'}</td>
      <td>${escapeHtml(String(spec))}</td>
      <td>${fmtDate(r.starts_at)}</td>
    `;
    tbody.appendChild(tr);
  });
}

const PARTNER_STATUS_LABEL = {
  pending: 'Pendente',
  reviewing: 'Em análise',
  approved: 'Aprovado',
  rejected: 'Recusado',
};

async function loadPartnerApplications(sb) {
  const { data, error } = await sb.rpc('admin_list_partner_professional_applications', {
    p_limit: 300,
  });
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

function renderPartnerApplications(rows, tbody) {
  tbody.innerHTML = '';
  if (!rows.length) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td colspan="7" class="admin-muted">Nenhuma candidatura encontrada.</td>`;
    tbody.appendChild(tr);
    return;
  }
  rows.forEach((r) => {
    const st = r.status || 'pending';
    const stLabel = PARTNER_STATUS_LABEL[st] || st;
    const rawArea = r.area_atuacao != null ? String(r.area_atuacao) : '';
    const area = rawArea.length > 40 ? `${rawArea.slice(0, 40)}…` : rawArea;
    const periodos = Array.isArray(r.periodos) ? r.periodos.join(', ') : '';
    const dias = Array.isArray(r.dias_semana) ? r.dias_semana.join(', ') : '';
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escapeHtml(fmtDate(r.created_at))}</td>
      <td>${escapeHtml(r.full_name || '—')}</td>
      <td>${escapeHtml(r.email || '—')}</td>
      <td>${escapeHtml(r.whatsapp || '—')}</td>
      <td>${escapeHtml(area || '—')}</td>
      <td>${escapeHtml(stLabel)}</td>
      <td class="btn-cell" style="white-space: normal">
        <button type="button" class="admin-btn" data-par-status="${r.id}" data-par-next="reviewing">Analisar</button>
        <button type="button" class="admin-btn admin-btn--primary" data-par-status="${r.id}" data-par-next="approved">Aprovar</button>
        <button type="button" class="admin-btn" data-par-status="${r.id}" data-par-next="rejected">Recusar</button>
        <details style="margin-top:8px;text-align:left">
          <summary style="cursor:pointer;font-size:.8rem;color:#5a5550">Ver dados completos</summary>
          <div style="margin-top:6px;font-size:.8rem;line-height:1.45;color:#2d2a26">
            <div><strong>CPF/RG:</strong> ${escapeHtml(r.cpf_or_rg || '—')}</div>
            <div><strong>Cidade/Estado:</strong> ${escapeHtml(r.cidade_estado_atuacao || '—')}</div>
            <div><strong>Links:</strong> ${escapeHtml(r.links_redes_site || '—')}</div>
            <div><strong>Tempo experiência:</strong> ${escapeHtml(r.tempo_experiencia || '—')}</div>
            <div><strong>Foco especialização:</strong> ${escapeHtml(r.foco_especializacao || '—')}</div>
            <div><strong>Registro profissional:</strong> ${escapeHtml(r.registro_profissional || '—')}</div>
            <div><strong>Períodos:</strong> ${escapeHtml(periodos || '—')}</div>
            <div><strong>Dias:</strong> ${escapeHtml(dias || '—')}</div>
            <div><strong>Aceita preço:</strong> ${r.aceita_precificacao ? 'Sim' : 'Não'}</div>
            <div><strong>Consentimento:</strong> ${r.consentimento_triagem ? 'Sim' : 'Não'}</div>
            <div><strong>Motivação:</strong> ${escapeHtml(r.motivacao_parceria || '—')}</div>
            <div><strong>Mini currículo:</strong> ${escapeHtml(r.mini_curriculo || '—')}</div>
          </div>
        </details>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

async function main() {
  const denied = document.getElementById('admin-denied');
  const app = document.getElementById('admin-app');
  const statusEl = document.getElementById('admin-status');

  const sb = await waitAuth();
  if (!sb) return;

  const { data: isAdmin, error: rpcErr } = await sb.rpc('is_aura_admin');
  if (rpcErr) {
    denied.hidden = false;
    denied.textContent =
      'Não foi possível verificar permissões: ' +
      (rpcErr.message || '') +
      '. Confirma que a migração admin (is_aura_admin) está aplicada no Supabase.';
    return;
  }

  if (!isAdmin) {
    denied.hidden = false;
    denied.innerHTML =
      'Esta conta não tem acesso de administrador. O teu utilizador tem de estar na tabela <code>aura_admins</code> (ver <code>COLE_PRIMEIRO_ADMIN.sql</code>). <a href="perfil.html">Voltar ao perfil</a>';
    return;
  }

  denied.hidden = true;
  app.hidden = false;

  const specNameById = new Map();
  const tbodySpec = document.getElementById('adm-spec-tbody');
  const tbodyBook = document.getElementById('adm-book-tbody');
  const tbodyChk = document.getElementById('adm-chk-tbody');
  const tbodyMothers = document.getElementById('adm-mothers-tbody');
  const tbodyPar = document.getElementById('adm-par-tbody');
  let regDataLoaded = false;
  let parAppsLoaded = false;
  const durWrap = document.getElementById('adm-m-consult-dur-wrap');
  const durHint = document.getElementById('adm-m-consult-dur-hint');

  async function syncConsultDurPanel(userId) {
    if (!durWrap || !durHint || !userId) return;
    const isMedic = document.querySelector('input[name="adm-m-account-type"]:checked')?.value === 'medic';
    if (!isMedic) {
      durWrap.classList.remove('admin-dur-for-medic--on');
      delete durWrap.dataset.specialistId;
      durHint.textContent = '';
      return;
    }
    durWrap.classList.add('admin-dur-for-medic--on');
    try {
      const { data: sum, error } = await sb.rpc('admin_get_linked_specialist_summary', {
        p_user_id: userId,
      });
      if (error) {
        durHint.textContent = formatSbError(error).slice(0, 280);
        delete durWrap.dataset.specialistId;
        return;
      }
      const sid = sum?.specialist_id;
      if (!sid) {
        delete durWrap.dataset.specialistId;
        durHint.textContent =
          'Sem ligação a especialista: na aba Especialistas, em «Ligar conta do médico», liga este UUID ao registo do médico.';
        document.querySelectorAll('input[name="adm-m-consult-dur"]').forEach((inp) => {
          inp.checked = inp.value === '30';
        });
        return;
      }
      durWrap.dataset.specialistId = sid;
      const d = Number(sum.consultation_duration_minutes) === 60 ? '60' : '30';
      document.querySelectorAll('input[name="adm-m-consult-dur"]').forEach((inp) => {
        inp.checked = inp.value === d;
      });
      durHint.textContent =
        'Aplica-se à marcação pública deste médico (também podes editar na aba Especialistas).';
    } catch (e) {
      durHint.textContent = e.message || String(e);
      delete durWrap.dataset.specialistId;
    }
  }

  document.querySelectorAll('input[name="adm-m-account-type"]').forEach((inp) => {
    const onAcct = async () => {
      const uid = document.getElementById('adm-m-id')?.value?.trim();
      if (!uid) return;
      await syncConsultDurPanel(uid);
    };
    inp.addEventListener('change', onAcct);
    inp.addEventListener('click', onAcct);
  });

  function fillLinkSpecialistSelect(specs) {
    const sel = document.getElementById('adm-link-spec');
    if (!sel) return;
    const cur = sel.value;
    sel.innerHTML = '';
    const opt0 = document.createElement('option');
    opt0.value = '';
    opt0.textContent = '— Escolhe o médico —';
    sel.appendChild(opt0);
    (specs || []).forEach((s) => {
      const o = document.createElement('option');
      o.value = s.id;
      o.textContent = `${s.display_name || s.id} (${s.specialty || ''})`;
      sel.appendChild(o);
    });
    if (cur && [...sel.options].some((o) => o.value === cur)) sel.value = cur;
  }

  document.getElementById('adm-link-spec')?.addEventListener('change', async () => {
    const sel = document.getElementById('adm-link-spec');
    const emailInp = document.getElementById('adm-link-email-lookup');
    const specId = sel?.value?.trim();
    if (!specId || !emailInp) return;
    try {
      const { data: row } = await sb
        .from('specialists')
        .select('origin_partner_application_id')
        .eq('id', specId)
        .maybeSingle();
      const appId = row?.origin_partner_application_id;
      if (!appId) return;
      const { data: app } = await sb
        .from('partner_professional_applications')
        .select('email')
        .eq('id', appId)
        .maybeSingle();
      if (app?.email) emailInp.value = normalizeAuthEmailInput(app.email);
    } catch {
      /* ignorar */
    }
  });

  document.getElementById('adm-link-email-lookup')?.addEventListener('blur', (ev) => {
    const t = ev.target;
    if (!t || t.id !== 'adm-link-email-lookup') return;
    const n = normalizeAuthEmailInput(t.value);
    if (n !== t.value) t.value = n;
  });

  async function refreshAll() {
    setStatus(statusEl, 'A carregar…', false);
    const parts = [];
    try {
      const specs = await loadSpecialists(sb);
      renderSpecialists(specs, tbodySpec, specNameById);
      setKpi('adm-kpi-spec', specs.length);
      fillLinkSpecialistSelect(specs);
      const linkSel = document.getElementById('adm-link-spec');
      const emailLf = document.getElementById('adm-link-email-lookup');
      if (linkSel?.value && emailLf && !emailLf.value?.trim()) {
        linkSel.dispatchEvent(new Event('change', { bubbles: true }));
      }
    } catch (e) {
      parts.push('Especialistas: ' + (e.message || e));
    }
    try {
      const books = await loadBookings(sb);
      renderBookings(books, tbodyBook, specNameById);
      setKpi('adm-kpi-book', books.length);
    } catch (e) {
      parts.push('Reservas: ' + (e.message || e));
    }
    try {
      const intents = await loadIntents(sb);
      renderIntents(intents, tbodyChk, specNameById);
      setKpi('adm-kpi-chk', intents.length);
    } catch (e) {
      parts.push('Checkouts MP: ' + (e.message || e));
    }
    if (parts.length) {
      setStatus(statusEl, parts.join(' · '), true);
    } else {
      setStatus(statusEl, 'Dados atualizados.', false);
    }
  }

  async function refreshCadastrosTab() {
    const hint = document.getElementById('adm-terms-hint');
    try {
      const t = await loadAdminTerms(sb);
      const ti = document.getElementById('adm-terms-title');
      const bo = document.getElementById('adm-terms-body');
      if (ti) ti.value = t.title || '';
      if (bo) bo.value = t.body || '';
      if (hint) {
        if (t.__missingAppPublicLegal) {
          hint.textContent =
            'Falta a tabela app_public_legal neste projeto (erro 404). No repositório, abre supabase/COLE_APP_PUBLIC_LEGAL.sql e cola no Supabase → SQL Editor → Run.';
        } else {
          hint.textContent = '';
        }
      }
    } catch (e) {
      if (hint) hint.textContent = 'Termos: ' + (e.message || e);
    }
    if (tbodyMothers) {
      try {
        const q = document.getElementById('adm-mother-q')?.value || '';
        const rows = await loadMothers(sb, q);
        renderMothers(rows, tbodyMothers);
        setKpi('adm-kpi-reg', rows.length);
      } catch (e) {
        setStatus(statusEl, 'Perfis: ' + (e.message || e), true);
      }
    }
  }

  async function refreshPartnerApplicationsPanel() {
    const hint = document.getElementById('adm-par-hint');
    if (!tbodyPar) return;
    if (hint) hint.textContent = 'A carregar…';
    try {
      const rows = await loadPartnerApplications(sb);
      renderPartnerApplications(rows, tbodyPar);
      setKpi('adm-kpi-par', rows.length);
      if (hint) hint.textContent = `${rows.length} candidatura(s).`;
    } catch (e) {
      if (hint) hint.textContent = formatSbError(e) || e.message || String(e);
    }
  }

  function openAdminTab(name) {
    if (!name) return;
    tabSwitch(document, name);
    if (name === 'reg' && !regDataLoaded) {
      regDataLoaded = true;
      void refreshCadastrosTab();
    }
    if (name === 'par' && !parAppsLoaded) {
      parAppsLoaded = true;
      void refreshPartnerApplicationsPanel();
    }
  }

  window.__adminOpenTabImpl = openAdminTab;
  window.__adminOpenTabPending.splice(0).forEach((n) => openAdminTab(n));

  document.querySelectorAll('.admin-tab[data-tab]').forEach((btn) => {
    const onTab = (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      const name = btn.getAttribute('data-tab');
      openAdminTab(name);
    };
    btn.addEventListener('click', onTab);
    btn.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' || ev.key === ' ') onTab(ev);
    });
  });

  const adminAppEl = document.getElementById('admin-app');
  if (adminAppEl) {
    adminAppEl.addEventListener(
      'click',
      (ev) => {
        const el = clickEventTargetElement(ev);
        if (!el) return;

        const parBtn = el.closest('button[data-par-next][data-par-status]');
        if (parBtn && tbodyPar && tbodyPar.contains(parBtn)) {
          ev.preventDefault();
          ev.stopPropagation();
          const id = parBtn.getAttribute('data-par-status');
          const next = parBtn.getAttribute('data-par-next');
          if (!id || !next) return;

          void (async () => {
            const hint = document.getElementById('adm-par-hint');
            parBtn.disabled = true;
            setStatus(statusEl, 'A atualizar candidatura…', false);
            if (hint) hint.textContent = 'A guardar na base de dados…';
            try {
              const res = await promiseWithTimeout(
                sb.rpc('admin_set_partner_application_status', { p_id: id, p_status: next }),
                35000,
                'O pedido expirou (rede ou Supabase). Tenta outra vez.'
              );
              if (res.error) throw res.error;

              const rowsCheck = await loadPartnerApplications(sb);
              const rowOk = rowsCheck.find((r) => String(r.id) === String(id));
              if (!rowOk || rowOk.status !== next) {
                throw new Error(
                  `O estado não foi confirmado após gravar (esperado «${next}», lido «${
                    rowOk?.status || '—'
                  }»). Aplica no Supabase o SQL da função admin_set_partner_application_status ou verifica se estás no projeto certo.`
                );
              }

              let msg = 'Candidatura atualizada com sucesso.';
              if (next === 'approved') {
                const { data: specRow, error: specErr } = await sb
                  .from('specialists')
                  .select('id,active')
                  .eq('origin_partner_application_id', id)
                  .maybeSingle();
                if (specErr) throw specErr;
                if (specRow?.id) {
                  msg =
                    'Aprovado. O especialista já foi criado na aba Especialistas (inativo por padrão) para revisão e ativação.';
                } else {
                  msg =
                    'Aprovado, mas não encontrei especialista criado. Aplica no Supabase a migração nova de parceiros/especialistas.';
                }

                // Após aprovar, tenta convidar automaticamente o parceiro para criar acesso no Auth.
                // Falhas de envio não devem reverter a aprovação.
                let inviteNote = '';
                try {
                  const { data: appRow, error: appErr } = await sb
                    .from('partner_professional_applications')
                    .select('email')
                    .eq('id', id)
                    .maybeSingle();
                  if (appErr) throw appErr;
                  const email = String(appRow?.email || '').trim();
                  if (email && email.includes('@')) {
                    const origin =
                      typeof window.auraPublicSiteBase === 'function'
                        ? window.auraPublicSiteBase()
                        : (window.AURA_APP_PUBLIC_URL || '').trim().replace(/\/$/, '') ||
                          (typeof window.location?.origin === 'string' ? window.location.origin : '');
                    const redirect_to =
                      origin && /^https:\/\//i.test(origin)
                        ? `${origin.replace(/\/$/, '')}/login.html`
                        : 'https://maes-pi.vercel.app/login.html';

                    const { data: invData, error: invErr } = await sb.functions.invoke('admin-invite-auth-user', {
                      body: { email, redirect_to },
                    });

                    if (invErr) {
                      inviteNote =
                        ' A aprovação foi gravada, mas o convite Auth não foi enviado automaticamente (podes reenviar no bloco de ligação de conta).';
                    } else if (invData?.already_exists) {
                      inviteNote = ' A conta Auth desse e-mail já existia; basta ligar UUID no especialista.';
                    } else if (invData?.ok) {
                      inviteNote = ' Convite Auth enviado para o e-mail do profissional.';
                    }
                  } else {
                    inviteNote = ' A candidatura não tem e-mail válido para convite automático.';
                  }
                } catch (inviteErr) {
                  console.warn('[admin] auto-invite on approve:', inviteErr);
                  inviteNote =
                    ' A aprovação foi gravada, mas houve falha ao enviar convite automático (usa o botão de convite manual).';
                }
                msg += inviteNote;
              }

              setStatus(statusEl, msg, false);
              if (hint) hint.textContent = next === 'approved' ? 'Aprovado e sincronizado com Especialistas.' : 'Estado guardado.';
              if (typeof showToast === 'function') {
                showToast('Candidatura atualizada.');
              }
              await refreshPartnerApplicationsPanel();
            } catch (e) {
              const msg = formatSbError(e) || e.message || String(e);
              setStatus(statusEl, msg, true);
              if (hint) hint.textContent = msg.slice(0, 220);
              console.warn('[admin] partner status:', e);
            } finally {
              parBtn.disabled = false;
            }
          })();
          return;
        }

        const tabBtn = el.closest('button.admin-tab[data-tab]');
        if (tabBtn && adminAppEl.contains(tabBtn)) return;
      },
      true
    );
  }

  if (tbodySpec) {
    tbodySpec.addEventListener('click', async (ev) => {
      const el = clickEventTargetElement(ev);
      const btn = el?.closest?.('button[data-edit]');
      const delBtn = el?.closest?.('button[data-del-spec]');
      const id = btn?.getAttribute('data-edit');
      const delId = delBtn?.getAttribute('data-del-spec');

      if (delId) {
        if (!window.confirm('Excluir este especialista da lista? Esta ação remove o perfil público.')) return;
        setStatus(statusEl, 'A excluir especialista…', false);
        try {
          const runDelete = async (force) => {
            const { data, error } = await sb.rpc('admin_delete_specialist', {
              p_specialist_id: delId,
              p_force_delete_bookings: !!force,
            });
            if (error) throw error;
            return data;
          };
          let data = await runDelete(false);
          if (data && data.ok === false && data.error === 'has_bookings') {
            const n = Number(data.bookings_count);
            const label = Number.isFinite(n) ? String(n) : 'algumas';
            if (
              !window.confirm(
                `Este especialista tem ${label} registo(s) de consulta/reserva. Para apagar o perfil é preciso remover esse histórico na base. Queres continuar e apagar também essas reservas?`
              )
            ) {
              setStatus(statusEl, 'Exclusão cancelada (há reservas ligadas a este médico).', false);
              return;
            }
            data = await runDelete(true);
          }
          if (data && data.ok === false) {
            const err = data.error === 'specialist_not_found' ? 'Especialista já não existe. Atualiza a lista.' : JSON.stringify(data);
            setStatus(statusEl, err, true);
            return;
          }
          if (!data?.ok) {
            setStatus(statusEl, 'Resposta inesperada ao excluir. Aplica a migração 20260506173000_admin_delete_specialist_rpc.sql.', true);
            return;
          }
          await refreshAll();
          const extra =
            Number(data.deleted_bookings) > 0
              ? ` Foram removidas ${data.deleted_bookings} reserva(s) associadas.`
              : '';
          setStatus(statusEl, `Especialista excluído com sucesso.${extra}`, false);
        } catch (e) {
          const msg = formatSbError(e) || e.message || String(e);
          if (/policy|permission|forbidden|42501|row-level security|rls/i.test(msg)) {
            setStatus(
              statusEl,
              'Sem permissão para excluir no Supabase. Aplica a migração 20260505145000_admin_specialists_delete_policy.sql.',
              true
            );
          } else if (/function|schema cache|admin_delete_specialist/i.test(msg)) {
            setStatus(
              statusEl,
              'Aplica a migração 20260506173000_admin_delete_specialist_rpc.sql no Supabase e tenta outra vez. Erro: ' +
                msg.slice(0, 120),
              true
            );
          } else if (/409|conflict|RESTRICT/i.test(msg)) {
            setStatus(
              statusEl,
              'Não foi possível apagar (dados ligados ao médico). Atualiza o painel/recarrega após aplicar migrações de admin_delete_specialist.',
              true
            );
          } else {
            setStatus(statusEl, msg, true);
          }
        }
        return;
      }

      if (!id) return;
      const { data: row, error } = await sb.from('specialists').select('*').eq('id', id).maybeSingle();
      if (error) {
        setStatus(statusEl, error.message, true);
        return;
      }
      if (!row) return;
      document.getElementById('adm-spec-id').value = row.id;
      const idView = document.getElementById('adm-spec-id-view');
      if (idView) idView.value = row.id || '';
      await fillSpecialistAdminContact(sb, row);
      document.getElementById('adm-spec-name').value = row.display_name || '';
      document.getElementById('adm-spec-specialty').value = row.specialty || '';
      document.getElementById('adm-spec-phone').value = row.phone || '';
      document.getElementById('adm-spec-bio').value = row.bio || '';
      document.getElementById('adm-spec-photo').value = row.photo_url || '';
      document.getElementById('adm-spec-sort').value = String(row.sort_order ?? 0);
      document.getElementById('adm-spec-active').checked = !!row.active;
      const durMin = Number(row.consultation_duration_minutes) === 60 ? '60' : '30';
      document.querySelectorAll('input[name="adm-spec-duration"]').forEach((inp) => {
        inp.checked = inp.value === durMin;
      });
      tabSwitch(document, 'spec');
      const specFormCard = document.getElementById('panel-spec')?.querySelector('.admin-card');
      if (specFormCard) {
        specFormCard.classList.remove('admin-card--focus');
        void specFormCard.offsetWidth;
        specFormCard.classList.add('admin-card--focus');
        specFormCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
        window.setTimeout(() => {
          specFormCard.classList.remove('admin-card--focus');
        }, 1400);
      } else {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
      setStatus(statusEl, 'Formulário preenchido — altera e guarda.', false);
    });
  }

  document.getElementById('adm-par-refresh')?.addEventListener('click', () => {
    void refreshPartnerApplicationsPanel();
  });

  document.getElementById('adm-spec-clear').addEventListener('click', () => {
    clearSpecForm(document);
    setStatus(statusEl, 'Formulário limpo.', false);
  });

  document.getElementById('adm-spec-copy-id')?.addEventListener('click', async () => {
    const hiddenId = document.getElementById('adm-spec-id')?.value?.trim();
    const shownId = document.getElementById('adm-spec-id-view')?.value?.trim();
    const uuid = hiddenId || shownId || '';
    if (!uuid) {
      setStatus(statusEl, 'Sem UUID ainda. Guarda ou seleciona um especialista para copiar.', true);
      return;
    }
    try {
      await navigator.clipboard.writeText(uuid);
      setStatus(statusEl, 'UUID copiado.', false);
    } catch (_) {
      setStatus(statusEl, 'Não consegui copiar automaticamente. Copia manualmente o campo UUID.', true);
    }
  });

  document.getElementById('adm-spec-save').addEventListener('click', async () => {
    const id = document.getElementById('adm-spec-id').value.trim();
    const durRadio = document.querySelector('input[name="adm-spec-duration"]:checked');
    const consultation_duration_minutes = durRadio?.value === '60' ? 60 : 30;
    const payload = {
      display_name: document.getElementById('adm-spec-name').value.trim(),
      specialty: document.getElementById('adm-spec-specialty').value.trim(),
      phone: document.getElementById('adm-spec-phone').value.trim() || null,
      bio: document.getElementById('adm-spec-bio').value.trim() || null,
      photo_url: document.getElementById('adm-spec-photo').value.trim() || null,
      sort_order: parseInt(document.getElementById('adm-spec-sort').value, 10) || 0,
      active: document.getElementById('adm-spec-active').checked,
      consultation_duration_minutes,
    };
    if (!payload.display_name || !payload.specialty) {
      setStatus(statusEl, 'Nome e especialidade são obrigatórios.', true);
      return;
    }
    setStatus(statusEl, 'A guardar…', false);
    try {
      if (id) {
        const { error } = await sb.from('specialists').update(payload).eq('id', id);
        if (error) throw error;
        const idView = document.getElementById('adm-spec-id-view');
        if (idView) idView.value = id;
      } else {
        const { data, error } = await sb.from('specialists').insert(payload).select('id').single();
        if (error) throw error;
        const newId = data?.id || '';
        document.getElementById('adm-spec-id').value = newId;
        const idView = document.getElementById('adm-spec-id-view');
        if (idView) idView.value = newId;
      }
      await refreshAll();
      if (id) {
        const { data: row } = await sb
          .from('specialists')
          .select('*')
          .eq('id', id)
          .maybeSingle();
        if (row) await fillSpecialistAdminContact(sb, row);
      }
      setStatus(statusEl, 'Especialista guardado. UUID pronto para copiar e vincular.', false);
    } catch (e) {
      setStatus(statusEl, e.message || String(e), true);
    }
  });

  document.getElementById('adm-link-save')?.addEventListener('click', async () => {
    const sel = document.getElementById('adm-link-spec');
    const inp = document.getElementById('adm-link-user');
    const hint = document.getElementById('adm-link-hint');
    const specId = sel?.value?.trim();
    const uid = inp?.value?.trim();
    if (!specId || !uid) {
      if (hint) hint.textContent = 'Escolhe o médico e cola o UUID do utilizador (Auth → Users).';
      return;
    }
    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRe.test(uid)) {
      if (hint) hint.textContent = 'UUID inválido.';
      return;
    }
    if (hint) hint.textContent = 'A guardar…';
    try {
      const { error } = await sb.rpc('admin_link_specialist_account', {
        p_specialist_id: specId,
        p_user_id: uid,
      });
      if (error) throw error;
      if (hint) hint.textContent = 'Ligação guardada. O médico vê a agenda em Perfil → Agenda de consultas.';
      inp.value = '';
    } catch (e) {
      const msg = formatSbError(e) || e.message || String(e);
      if (/auth_user_not_found|specialist_accounts_user_fkey|foreign key/i.test(msg)) {
        if (hint) {
          hint.textContent =
            `UUID não existe em Auth > Users deste projeto (${supabaseProjectRef()}). Quem veio só da ficha parceiro ainda pode não ter conta: usa «Enviar convite Auth por e-mail», ou cria o user no Dashboard, depois «Buscar UUID por e-mail».`;
        }
      } else if (/specialist_not_found/i.test(msg)) {
        if (hint) hint.textContent = 'Especialista não encontrado. Atualiza a lista e tenta novamente.';
      } else {
        if (hint) hint.textContent = msg;
      }
    }
  });

  document.getElementById('adm-link-invite-auth')?.addEventListener('click', async () => {
    const emailInp = document.getElementById('adm-link-email-lookup');
    const uuidInp = document.getElementById('adm-link-user');
    const hint = document.getElementById('adm-link-hint');
    let email = normalizeAuthEmailInput(emailInp?.value);
    if (emailInp) emailInp.value = email;
    const ref = supabaseProjectRef();
    if (!email.includes('@')) {
      if (hint) {
        hint.textContent =
          'Indica um e-mail completo (parceiros ainda não têm Auth até convite ou registo manual).';
      }
      return;
    }
    if (hint) hint.textContent = 'A enviar convite pelo Auth…';
    const origin =
      typeof window.auraPublicSiteBase === 'function'
        ? window.auraPublicSiteBase()
        : (window.AURA_APP_PUBLIC_URL || '').trim().replace(/\/$/, '') ||
          (typeof window.location?.origin === 'string' ? window.location.origin : '');
    const redirect_to = origin && /^https:\/\//i.test(origin) ? `${origin.replace(/\/$/, '')}/login.html` : undefined;
    try {
      const { data, error } = await sb.functions.invoke('admin-invite-auth-user', {
        body: { email, redirect_to },
      });
      if (error) {
        const msg = error.message || String(error);
        if (hint) {
          hint.textContent =
            /Edge Function returned a non-2xx status code|not found|Failed to fetch|FunctionsRelayError/i.test(msg)
              ? `A função «admin-invite-auth-user» pode não estar publicada neste projeto (${ref}), ou falhou ao enviar (ex. Resend). Verifica Secrets RESEND_* e repõe deploy.`
              : msg;
        }
        return;
      }
      if (data?.already_exists) {
        if (hint) {
          hint.textContent =
            'Já existe utilizador Auth com esse e-mail. Clica «Buscar UUID por e-mail» e depois «Guardar ligação».';
        }
        try {
          const { data: rpcData } = await sb.rpc('admin_lookup_auth_user_by_email', { p_email: email });
          if (rpcData?.found && rpcData?.id && uuidInp) uuidInp.value = rpcData.id;
        } catch {
          /* ignorar */
        }
        return;
      }
      if (data?.ok) {
        if (hint) {
          if (data.delivered_via === 'resend') {
            hint.textContent = `Convite enviado para ${email} (Resend). Pede para verificar remetente e spam; pede para abrir o link e criar conta; depois «Buscar UUID por e-mail».`;
          } else {
            hint.textContent = `Convite pedido pelo e-mail por defeito do Supabase (${email}). Se não chegar, configura RESEND_API_KEY na Edge Function «admin-invite-auth-user» (Dashboard → Secrets) ou SMTP em Authentication.`;
          }
        }
        if (data.user_id && uuidInp && !uuidInp.value?.trim()) uuidInp.value = data.user_id;
        return;
      }
      if (hint) hint.textContent = typeof data?.detail === 'string' ? data.detail : JSON.stringify(data || {});
    } catch (e) {
      if (hint) hint.textContent = e?.message || String(e);
    }
  });

  document.getElementById('adm-link-lookup-email')?.addEventListener('click', async () => {
    const emailInp = document.getElementById('adm-link-email-lookup');
    const uuidInp = document.getElementById('adm-link-user');
    const hint = document.getElementById('adm-link-hint');
    let email = normalizeAuthEmailInput(emailInp?.value);
    if (emailInp) emailInp.value = email;
    const ref = supabaseProjectRef();
    if (!email) {
      if (hint) hint.textContent = `Indica o e-mail com que o utilizador foi criado em Authentication (projeto ${ref}).`;
      return;
    }
    if (!email.includes('@')) {
      if (hint) {
        hint.textContent =
          'Isso não é um e-mail completo. Remove «mailto:» se colaste um link e mete o endereço com @ (ex.: nome@gmail.com), igual ao em Authentication.';
      }
      return;
    }
    if (hint) hint.textContent = 'A procurar no Auth…';
    try {
      const { data, error } = await sb.rpc('admin_lookup_auth_user_by_email', { p_email: email });
      if (error) throw error;
      if (data?.found && data.id) {
        if (uuidInp) uuidInp.value = data.id;
        if (hint) hint.textContent = `UUID preenchido. Projeto: ${ref}. E-mail em Auth: ${data.email || email}.`;
      } else if (data?.ambiguous) {
        if (hint) {
          hint.textContent = `Vários utilizadores com este e-mail neste projeto; resolve no Dashboard → Users. Projeto: ${ref}.`;
        }
      } else {
        if (hint) {
          hint.textContent = `Nenhum utilizador com este e-mail neste projeto (${ref}). Clica «Enviar convite Auth por e-mail» ou cria o user em Authentication no Dashboard e volta a buscar.`;
        }
      }
    } catch (e) {
      const msg = formatSbError(e) || e.message || String(e);
      if (/function|schema cache|admin_lookup_auth_user_by_email/i.test(msg)) {
        if (hint) {
          hint.textContent = `Aplica a migração 20260505160000_admin_lookup_auth_user_by_email.sql no projeto ${ref} e tenta outra vez.`;
        }
      } else {
        if (hint) hint.textContent = msg;
      }
    }
  });

  document.getElementById('adm-link-validate')?.addEventListener('click', async () => {
    const inp = document.getElementById('adm-link-user');
    const hint = document.getElementById('adm-link-hint');
    const uid = inp?.value?.trim();
    const ref = supabaseProjectRef();
    if (!uid) {
      if (hint) hint.textContent = 'Cola o UUID ou usa «Buscar UUID por e-mail».';
      return;
    }
    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRe.test(uid)) {
      if (hint) hint.textContent = 'Formato de UUID inválido.';
      return;
    }
    if (hint) hint.textContent = 'A validar no Auth…';
    try {
      const { data, error } = await sb.rpc('admin_check_auth_user', { p_user_id: uid });
      if (error) throw error;
      if (data?.exists) {
        if (hint) hint.textContent = `UUID válido no Auth (projeto ${ref}). E-mail: ${data.email || 'sem e-mail'}.`;
      } else {
        if (hint) {
          hint.textContent = `UUID não encontrado em Auth > Users deste projeto (${ref}). Se copiaste de outro sítio ou outro projeto, usa a busca por e-mail ou cria o user aqui.`;
        }
      }
    } catch (e) {
      const msg = formatSbError(e) || e.message || String(e);
      if (/function|schema cache|admin_check_auth_user/i.test(msg)) {
        if (hint) {
          hint.textContent = `Aplica a migração 20260505152000_admin_check_auth_user_rpc.sql no projeto ${ref} e tenta novamente.`;
        }
      } else {
        if (hint) hint.textContent = msg;
      }
    }
  });

  document.getElementById('adm-terms-save')?.addEventListener('click', async () => {
    const hint = document.getElementById('adm-terms-hint');
    const title = document.getElementById('adm-terms-title')?.value?.trim() || 'Termos e condições de uso';
    const body = document.getElementById('adm-terms-body')?.value ?? '';
    if (hint) hint.textContent = 'A guardar…';
    try {
      const row = {
        slug: 'terms',
        title,
        body,
        updated_at: new Date().toISOString(),
      };
      const { error } = await sb.from('app_public_legal').upsert(row, { onConflict: 'slug' });
      if (error) throw error;
      if (hint) hint.textContent = 'Termos guardados.';
    } catch (e) {
      if (hint) {
        hint.textContent = isAppPublicLegalMissingError(e)
          ? 'Tabela app_public_legal em falta. Cola supabase/COLE_APP_PUBLIC_LEGAL.sql no SQL Editor do Supabase e tenta outra vez.'
          : e.message || String(e);
      }
    }
  });

  document.getElementById('adm-mother-search')?.addEventListener('click', async () => {
    if (!tbodyMothers) return;
    setStatus(statusEl, 'A pesquisar perfis…', false);
    try {
      const q = document.getElementById('adm-mother-q')?.value || '';
      const rows = await loadMothers(sb, q);
      renderMothers(rows, tbodyMothers);
      setStatus(statusEl, 'Lista de perfis atualizada.', false);
    } catch (e) {
      setStatus(statusEl, e.message || String(e), true);
    }
  });

  tbodyMothers?.addEventListener('click', async (ev) => {
    const el = clickEventTargetElement(ev);
    const btn = el?.closest?.('button[data-edit-mother]');
    const id = btn?.getAttribute('data-edit-mother');
    if (!id) return;
    const editor = document.getElementById('adm-mother-editor');
    setStatus(statusEl, 'A carregar perfil…', false);
    try {
      const { data: row, error } = await sb
        .from('profiles')
        .select('id,email,full_name,phone,cidade,estado,bio,account_type,terms_accepted_at')
        .eq('id', id)
        .maybeSingle();
      if (error) throw error;
      if (!row) return;
      document.getElementById('adm-m-id').value = row.id;
      document.getElementById('adm-m-id-hint').textContent = `ID: ${row.id}`;
      const at = row.account_type === 'medic' ? 'medic' : 'mother';
      document.querySelectorAll('input[name="adm-m-account-type"]').forEach((inp) => {
        inp.checked = inp.value === at;
      });
      document.getElementById('adm-m-name').value = row.full_name || '';
      document.getElementById('adm-m-email').value = row.email || '';
      document.getElementById('adm-m-phone').value = row.phone || '';
      document.getElementById('adm-m-city').value = row.cidade || '';
      document.getElementById('adm-m-state').value = row.estado || '';
      document.getElementById('adm-m-bio').value = row.bio || '';
      document.getElementById('adm-m-clear-terms').checked = false;
      if (editor) {
        editor.hidden = false;
        editor.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
      await syncConsultDurPanel(row.id);
      setStatus(statusEl, 'Edita os campos e guarda.', false);
    } catch (e) {
      setStatus(statusEl, e.message || String(e), true);
    }
  });

  document.getElementById('adm-m-cancel')?.addEventListener('click', () => {
    const editor = document.getElementById('adm-mother-editor');
    if (editor) editor.hidden = true;
    document.getElementById('adm-m-id').value = '';
    durWrap?.classList.remove('admin-dur-for-medic--on');
    if (durHint) durHint.textContent = '';
  });

  document.getElementById('adm-m-save')?.addEventListener('click', async () => {
    const id = document.getElementById('adm-m-id')?.value?.trim();
    if (!id) return;
    const full_name = document.getElementById('adm-m-name')?.value?.trim();
    if (!full_name) {
      setStatus(statusEl, 'Nome completo é obrigatório.', true);
      return;
    }
    const accountType =
      document.querySelector('input[name="adm-m-account-type"]:checked')?.value === 'medic' ? 'medic' : 'mother';
    const emailRaw = document.getElementById('adm-m-email')?.value?.trim();
    const estadoRaw = document.getElementById('adm-m-state')?.value?.trim().toUpperCase().slice(0, 2);
    const clearTerms = !!document.getElementById('adm-m-clear-terms')?.checked;
    const consultDur =
      accountType === 'medic'
        ? document.querySelector('input[name="adm-m-consult-dur"]:checked')?.value === '60'
          ? 60
          : 30
        : null;

    const payload = {
      full_name,
      email: emailRaw || null,
      phone: document.getElementById('adm-m-phone')?.value?.trim() || null,
      cidade: document.getElementById('adm-m-city')?.value?.trim() || null,
      estado: estadoRaw || null,
      bio: document.getElementById('adm-m-bio')?.value?.trim() || null,
      account_type: accountType,
    };
    if (clearTerms) {
      payload.terms_accepted_at = null;
    }
    setStatus(statusEl, 'A guardar perfil…', false);
    try {
      const { data: rpcData, error: rpcErr } = await sb.rpc('admin_save_cadastro_profile', {
        p_user_id: id,
        p_full_name: full_name,
        p_email: emailRaw || null,
        p_phone: payload.phone,
        p_cidade: payload.cidade,
        p_estado: estadoRaw || null,
        p_bio: payload.bio,
        p_account_type: accountType,
        p_clear_terms: clearTerms,
        p_consultation_duration_minutes: consultDur,
      });

      if (rpcErr) {
        if (!rpcMissing(rpcErr)) throw rpcErr;
        const { error } = await sb.from('profiles').update(payload).eq('id', id);
        if (error) throw error;
        if (accountType === 'mother') {
          const { error: cErr } = await sb.rpc('admin_clear_specialist_link', { p_user_id: id });
          if (cErr && !/function|schema|not exist/i.test(String(cErr.message || ''))) {
            console.warn('[admin] clear specialist link:', cErr.message);
          }
        } else if (accountType === 'medic' && durWrap?.dataset?.specialistId) {
          const { error: spErr } = await sb
            .from('specialists')
            .update({ consultation_duration_minutes: consultDur })
            .eq('id', durWrap.dataset.specialistId);
          if (spErr) console.warn('[admin] consultation_duration_minutes:', spErr.message);
        }
      }

      document.getElementById('adm-mother-editor').hidden = true;

      await refreshAll();
      const q = document.getElementById('adm-mother-q')?.value || '';
      const rows = await loadMothers(sb, q);
      renderMothers(rows, tbodyMothers);
      let msg = 'Perfil atualizado.';
      if (accountType === 'medic') {
        if (rpcData?.specialist_auto_created) {
          msg +=
            ' Foi criado um registo em Especialistas (ativo na app). Completa especialidade e capa na aba Especialistas.';
        } else if (!rpcErr) {
          msg += ' Registo de especialista atualizado. Ajusta detalhes na aba Especialistas, se precisares.';
        } else {
          msg +=
            ' Para criar o registo em Especialistas ao mudar para médico, aplica no Supabase a migração SQL mais recente (admin_save_cadastro_profile).';
        }
      }
      setStatus(statusEl, msg, false);
    } catch (e) {
      const extra = formatSbError(e);
      setStatus(statusEl, extra || e.message || String(e), true);
    }
  });

  document.getElementById('adm-goto-spec')?.addEventListener('click', () => {
    tabSwitch(document, 'spec');
  });

  if (tbodyBook) {
    tbodyBook.addEventListener('click', async (ev) => {
      const el = clickEventTargetElement(ev);
      const btn = el?.closest?.('button[data-cancel-booking]');
      const bid = btn?.getAttribute('data-cancel-booking');
      if (!bid) return;
      if (!window.confirm('Cancelar esta reserva? O horário volta a ficar livre.')) return;
      setStatus(statusEl, 'A cancelar…', false);
      try {
        const { error } = await sb.from('consultation_bookings').update({ status: 'cancelled' }).eq('id', bid);
        if (error) throw error;
        await refreshAll();
      } catch (e) {
        setStatus(statusEl, e.message || String(e), true);
      }
    });
  }

  await refreshAll();
  initAdminAnalyticsDates();
  document.getElementById('adm-an-refresh')?.addEventListener('click', () => void refreshAdminAnalytics(sb, statusEl));
  await refreshAdminAnalytics(sb, statusEl);
}

main();
