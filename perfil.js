/**
 * /perfil — dados de profiles + children (RLS).
 */
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.1/+esm';

const DIAG_LABELS = {
  tea: 'TEA',
  tdah: 'TDAH',
  down: 'S. Down',
  pc: 'Paralisia cerebral',
  rara: 'Doença rara',
  investigacao: 'Em investigação',
};

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

function renderProfile(profile, children) {
  const loading = document.getElementById('perfil-loading');
  const content = document.getElementById('perfil-content');
  if (loading) loading.hidden = true;
  if (content) content.hidden = false;

  const nome = (profile?.full_name || '').trim() || 'Mãe Aura';
  const email = (profile?.email || '').trim();

  const nameEl = document.getElementById('perfil-name');
  const emailEl = document.getElementById('perfil-email');
  const bioEl = document.getElementById('perfil-bio-text');
  const imgEl = document.getElementById('perfil-avatar-img');
  const initialsEl = document.getElementById('perfil-avatar-initials');

  if (nameEl) nameEl.textContent = nome;
  if (emailEl) emailEl.textContent = email || '—';

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

  if (bioEl) {
    const bio = (profile?.bio || '').trim();
    if (bio) {
      bioEl.textContent = bio;
      bioEl.classList.remove('perfil-bio__empty');
    } else {
      bioEl.textContent = 'Ainda não há bio — em breve poderás editar aqui.';
      bioEl.classList.add('perfil-bio__empty');
    }
  }

  const listEl = document.getElementById('perfil-children-list');
  if (!listEl) return;

  listEl.innerHTML = '';
  const kids = Array.isArray(children) ? children : [];

  if (!kids.length) {
    const p = document.createElement('p');
    p.className = 'perfil-empty-kids';
    p.textContent = 'Nenhum filho registado ainda. Completa o cadastro (passo 2) para aparecer aqui.';
    listEl.appendChild(p);
    return;
  }

  kids.forEach((c) => {
    const card = document.createElement('article');
    card.className = 'perfil-child-card';
    const n = (c.nome || '').trim() || 'Criança';
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
      .select('full_name, email, avatar_url, bio')
      .eq('id', uid)
      .maybeSingle(),
    supabase
      .from('children')
      .select('nome, data_nascimento, diagnosticos, created_at')
      .eq('user_id', uid)
      .order('created_at', { ascending: true }),
  ]);

  if (pErr) console.warn('[Aura] perfil profiles:', pErr.message);
  if (cErr) console.warn('[Aura] perfil children:', cErr.message);

  const merged = {
    ...(profile || {}),
    email: profile?.email || session.user.email || '',
  };

  renderProfile(merged, children || []);

  const btn = document.getElementById('btn-perfil-sair');
  if (btn && typeof AuraAuth !== 'undefined') {
    btn.addEventListener('click', () => {
      if (navigator.vibrate) navigator.vibrate(25);
      AuraAuth.logout();
    });
  }
})();
