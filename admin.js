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
  ['spec', 'book', 'chk'].forEach((k) => {
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
  const { data, error } = await sb
    .from('consultation_bookings')
    .select('*')
    .order('starts_at', { ascending: false })
    .limit(300);
  if (error) throw error;
  return data || [];
}

function renderBookings(rows, tbody, specNameById) {
  tbody.innerHTML = '';
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
  const { data, error } = await sb
    .from('consultation_checkout_intents')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(300);
  if (error) throw error;
  return data || [];
}

function renderIntents(rows, tbody, specNameById) {
  tbody.innerHTML = '';
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

  async function refreshAll() {
    setStatus(statusEl, 'A carregar…', false);
    try {
      const specs = await loadSpecialists(sb);
      renderSpecialists(specs, tbodySpec, specNameById);
      const books = await loadBookings(sb);
      renderBookings(books, tbodyBook, specNameById);
      const intents = await loadIntents(sb);
      renderIntents(intents, tbodyChk, specNameById);
      setStatus(statusEl, 'Dados atualizados.', false);
    } catch (e) {
      setStatus(statusEl, e.message || String(e), true);
    }
  }

  document.querySelectorAll('.admin-tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      tabSwitch(document, btn.dataset.tab);
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
