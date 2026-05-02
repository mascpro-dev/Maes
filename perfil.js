/**
 * /perfil — layout dashboard: profiles, children, conclusão.
 */
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.1/+esm';

const DIAG_LABELS = {
  tea: 'TEA',
  tdah: 'TDAH',
  down: 'S. Down',
  pc: 'Paralisia cerebral',
  rara: 'Doença rara',
  investigacao: 'Em investigação',
  mae_solo: 'Mãe solo (atípica)',
};

const DONUT_R = 46;
const DONUT_C = 2 * Math.PI * DONUT_R;

function formatBirth(iso) {
  if (!iso) return null;
  const d = new Date(iso + 'T12:00:00');
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' });
}

function ageFromBirth(iso) {
  if (!iso) return null;
  const b = new Date(iso + 'T12:00:00');
  if (Number.isNaN(b.getTime())) return null;
  const t = new Date();
  let a = t.getFullYear() - b.getFullYear();
  const m = t.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && t.getDate() < b.getDate())) a -= 1;
  return a >= 0 ? a : null;
}

function initials(name) {
  if (typeof AuraAuth !== 'undefined' && AuraAuth.initialsFromNome) {
    return AuraAuth.initialsFromNome(name);
  }
  if (!name || !String(name).trim()) return 'AU';
  const p = String(name).trim().split(/\s+/).filter(Boolean);
  if (p.length >= 2) return (p[0][0] + p[1][0]).toUpperCase();
  return String(name).trim().slice(0, 2).toUpperCase();
}

function toast(msg) {
  if (typeof showToast === 'function') showToast(msg);
  else alert(msg);
}

async function loadPublicTerms(supabase) {
  const bodyEl = document.getElementById('perfil-terms-body');
  const meta = document.getElementById('perfil-terms-updated');
  const errEl = document.getElementById('perfil-terms-error');
  const head = document.getElementById('perfil-terms-heading');
  if (!bodyEl) return;
  if (errEl) {
    errEl.hidden = true;
    errEl.textContent = '';
  }
  const { data, error } = await supabase
    .from('app_public_legal')
    .select('title,body,updated_at')
    .eq('slug', 'terms')
    .maybeSingle();
  if (error) {
    if (errEl) {
      errEl.hidden = false;
      errEl.textContent =
        error.message ||
        'Não foi possível carregar os termos. Aplica a migração 20260410220000_admin_profiles_public_terms.sql no Supabase.';
    }
    bodyEl.textContent = '';
    return;
  }
  if (head && data?.title) head.textContent = data.title;
  bodyEl.textContent = data?.body || '';
  if (meta) {
    if (data?.updated_at) {
      meta.hidden = false;
      meta.textContent =
        'Última atualização: ' +
        new Date(data.updated_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
    } else {
      meta.hidden = true;
    }
  }
}

function applyPerfilRoute() {
  const hash = (window.location.hash || '').toLowerCase();
  const isTerms = hash === '#termos';
  const content = document.getElementById('perfil-content');
  const title = document.querySelector('.perfil-dash__title');
  const completion = document.querySelector('.perfil-completion');
  const linkDados = document.getElementById('perfil-sidebar-dados');
  const linkTermos = document.getElementById('perfil-sidebar-termos');
  const termosSection = document.getElementById('termos');
  if (!content) return;
  content.hidden = false;
  if (isTerms) {
    if (title) title.textContent = 'Termos e condições';
    if (completion) completion.hidden = true;
    linkDados?.classList.remove('perfil-sidebar__link--active');
    linkDados?.removeAttribute('aria-current');
    linkTermos?.classList.add('perfil-sidebar__link--active');
    linkTermos?.setAttribute('aria-current', 'page');
    requestAnimationFrame(() => {
      termosSection?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  } else {
    if (title) title.textContent = 'Editar perfil';
    if (completion) completion.hidden = false;
    linkTermos?.classList.remove('perfil-sidebar__link--active');
    linkTermos?.removeAttribute('aria-current');
    linkDados?.classList.add('perfil-sidebar__link--active');
    linkDados?.setAttribute('aria-current', 'page');
  }
}

const AVATAR_BUCKET = 'avatars';
const AVATAR_MAX_BYTES = 5 * 1024 * 1024;

function extFromAvatarFile(file) {
  const t = (file.type || '').toLowerCase();
  if (t.includes('png')) return 'png';
  if (t.includes('webp')) return 'webp';
  if (t.includes('gif')) return 'gif';
  return 'jpg';
}

function validateAvatarFile(file) {
  const t = (file.type || '').toLowerCase();
  const ok = /^image\/(jpeg|jpg|png|webp|gif)$/i.test(t);
  if (!ok) {
    toast('Formato inválido. Usa JPG, PNG, WebP ou GIF.');
    return false;
  }
  if (file.size > AVATAR_MAX_BYTES) {
    toast('A imagem deve ter no máximo 5 MB.');
    return false;
  }
  return true;
}

/**
 * Upload para Storage `avatars/{uid}/avatar.{ext}` + atualiza profiles.avatar_url.
 * @returns {Promise<string|null>} URL pública guardada (com cache-bust) ou null
 */
async function uploadProfileAvatar(file, supabase, uid) {
  if (!validateAvatarFile(file)) return null;
  const ext = extFromAvatarFile(file);
  const path = `${uid}/avatar.${ext}`;
  const { error: upErr } = await supabase.storage.from(AVATAR_BUCKET).upload(path, file, {
    upsert: true,
    cacheControl: '86400',
    contentType: file.type || 'image/jpeg',
  });
  if (upErr) {
    console.warn('[Aura] avatar upload:', upErr);
    const m = String(upErr.message || '');
    if (/bucket|not found|404/i.test(m)) {
      toast('Bucket "avatars" em falta. Corre supabase/COLE_STORAGE_AVATARS.sql no SQL Editor.');
    } else if (/row-level security|RLS|policy|403|permission/i.test(m)) {
      toast('Sem permissão no Storage. Verifica as políticas do bucket avatars.');
    } else {
      toast('Não foi possível enviar a foto: ' + m);
    }
    return null;
  }
  const { data: pub } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path);
  const base = pub?.publicUrl;
  if (!base) {
    toast('Upload ok mas falhou a URL pública.');
    return null;
  }
  const avatar_url = `${base.split('?')[0]}?v=${Date.now()}`;
  const { error: dbErr } = await supabase.from('profiles').update({ avatar_url }).eq('id', uid);
  if (dbErr) {
    toast('Foto enviada mas falhou ao guardar no perfil: ' + (dbErr.message || ''));
    return null;
  }
  return avatar_url;
}

async function getClient() {
  if (window.__auraAuthReady) {
    const ok = await window.__auraAuthReady;
    if (!ok) return null;
  }
  if (window.__auraSupabaseClient) return window.__auraSupabaseClient;
  const url = window.AURA_SUPABASE_URL;
  const key = window.AURA_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });
}

function setCompletionUI(profile, children) {
  const pctEl = document.getElementById('perfil-completion-pct');
  const circle = document.getElementById('perfil-donut-progress');
  const listEl = document.getElementById('perfil-completion-list');
  if (!listEl) return;

  const hasName = !!(profile?.full_name && String(profile.full_name).trim());
  const hasAvatar = !!(profile?.avatar_url && String(profile.avatar_url).trim());
  const hasBio = !!(profile?.bio && String(profile.bio).trim());
  const hasPhone = !!(profile?.phone && String(profile.phone).trim());
  const hasCity = !!(profile?.cidade && String(profile.cidade).trim());
  const hasState = !!(profile?.estado && String(profile.estado).trim());
  const hasKids = Array.isArray(children) && children.length > 0;

  const checks = [
    { done: hasName, label: 'Nome completo', w: 25 },
    { done: hasAvatar, label: 'Foto de perfil', w: 20 },
    { done: hasBio, label: 'Bio', w: 20 },
    { done: hasPhone, label: 'Telefone', w: 15 },
    { done: hasCity, label: 'Cidade', w: 7 },
    { done: hasState, label: 'Estado', w: 3 },
    { done: hasKids, label: 'Dados do filho', w: 10 },
  ];

  const pct = Math.min(
    100,
    checks.reduce((s, c) => s + (c.done ? c.w : 0), 0)
  );

  if (pctEl) pctEl.textContent = `${Math.round(pct)}%`;
  if (circle) {
    circle.style.strokeDasharray = String(DONUT_C);
    circle.style.strokeDashoffset = String(DONUT_C * (1 - pct / 100));
  }

  listEl.innerHTML = '';
  checks.forEach((c) => {
    const li = document.createElement('li');
    li.className = 'perfil-completion__item';
    const icon = document.createElement('span');
    icon.className = 'perfil-completion__icon ' + (c.done ? 'perfil-completion__icon--ok' : 'perfil-completion__icon--todo');
    icon.textContent = c.done ? '✓' : '+';
    const text = document.createElement('span');
    text.className = 'perfil-completion__item-text';
    text.innerHTML = c.done
      ? `<strong>${c.label}</strong> completo`
      : `<strong>${c.label}</strong> — adiciona para subir o perfil`;
    const w = document.createElement('span');
    w.className = 'perfil-completion__weight' + (c.done ? '' : ' perfil-completion__weight--todo');
    w.textContent = c.done ? `${c.w}%` : `+${c.w}%`;
    li.appendChild(icon);
    li.appendChild(text);
    li.appendChild(w);
    listEl.appendChild(li);
  });
}

function bindLogout(btn) {
  if (!btn || typeof AuraAuth === 'undefined') return;
  btn.addEventListener('click', () => {
    if (navigator.vibrate) navigator.vibrate(25);
    AuraAuth.logout();
  });
}

function setPersonalEditMode(open) {
  const view = document.getElementById('perfil-personal-view');
  const edit = document.getElementById('perfil-personal-edit');
  const btn = document.getElementById('btn-toggle-personal');
  if (view) view.hidden = !!open;
  if (edit) edit.hidden = !open;
  if (btn) {
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    btn.style.visibility = open ? 'hidden' : 'visible';
  }
}

function setBioEditMode(open) {
  const bioText = document.getElementById('perfil-bio-text');
  const edit = document.getElementById('perfil-bio-edit');
  const btn = document.getElementById('btn-toggle-bio');
  if (bioText) bioText.hidden = !!open;
  if (edit) edit.hidden = !open;
  if (btn) {
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    btn.style.visibility = open ? 'hidden' : 'visible';
  }
}

function renderProfile(profile, children) {
  const loading = document.getElementById('perfil-loading');
  const content = document.getElementById('perfil-content');
  if (loading) loading.hidden = true;
  if (content) content.hidden = false;

  const nome = (profile?.full_name || '').trim() || 'Mãe Aura';
  const email = (profile?.email || '').trim();
  const phone = (profile?.phone || '').trim();
  const city = (profile?.cidade || '').trim();
  const state = (profile?.estado || '').trim();

  const displayName = document.getElementById('perfil-display-name');
  const displayEmail = document.getElementById('perfil-display-email');
  const displayPhone = document.getElementById('perfil-display-phone');
  const displayCity = document.getElementById('perfil-display-city');
  const displayState = document.getElementById('perfil-display-state');
  const displayAcct = document.getElementById('perfil-display-account-type');
  if (displayName) displayName.textContent = nome;
  if (displayEmail) displayEmail.textContent = email || '—';
  if (displayPhone) displayPhone.textContent = phone || '—';
  if (displayCity) displayCity.textContent = city || '—';
  if (displayState) displayState.textContent = state || '—';
  if (displayAcct) {
    displayAcct.textContent = profile?.account_type === 'medic' ? 'Médico' : 'Mãe';
  }

  const inName = document.getElementById('perfil-input-name');
  const inEmail = document.getElementById('perfil-input-email');
  const inPhone = document.getElementById('perfil-input-phone');
  const inCity = document.getElementById('perfil-input-city');
  const inState = document.getElementById('perfil-input-state');
  if (inName) inName.value = (profile?.full_name || '').trim();
  if (inEmail) inEmail.value = email;
  if (inPhone) inPhone.value = phone;
  if (inCity) inCity.value = city;
  if (inState) inState.value = state;

  const bioEl = document.getElementById('perfil-bio-text');
  const inBio = document.getElementById('perfil-input-bio');
  const bio = (profile?.bio || '').trim();
  if (inBio) inBio.value = bio;
  if (bioEl) {
    if (bio) {
      bioEl.textContent = bio;
      bioEl.classList.remove('perfil-bio__empty');
    } else {
      bioEl.textContent = 'Ainda não escreveste uma bio. Usa “Editar” para contar um pouco sobre ti.';
      bioEl.classList.add('perfil-bio__empty');
    }
  }

  const imgEl = document.getElementById('perfil-avatar-img');
  const initialsEl = document.getElementById('perfil-avatar-initials');
  const pic = (profile?.avatar_url || '').trim();
  if (imgEl && initialsEl) {
    if (pic) {
      imgEl.src = pic;
      imgEl.alt = 'Foto de ' + nome;
      imgEl.hidden = false;
      initialsEl.hidden = true;
    } else {
      imgEl.hidden = true;
      initialsEl.hidden = false;
      initialsEl.textContent = initials(nome);
    }
  }

  const listEl = document.getElementById('perfil-children-list');
  if (listEl) {
    listEl.innerHTML = '';
    const kids = Array.isArray(children) ? children : [];

    if (!kids.length) {
      const p = document.createElement('p');
      p.className = 'perfil-empty-kids';
      p.textContent =
        'Nenhum filho registado ainda. Completa o cadastro (passo 2) para aparecer aqui.';
      listEl.appendChild(p);
    } else {
      kids.forEach((c) => {
        const card = document.createElement('article');
        card.className = 'perfil-child-card';
        const n = String(c.name ?? c.nome ?? '')
          .trim()
          .replace(/\s+/g, ' ') || 'Criança';
        const birth = formatBirth(c.data_nascimento);
        const age = ageFromBirth(c.data_nascimento);

        const h = document.createElement('div');
        h.className = 'perfil-child-card__name';
        h.textContent = n;
        card.appendChild(h);

        const meta = document.createElement('div');
        meta.className = 'perfil-child-card__meta';
        const parts = [];
        if (birth) parts.push('Nasc.: ' + birth);
        if (age != null) parts.push(age + ' anos');
        meta.textContent = parts.length ? parts.join(' · ') : 'Data de nascimento não informada';
        card.appendChild(meta);

        const dx = Array.isArray(c.diagnosticos) ? c.diagnosticos : [];
        if (dx.length) {
          const tags = document.createElement('div');
          tags.className = 'perfil-tags';
          dx.forEach((slug) => {
            const t = document.createElement('span');
            t.className = 'perfil-tag';
            t.textContent = DIAG_LABELS[slug] || slug;
            tags.appendChild(t);
          });
          card.appendChild(tags);
        }

        listEl.appendChild(card);
      });
    }
  }

  setCompletionUI(profile, children);
}

(async function initPerfil() {
  const supabase = await getClient();
  if (!supabase) {
    const loading = document.getElementById('perfil-loading');
    if (loading) loading.textContent = 'Não foi possível carregar a sessão.';
    return;
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user?.id) {
    window.location.replace('login.html');
    return;
  }

  const uid = session.user.id;

  const [{ data: profile, error: pErr }, { data: children, error: cErr }] = await Promise.all([
    supabase
      .from('profiles')
      .select('full_name, email, phone, cidade, estado, avatar_url, bio, account_type')
      .eq('id', uid)
      .maybeSingle(),
    supabase
      .from('children')
      .select('*')
      .eq('user_id', uid)
      .order('created_at', { ascending: true }),
  ]);

  if (pErr) console.warn('[Aura] perfil profiles:', pErr.message);
  if (cErr) console.warn('[Aura] perfil children:', cErr.message);

  let merged = {
    ...(profile || {}),
    email: profile?.email || session.user.email || '',
  };

  renderProfile(merged, children || []);
  applyPerfilRoute();
  void loadPublicTerms(supabase);
  window.addEventListener('hashchange', () => applyPerfilRoute());

  try {
    const { data: linkedSpecId, error: linkErr } = await supabase.rpc('my_specialist_id');
    const isMedic = String(merged?.account_type ?? '')
      .trim()
      .toLowerCase() === 'medic';
    const specRaw = linkedSpecId == null ? '' : String(linkedSpecId).trim();
    const hasValidSpecialistId =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        specRaw
      );
    const showAgenda = isMedic && !linkErr && hasValidSpecialistId;

    const agendaLink = document.getElementById('perfil-link-esp-agenda');
    const banner = document.getElementById('perfil-medic-link-hint');
    if (agendaLink) {
      if (showAgenda) {
        agendaLink.classList.remove('perfil-esp-agenda--hidden');
        agendaLink.removeAttribute('hidden');
        agendaLink.setAttribute('aria-hidden', 'false');
        agendaLink.removeAttribute('tabindex');
      } else {
        agendaLink.classList.add('perfil-esp-agenda--hidden');
        agendaLink.setAttribute('hidden', '');
        agendaLink.setAttribute('aria-hidden', 'true');
        agendaLink.setAttribute('tabindex', '-1');
      }
    }
    if (banner) {
      if (isMedic && !linkErr && !hasValidSpecialistId) {
        banner.hidden = false;
        banner.textContent =
          'A tua conta está como médico, mas falta a ligação ao registo de especialista na base de dados. Pede à equipa (painel admin → Especialistas → ligar conta).';
      } else {
        banner.hidden = true;
        banner.textContent = '';
      }
    }
  } catch {
    /* migração opcional */
  }

  if (new URLSearchParams(window.location.search).get('completar') === 'rede') {
    toast(
      'Para a rede de apoio (Explorar): confirma telefone, cidade, UF, bio (mín. 20 caracteres) e foto de perfil.'
    );
  }

  document.getElementById('btn-toggle-personal')?.addEventListener('click', () => setPersonalEditMode(true));
  document.getElementById('btn-cancel-personal')?.addEventListener('click', () => {
    const inName = document.getElementById('perfil-input-name');
    const inPhone = document.getElementById('perfil-input-phone');
    const inCity = document.getElementById('perfil-input-city');
    const inState = document.getElementById('perfil-input-state');
    if (inName) inName.value = (merged.full_name || '').trim();
    if (inPhone) inPhone.value = (merged.phone || '').trim();
    if (inCity) inCity.value = (merged.cidade || '').trim();
    if (inState) inState.value = (merged.estado || '').trim();
    setPersonalEditMode(false);
  });

  document.getElementById('btn-save-personal')?.addEventListener('click', async () => {
    const inName = document.getElementById('perfil-input-name');
    const inPhone = document.getElementById('perfil-input-phone');
    const inCity = document.getElementById('perfil-input-city');
    const inState = document.getElementById('perfil-input-state');
    const full_name = (inName?.value || '').trim() || null;
    const phone = (inPhone?.value || '').trim() || null;
    const cidade = (inCity?.value || '').trim() || null;
    const estado = (inState?.value || '').trim().toUpperCase().slice(0, 2) || null;

    if (!full_name || full_name.length < 3) {
      toast('Indica o nome completo (mínimo 3 letras).');
      return;
    }
    const phoneDigits = (phone || '').replace(/\D/g, '');
    if (phoneDigits.length < 10) {
      toast('Telefone com DDD: mínimo 10 dígitos.');
      return;
    }
    if (!cidade || cidade.length < 2) {
      toast('Indica a cidade.');
      return;
    }
    if (!estado || estado.length !== 2) {
      toast('Indica o estado (UF com 2 letras, ex.: SP).');
      return;
    }

    const { error } = await supabase.from('profiles').update({ full_name, phone, cidade, estado }).eq('id', uid);
    if (error) {
      toast('Não foi possível guardar: ' + (error.message || ''));
      return;
    }
    merged = { ...merged, full_name: full_name || '', phone: phone || '', cidade: cidade || '', estado: estado || '' };
    renderProfile(merged, children || []);
    if (typeof AuraAuth !== 'undefined') {
      AuraAuth.saveProfile({
        nomeCompleto: full_name || '',
        phone: phone || '',
        cidade: cidade || '',
        estado: estado || '',
      });
    }
    setPersonalEditMode(false);
    toast('Dados guardados ✨');
  });

  document.getElementById('btn-toggle-bio')?.addEventListener('click', () => setBioEditMode(true));
  document.getElementById('btn-cancel-bio')?.addEventListener('click', () => {
    const inBio = document.getElementById('perfil-input-bio');
    if (inBio) inBio.value = (merged.bio || '').trim();
    setBioEditMode(false);
  });

  document.getElementById('btn-save-bio')?.addEventListener('click', async () => {
    const inBio = document.getElementById('perfil-input-bio');
    const bio = (inBio?.value || '').trim() || null;
    if (!bio || bio.length < 20) {
      toast('A bio deve ter pelo menos 20 caracteres (para a rede de apoio).');
      return;
    }
    const { error } = await supabase.from('profiles').update({ bio }).eq('id', uid);
    if (error) {
      const msg = error.message || '';
      toast(
        msg.includes('column') || error.code === '42703'
          ? 'Falta a coluna bio no Supabase — corre o SQL em supabase/COLE_CADASTRO_3_PASSOS.sql'
          : 'Não foi possível guardar: ' + msg
      );
      return;
    }
    merged = { ...merged, bio: bio || '' };
    renderProfile(merged, children || []);
    setBioEditMode(false);
    toast('Bio guardada ✨');
  });

  const avatarInput = document.getElementById('perfil-avatar-input');
  const btnAvatar = document.getElementById('btn-perfil-avatar-trigger');
  btnAvatar?.addEventListener('click', () => avatarInput?.click());
  avatarInput?.addEventListener('change', async () => {
    const file = avatarInput.files && avatarInput.files[0];
    avatarInput.value = '';
    if (!file) return;
    if (btnAvatar) {
      btnAvatar.disabled = true;
      btnAvatar.textContent = 'A enviar…';
    }
    try {
      const url = await uploadProfileAvatar(file, supabase, uid);
      if (!url) return;
      merged = { ...merged, avatar_url: url };
      renderProfile(merged, children || []);
      if (typeof AuraAuth !== 'undefined') {
        AuraAuth.saveProfile({ avatarUrl: url });
        AuraAuth.applyProfileToUI?.();
      }
      toast('Foto de perfil atualizada ✨');
    } finally {
      if (btnAvatar) {
        btnAvatar.disabled = false;
        btnAvatar.textContent = 'Carregar nova foto';
      }
    }
  });

  bindLogout(document.getElementById('btn-perfil-sair'));
})();
