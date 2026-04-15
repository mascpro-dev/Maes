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
let lastPosts = [];

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

function commentCountLabel(n) {
  if (n === 0) return "Nenhum comentário";
  if (n === 1) return "1 comentário";
  return `${n} comentários`;
}

function formatComments(rows) {
  return (rows || [])
    .map((r) => {
      const when = new Date(r.created_at).toLocaleString("pt-BR", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      });
      return `<div class="feed-post__comment">
        <div class="feed-post__comment-head"><strong>${esc(r.author_name)}</strong> <span class="feed-post__comment-time">${esc(when)}</span></div>
        <p class="feed-post__comment-body">${esc(r.content)}</p>
      </div>`;
    })
    .join("");
}

async function fillCommentsForPost(postId) {
  const box = el.list?.querySelector(`[data-feed-comments="${postId}"]`);
  if (!box || box.dataset.loaded === "1") return;
  const { data, error } = await supabase.rpc("list_feed_post_comments", {
    p_post_id: postId,
  });
  if (error) {
    box.innerHTML = `<p class="feed-post__comment-err">Não foi possível carregar comentários. Executa o SQL <code>COLE_FEED_LIKES_COMMENTS.sql</code> no Supabase.</p>`;
    box.dataset.loaded = "1";
    return;
  }
  box.innerHTML = data?.length ? formatComments(data) : "";
  box.dataset.loaded = "1";
}

async function primeSingleComments(posts) {
  const singles = posts.filter((p) => (p.comment_count ?? 0) === 1);
  await Promise.all(singles.map((p) => fillCommentsForPost(p.id)));
}

function render(posts) {
  if (!el.list) return;
  lastPosts = posts || [];
  if (!lastPosts.length) {
    el.list.innerHTML =
      '<article class="feed-post">Sem postagens ainda. Siga alguém no Explorar para preencher seu feed.</article>';
    return;
  }
  el.list.innerHTML = lastPosts
    .map((p) => {
      const when = new Date(p.created_at).toLocaleString("pt-BR");
      const img = p.image_url
        ? `<img src="${esc(p.image_url)}" alt="Imagem da postagem" loading="lazy" />`
        : "";
      const likes = p.like_count ?? 0;
      const nCom = p.comment_count ?? 0;
      const liked = !!p.liked_by_me;
      const moreThanOne = nCom > 1;
      const commentsBlockHidden = moreThanOne ? "hidden" : "";
      const trigger =
        moreThanOne
          ? `<button type="button" class="feed-post__comments-trigger" data-toggle-comments="${p.id}" aria-expanded="false" aria-controls="feed-comments-${p.id}">${commentCountLabel(nCom)}</button>`
          : `<span class="feed-post__comments-label">${commentCountLabel(nCom)}</span>`;
      return `<article class="feed-post" data-post-id="${p.id}">
        <div class="feed-post__meta"><strong>${esc(p.author_name || "Participante")}</strong> · ${when}</div>
        <div class="feed-post__body">${esc(p.content)}</div>
        ${img}
        <div class="feed-post__actions" role="group" aria-label="Interações">
          <button type="button" class="feed-post__like${liked ? " feed-post__like--on" : ""}" data-like-post="${p.id}" aria-pressed="${liked ? "true" : "false"}" aria-label="${liked ? "Descurtir" : "Curtir"}">
            <span class="feed-post__like-icon" aria-hidden="true">♥</span>
            <span class="feed-post__like-num">${likes}</span>
          </button>
          <span class="feed-post__actions-sep" aria-hidden="true">·</span>
          ${trigger}
        </div>
        <div class="feed-post__comments-wrap" id="feed-comments-${p.id}" data-feed-comments="${p.id}" ${commentsBlockHidden}>
          ${nCom === 1 ? '<p class="feed-post__comments-loading" aria-hidden="true">…</p>' : ""}
        </div>
        <form class="feed-post__comment-form" data-comment-form="${p.id}" action="javascript:void(0)">
          <label class="visually-hidden" for="feed-comment-${p.id}">Comentar nesta publicação</label>
          <input type="text" id="feed-comment-${p.id}" class="feed-post__comment-input" maxlength="2000" placeholder="Escrever um comentário…" autocomplete="off" />
          <button type="submit" class="feed-post__comment-send">Enviar</button>
        </form>
      </article>`;
    })
    .join("");
}

function bindFeedListEvents() {
  if (!el.list || el.list.dataset.feedBound === "1") return;
  el.list.dataset.feedBound = "1";

  el.list.addEventListener("click", async (e) => {
    const trig = e.target.closest("[data-toggle-comments]");
    if (trig) {
      const id = trig.getAttribute("data-toggle-comments");
      const wrap = el.list.querySelector(`[data-feed-comments="${id}"]`);
      if (!wrap) return;
      const expanded = trig.getAttribute("aria-expanded") === "true";
      if (!expanded) {
        await fillCommentsForPost(id);
        wrap.hidden = false;
        trig.setAttribute("aria-expanded", "true");
      } else {
        wrap.hidden = true;
        trig.setAttribute("aria-expanded", "false");
      }
      return;
    }

    const likeBtn = e.target.closest("[data-like-post]");
    if (likeBtn) {
      const postId = likeBtn.getAttribute("data-like-post");
      if (!postId || likeBtn.disabled) return;
      likeBtn.disabled = true;
      const post = lastPosts.find((x) => x.id === postId);
      const liked = !!post?.liked_by_me;
      try {
        if (liked) {
          const { error } = await supabase
            .from("feed_post_likes")
            .delete()
            .eq("post_id", postId)
            .eq("user_id", userId);
          if (error) throw error;
        } else {
          const { error } = await supabase.from("feed_post_likes").insert({
            post_id: postId,
            user_id: userId,
          });
          if (error) throw error;
        }
        await loadFeed();
      } catch (err) {
        setStatus(err.message || "Não foi possível atualizar a curtida.");
      } finally {
        likeBtn.disabled = false;
      }
    }
  });

  el.list.addEventListener("submit", async (e) => {
    const form = e.target.closest("[data-comment-form]");
    if (!form) return;
    e.preventDefault();
    const postId = form.getAttribute("data-comment-form");
    const input = form.querySelector(".feed-post__comment-input");
    const text = (input?.value || "").trim();
    if (!postId || !text) return;
    const btn = form.querySelector(".feed-post__comment-send");
    if (btn) btn.disabled = true;
    const { error } = await supabase.from("feed_post_comments").insert({
      post_id: postId,
      author_id: userId,
      content: text,
    });
    if (btn) btn.disabled = false;
    if (error) {
      setStatus(error.message || "Não foi possível comentar.");
      return;
    }
    if (input) input.value = "";
    setStatus("");
    await loadFeed();
  });
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
    setStatus(
      error.message?.includes("list_feed_posts") || error.code === "PGRST202"
        ? "Atualiza o feed no Supabase: executa supabase/COLE_FEED_LIKES_COMMENTS.sql (curtidas e comentários)."
        : "Ative a migration de Feed no Supabase."
    );
    return;
  }
  render(data || []);
  bindFeedListEvents();
  await primeSingleComments(data || []);
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

  const ch = supabase.channel("feed-live");
  ch.on("postgres_changes", { event: "*", schema: "public", table: "feed_posts" }, () => {
    loadFeed();
  });
  ch.on("postgres_changes", { event: "*", schema: "public", table: "feed_post_likes" }, () => {
    loadFeed();
  });
  ch.on("postgres_changes", { event: "*", schema: "public", table: "feed_post_comments" }, () => {
    loadFeed();
  });
  ch.subscribe();
}

init();
