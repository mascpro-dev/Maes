/**
 * Perfil público de outra usuária (leitura + seguir + atalho mensagens).
 * Requer RPC get_public_profile no Supabase (supabase/COLE_GET_PUBLIC_PROFILE.sql).
 */
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.1/+esm";

const DX_LABEL = {
  tea: "TEA",
  tdah: "TDAH",
  down: "Síndrome de Down",
  pc: "Paralisia cerebral",
  rara: "Condição rara",
  investigacao: "Em investigação",
};

function isUuid(s) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(s || "").trim()
  );
}

function initials(name) {
  if (!name || !String(name).trim()) return "…";
  const p = String(name).trim().split(/\s+/).filter(Boolean);
  if (p.length === 1) return p[0].slice(0, 2).toUpperCase();
  return (p[0][0] + p[p.length - 1][0]).toUpperCase();
}

function esc(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function safeUrl(u) {
  const s = String(u || "").trim();
  if (!/^https?:\/\//i.test(s)) return "";
  return s.replace(/"/g, "%22");
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

async function loadFollowingState(supabase, meId, targetId) {
  const { data, error } = await supabase
    .from("follows")
    .select("following_id")
    .eq("follower_id", meId)
    .eq("following_id", targetId)
    .maybeSingle();
  if (error) return false;
  return !!data;
}

function renderProfile(container, profile, following) {
  const name = (profile.full_name || "").trim() || "Mãe Aura";
  const url = safeUrl(profile.avatar_url);
  const dx = DX_LABEL[profile.diagnostico] || profile.diagnostico || "—";
  const local = [profile.cidade, profile.estado].filter(Boolean).join(" · ");
  const bio = (profile.bio || "").trim();

  const avatar = url
    ? `<img class="pu-avatar" src="${esc(url)}" alt="" width="88" height="88" />`
    : `<div class="pu-avatar pu-avatar--initials" aria-hidden="true">${esc(initials(name))}</div>`;

  container.innerHTML = `
    <div class="pu-hero">
      ${avatar}
      <div>
        <h2 class="pu-name">${esc(name)}</h2>
        <div class="pu-meta">
          <span class="pu-pill">${esc(dx)}</span>
          ${local ? `<span>${esc(local)}</span>` : ""}
        </div>
      </div>
    </div>
    ${bio ? `<p class="pu-bio">${esc(bio)}</p>` : `<p class="pu-bio" style="color:#9a9188;font-style:italic">Sem bio pública.</p>`}
    <div class="pu-actions">
      <button type="button" class="pu-btn pu-btn--outline ${following ? "pu-btn--active" : ""}" id="pu-btn-follow">
        ${following ? "Seguindo" : "Seguir"}
      </button>
      <a class="pu-btn pu-btn--primary" href="mensagens.html?user=${encodeURIComponent(profile.id)}" style="text-align:center;text-decoration:none;display:inline-flex;align-items:center;justify-content:center;">Mensagem</a>
    </div>
  `;
}

async function main() {
  const params = new URLSearchParams(window.location.search);
  const targetId = params.get("id");
  const loading = document.getElementById("pu-loading");
  const errEl = document.getElementById("pu-error");
  const content = document.getElementById("pu-content");

  if (!targetId || !isUuid(targetId)) {
    if (loading) loading.hidden = true;
    if (errEl) {
      errEl.hidden = false;
      errEl.textContent = "Link inválido. Volta ao Explorar.";
    }
    return;
  }

  const supabase = await getClient();
  if (!supabase) {
    if (loading) loading.hidden = true;
    if (errEl) {
      errEl.hidden = false;
      errEl.textContent = "Sessão não disponível.";
    }
    return;
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const meId = user?.id;
  if (!meId) {
    window.location.replace("login.html");
    return;
  }
  if (meId === targetId) {
    window.location.replace("perfil.html");
    return;
  }

  const { data: rows, error: rpcErr } = await supabase.rpc("get_public_profile", {
    p_target_id: targetId,
  });

  if (rpcErr) {
    if (loading) loading.hidden = true;
    if (errEl) {
      errEl.hidden = false;
      errEl.innerHTML =
        "Não foi possível carregar este perfil. Executa no Supabase o ficheiro <code>supabase/COLE_GET_PUBLIC_PROFILE.sql</code>.";
    }
    return;
  }

  let profile = null;
  if (Array.isArray(rows)) profile = rows[0];
  else if (rows && typeof rows === "object") profile = rows;
  if (!profile || !profile.id) {
    if (loading) loading.hidden = true;
    if (errEl) {
      errEl.hidden = false;
      errEl.textContent = "Perfil não encontrado.";
    }
    return;
  }

  let following = await loadFollowingState(supabase, meId, targetId);
  if (loading) loading.hidden = true;
  if (content) {
    content.hidden = false;
    renderProfile(content, profile, following);

    const btn = document.getElementById("pu-btn-follow");
    btn?.addEventListener("click", async () => {
      btn.disabled = true;
      if (following) {
        const { error } = await supabase
          .from("follows")
          .delete()
          .eq("follower_id", meId)
          .eq("following_id", targetId);
        if (!error) following = false;
      } else {
        const { error } = await supabase.from("follows").insert({
          follower_id: meId,
          following_id: targetId,
        });
        if (!error) following = true;
      }
      btn.disabled = false;
      btn.textContent = following ? "Seguindo" : "Seguir";
      btn.classList.toggle("pu-btn--active", following);
    });
  }
}

main();
