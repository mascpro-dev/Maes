/**
 * admin.html — painel restrito a utilizadores em public.aura_admins.
 */
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

function tabSwitch(root, name) {
  root.querySelectorAll('.admin-tab').forEach((btn) => {
    const on = btn.dataset.tab === name;
    btn.classList.toggle('admin-tab--active', on);
    btn.setAttribute('aria-selected', on ? 'true' : 'false');
  });
  ['spec', 'book', 'chk', 'reg'].forEach((k) => {
    const panel = document.getElementById(`panel-${k}`);
    if (panel) panel.hidden = k !== name;
  });
}

function clearSpecForm(root) {
  root.querySelector('#adm-spec-id').value = '';
  root.querySelector('#adm-spec-name').value = '';
  root.querySelector('#adm-spec-specialty').value = '';
  root.querySelector('#adm-spec-bio').value = '';
  root.querySelector('#adm-spec-photo').value = '';
  root.querySelector('#adm-spec-sort').value = '0';
  root.querySelector('#adm-spec-active').checked = true;
}

async function loadSpecialists(sb) {
  const { data, error } = await sb.from('specialists').select('*').order('sort_order', { ascending: true });
  if (error) throw error;
  return data || [];
}

function renderSpecialists(rows, tbody, specNameById) {
  tbody.innerHTML = '';
  rows.forEach((r) => {
    specNameById.set(r.id, r.display_name || r.id);
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${r.sort_order ?? 0}</td>
      <td>${escapeHtml(r.display_name || '')}</td>
      <td>${escapeHtml(r.specialty || '')}</td>
      <td>${r.active ? 'sim' : 'não'}</td>
      <td class="btn-cell"><button type="button" class="admin-btn" data-edit="${r.id}">Editar</button></td>
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

async function loadAdminTerms(sb) {
  const { data, error } = await sb.from('app_public_legal').select('title,body').eq('slug', 'terms').maybeSingle();
  if (error) throw error;
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
    .select('id,email,full_name,phone,terms_accepted_at,updated_at')
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
    tr.innerHTML = `<td colspan="5" class="admin-muted">Nenhum perfil encontrado.</td>`;
    tbody.appendChild(tr);
    return;
  }
  rows.forEach((r) => {
    const tr = document.createElement('tr');
    const ta = r.terms_accepted_at ? fmtDate(r.terms_accepted_at) : '—';
    tr.innerHTML = `
      <td>${escapeHtml(r.full_name || '—')}</td>
      <td>${escapeHtml(r.email || '—')}</td>
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
  let regDataLoaded = false;

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

  async function refreshAll() {
    setStatus(statusEl, 'A carregar…', false);
    const parts = [];
    try {
      const specs = await loadSpecialists(sb);
      renderSpecialists(specs, tbodySpec, specNameById);
      fillLinkSpecialistSelect(specs);
    } catch (e) {
      parts.push('Especialistas: ' + (e.message || e));
    }
    try {
      const books = await loadBookings(sb);
      renderBookings(books, tbodyBook, specNameById);
    } catch (e) {
      parts.push('Reservas: ' + (e.message || e));
    }
    try {
      const intents = await loadIntents(sb);
      renderIntents(intents, tbodyChk, specNameById);
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
      if (hint) hint.textContent = '';
    } catch (e) {
      if (hint) hint.textContent = 'Termos: ' + (e.message || e);
    }
    if (tbodyMothers) {
      try {
        const q = document.getElementById('adm-mother-q')?.value || '';
        const rows = await loadMothers(sb, q);
        renderMothers(rows, tbodyMothers);
      } catch (e) {
        setStatus(statusEl, 'Perfis: ' + (e.message || e), true);
      }
    }
  }

  document.querySelectorAll('.admin-tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      const name = btn.dataset.tab;
      tabSwitch(document, name);
      if (name === 'reg' && !regDataLoaded) {
        regDataLoaded = true;
        refreshCadastrosTab();
      }
    });
  });

  tbodySpec.addEventListener('click', async (ev) => {
    const id = ev.target?.dataset?.edit;
    if (!id) return;
    const { data: row, error } = await sb.from('specialists').select('*').eq('id', id).maybeSingle();
    if (error) {
      setStatus(statusEl, error.message, true);
      return;
    }
    if (!row) return;
    document.getElementById('adm-spec-id').value = row.id;
    document.getElementById('adm-spec-name').value = row.display_name || '';
    document.getElementById('adm-spec-specialty').value = row.specialty || '';
    document.getElementById('adm-spec-bio').value = row.bio || '';
    document.getElementById('adm-spec-photo').value = row.photo_url || '';
    document.getElementById('adm-spec-sort').value = String(row.sort_order ?? 0);
    document.getElementById('adm-spec-active').checked = !!row.active;
    tabSwitch(document, 'spec');
    setStatus(statusEl, 'Formulário preenchido — altera e guarda.', false);
  });

  document.getElementById('adm-spec-clear').addEventListener('click', () => {
    clearSpecForm(document);
    setStatus(statusEl, 'Formulário limpo.', false);
  });

  document.getElementById('adm-spec-save').addEventListener('click', async () => {
    const id = document.getElementById('adm-spec-id').value.trim();
    const payload = {
      display_name: document.getElementById('adm-spec-name').value.trim(),
      specialty: document.getElementById('adm-spec-specialty').value.trim(),
      bio: document.getElementById('adm-spec-bio').value.trim() || null,
      photo_url: document.getElementById('adm-spec-photo').value.trim() || null,
      sort_order: parseInt(document.getElementById('adm-spec-sort').value, 10) || 0,
      active: document.getElementById('adm-spec-active').checked,
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
      } else {
        const { error } = await sb.from('specialists').insert(payload);
        if (error) throw error;
        clearSpecForm(document);
      }
      await refreshAll();
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
      if (hint) hint.textContent = e.message || String(e);
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
      if (hint) hint.textContent = e.message || String(e);
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
    const id = ev.target?.dataset?.editMother;
    if (!id) return;
    const editor = document.getElementById('adm-mother-editor');
    setStatus(statusEl, 'A carregar perfil…', false);
    try {
      const { data: row, error } = await sb
        .from('profiles')
        .select('id,email,full_name,phone,cidade,estado,bio,terms_accepted_at')
        .eq('id', id)
        .maybeSingle();
      if (error) throw error;
      if (!row) return;
      document.getElementById('adm-m-id').value = row.id;
      document.getElementById('adm-m-id-hint').textContent = `ID: ${row.id}`;
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
      setStatus(statusEl, 'Edita os campos e guarda.', false);
    } catch (e) {
      setStatus(statusEl, e.message || String(e), true);
    }
  });

  document.getElementById('adm-m-cancel')?.addEventListener('click', () => {
    const editor = document.getElementById('adm-mother-editor');
    if (editor) editor.hidden = true;
    document.getElementById('adm-m-id').value = '';
  });

  document.getElementById('adm-m-save')?.addEventListener('click', async () => {
    const id = document.getElementById('adm-m-id')?.value?.trim();
    if (!id) return;
    const full_name = document.getElementById('adm-m-name')?.value?.trim();
    if (!full_name) {
      setStatus(statusEl, 'Nome completo é obrigatório.', true);
      return;
    }
    const payload = {
      full_name,
      email: document.getElementById('adm-m-email')?.value?.trim() || null,
      phone: document.getElementById('adm-m-phone')?.value?.trim() || null,
      cidade: document.getElementById('adm-m-city')?.value?.trim() || null,
      estado: document.getElementById('adm-m-state')?.value?.trim().toUpperCase().slice(0, 2) || null,
      bio: document.getElementById('adm-m-bio')?.value?.trim() || null,
    };
    if (document.getElementById('adm-m-clear-terms')?.checked) {
      payload.terms_accepted_at = null;
    }
    setStatus(statusEl, 'A guardar perfil…', false);
    try {
      const { error } = await sb.from('profiles').update(payload).eq('id', id);
      if (error) throw error;
      document.getElementById('adm-mother-editor').hidden = true;
      const q = document.getElementById('adm-mother-q')?.value || '';
      const rows = await loadMothers(sb, q);
      renderMothers(rows, tbodyMothers);
      setStatus(statusEl, 'Perfil atualizado.', false);
    } catch (e) {
      setStatus(statusEl, e.message || String(e), true);
    }
  });

  document.getElementById('adm-goto-spec')?.addEventListener('click', () => {
    tabSwitch(document, 'spec');
  });

  tbodyBook.addEventListener('click', async (ev) => {
    const bid = ev.target?.dataset?.cancelBooking;
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

  await refreshAll();
}

main();
