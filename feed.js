import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.1/+esm";

const FEED_BUCKET = "feed-images";

const el = {
  content: document.getElementById("post-content"),
  image: document.getElementById("post-image"),
  post: document.getElementById("btn-post"),
  status: document.getElementById("feed-status"),
  list: document.getElementById("feed-list"),
};

let supabase;
let userId;

function setStatus(msg) {
  if (el.status) el.status.textContent = msg || "";
}

function esc(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function render(posts) {
  if (!el.list) return;
  if (!posts.length) {
    el.list.innerHTML = '<article class="feed-post">Sem postagens ainda. Siga alguém no Explorar para preencher seu feed.</article>';
    return;
  }
  el.list.innerHTML = posts
    .map((p) => {
      const when = new Date(p.created_at).toLocaleString("pt-BR");
      const img = p.image_url ? `<img src="${esc(p.image_url)}" alt="Imagem da postagem" loading="lazy" />` : "";
      return `<article class="feed-post">
        <div class="feed-post__meta"><strong>${esc(p.author_name || "Usuária Aura")}</strong> · ${when}</div>
        <div>${esc(p.content)}</div>
        ${img}
      </article>`;
    })
    .join("");
}

async function uploadImage(file) {
  if (!file) return null;
  const ext = (file.type || "image/jpeg").includes("png") ? "png" : "jpg";
  const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage.from(FEED_BUCKET).upload(path, file, {
    upsert: false,
    contentType: file.type || "image/jpeg",
  });
  if (error) throw new Error(error.message || "Falha no upload");
  const { data } = supabase.storage.from(FEED_BUCKET).getPublicUrl(path);
  return data?.publicUrl || null;
}

async function loadFeed() {
  const { data, error } = await supabase.rpc("list_feed_posts");
  if (error) {
    setStatus("Ative a migration de Feed no Supabase.");
    return;
  }
  render(data || []);
}

async function createPost() {
  const content = (el.content?.value || "").trim();
  const file = el.image?.files?.[0] || null;
  if (!content) {
    setStatus("Escreva algo antes de publicar.");
    return;
  }
  el.post.disabled = true;
  setStatus("Publicando...");
  try {
    const image_url = await uploadImage(file);
    const { error } = await supabase.from("feed_posts").insert({
      author_id: userId,
      content,
      image_url,
    });
    if (error) throw new Error(error.message || "Não foi possível publicar");
    if (el.content) el.content.value = "";
    if (el.image) el.image.value = "";
    setStatus("Post publicado ✨");
    await loadFeed();
  } catch (err) {
    setStatus(err.message || "Falha ao publicar");
  } finally {
    el.post.disabled = false;
  }
}

async function init() {
  const ok = await window.__auraAuthReady;
  if (!ok) return;
  supabase =
    window.__auraSupabaseClient ||
    createClient(window.AURA_SUPABASE_URL, window.AURA_SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
  const { data } = await supabase.auth.getUser();
  userId = data?.user?.id;
  if (!userId) {
    setStatus("Sessão não encontrada.");
    return;
  }

  el.post?.addEventListener("click", createPost);
  await loadFeed();

  supabase
    .channel("feed-live")
    .on("postgres_changes", { event: "*", schema: "public", table: "feed_posts" }, loadFeed)
    .subscribe();
}

init();

