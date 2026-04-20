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
/** @type {{ id: string, full_name: string }[]} */
let mentionList = [];

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

function escapeRe(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const MPH = "\uE000";
const MPT = "\uE001";

/**
 * Transforma @nome completo (igual ao perfil) em link. Só resolve mães em `mentionList`.
 */
function linkifyAtsToHtml(raw, list) {
  if (raw == null || raw === "") return "";
  const byId = new Map();
  (list || []).forEach((u) => {
    if (u?.id && u?.full_name?.trim()) byId.set(u.id, { id: u.id, full_name: u.full_name.trim() });
  });
  const sorted = [...byId.values()].sort((a, b) => b.full_name.length - a.full_name.length);
  let t = String(raw);
  for (const u of sorted) {
    const re = new RegExp("@" + escapeRe(u.full_name) + "(?=\\s|[.,;:!?]|$)", "gi");
    t = t.replace(re, () => MPH + u.id + MPT);
  }
  t = esc(t);
  return t.replace(
    new RegExp(escapeRe(MPH) + "([0-9a-f-]{36})" + escapeRe(MPT), "g"),
    (_m, id) => {
      const p = byId.get(id);
      if (!p) return _m;
      return `<a class="feed-mention" href="perfil-usuario.html?id=${id}">@${esc(p.full_name)}</a>`;
    }
  );
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
      const bodyHtml = linkifyAtsToHtml(r.content, mentionList);
      return `<div class="feed-post__comment">
        <div class="feed-post__comment-head"><strong>${esc(r.author_name)}</strong> <span class="feed-post__comment-time">${esc(when)}</span></div>
        <p class="feed-post__comment-body">${bodyHtml}</p>
      </div>`;
    })
    .join("");
}

async function loadMentionList() {
  mentionList = [];
  if (!supabase || !userId) return;
  const { data: me } = await supabase
    .from("profiles")
    .select("id, full_name")
    .eq("id", userId)
    .maybeSingle();
  if (me?.id && (me.full_name || "").trim().length >= 2) {
    mentionList.push({ id: me.id, full_name: (me.full_name || "").trim() });
  }

  const { data: fr } = await supabase.from("follows").select("following_id").eq("follower_id", userId);
  const ids = (fr || []).map((r) => r.following_id).filter(Boolean);
  if (!ids.length) return;
  const { data: pr } = await supabase.from("profiles").select("id, full_name").in("id", ids);
  const seen = new Set(mentionList.map((m) => m.id));
  (pr || []).forEach((p) => {
    if (p.id && p.full_name?.trim() && !seen.has(p.id)) {
      seen.add(p.id);
      mentionList.push({ id: p.id, full_name: p.full_name.trim() });
    }
  });
}

function rpcFunctionMissing(err) {
  return (
    !!err &&
    ((err.message && err.message.includes("Could not find the function")) || err.code === "PGRST202")
  );
}

function formatSupabaseErr(err) {
  if (!err) return "Erro desconhecido.";
  const parts = [err.message, err.details, err.hint].filter(Boolean);
  return parts.join(" — ") || String(err);
}

/**
 * Se o RPC list_feed_posts no projeto ainda for antigo (sem contagens), calcula no cliente.
 */
async function augmentPostsWithInteractionCounts(rows) {
  if (!rows?.length) return rows;
  const r0 = rows[0];
  if (
    r0 &&
    typeof r0.like_count === "number" &&
    typeof r0.comment_count === "number" &&
    typeof r0.liked_by_me === "boolean"
  ) {
    return rows;
  }

  const ids = rows.map((r) => r.id).filter(Boolean);
  if (!ids.length) return rows;

  const [{ data: likes, error: eL }, { data: comments, error: eC }] = await Promise.all([
    supabase.from("feed_post_likes").select("post_id,user_id").in("post_id", ids),
    supabase.from("feed_post_comments").select("post_id").in("post_id", ids),
  ]);
  if (eL || eC) {
    console.warn("[feed] Não foi possível ler curtidas/comentários (tabelas ou RLS):", eL || eC);
    return rows.map((p) => ({
      ...p,
      like_count: typeof p.like_count === "number" ? p.like_count : 0,
      comment_count: typeof p.comment_count === "number" ? p.comment_count : 0,
      liked_by_me: !!p.liked_by_me,
    }));
  }

  const likeAgg = {};
  for (const l of likes || []) {
    if (!likeAgg[l.post_id]) likeAgg[l.post_id] = { n: 0, me: false };
    likeAgg[l.post_id].n += 1;
    if (l.user_id === userId) likeAgg[l.post_id].me = true;
  }
  const comAgg = {};
  for (const c of comments || []) {
    comAgg[c.post_id] = (comAgg[c.post_id] || 0) + 1;
  }

  return rows.map((p) => ({
    ...p,
    like_count: typeof p.like_count === "number" ? p.like_count : likeAgg[p.id]?.n ?? 0,
    comment_count: typeof p.comment_count === "number" ? p.comment_count : comAgg[p.id] ?? 0,
    liked_by_me: typeof p.liked_by_me === "boolean" ? p.liked_by_me : !!likeAgg[p.id]?.me,
  }));
}

async function fillCommentsForPost(postId) {
  const box = el.list?.querySelector(`[data-feed-comments="${postId}"]`);
  if (!box || box.dataset.loaded === "1") return;
  const { data, error } = await supabase.rpc("list_feed_post_comments", {
    p_post_id: postId,
  });
  if (error) {
    box.innerHTML = `<p class="feed-post__comment-err">Não foi possível carregar comentários. Executa no Supabase: <code>COLE_FEED_LIKES_COMMENTS.sql</code> (tabelas) e <code>COLE_FEED_INTERACTION_RPCS.sql</code> (permissões).</p>`;
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
      const bodyHtml = linkifyAtsToHtml(p.content, mentionList);
      return `<article class="feed-post" data-post-id="${p.id}">
        <div class="feed-post__meta"><strong>${esc(p.author_name || "Participante")}</strong> · ${when}</div>
        <div class="feed-post__body">${bodyHtml}</div>
        ${img}
        <div class="feed-post__actions" role="group" aria-label="Interações">
          <button type="button" class="feed-post__like${liked ? " feed-post__like--on" : ""}" data-like-post="${p.id}" aria-pressed="${liked ? "true" : "false"}" title="Curtir" aria-label="${liked ? "Descurtir" : "Curtir"}">
            <span class="feed-post__like-icon" aria-hidden="true">♥</span>
            <span class="feed-post__like-num">${likes}</span>
          </button>
          <span class="feed-post__actions-sep" aria-hidden="true">·</span>
          ${trigger}
        </div>
        <div class="feed-post__comments-wrap" id="feed-comments-${p.id}" data-feed-comments="${p.id}" ${commentsBlockHidden}>
          ${nCom === 1 ? '<p class="feed-post__comments-loading" aria-hidden="true">…</p>' : ""}
        </div>
        <form class="feed-post__comment-form" data-comment-form="${p.id}" novalidate>
          <label class="visually-hidden" for="feed-comment-${p.id}">Comentar nesta publicação</label>
          <input type="text" id="feed-comment-${p.id}" class="feed-post__comment-input" maxlength="2000" placeholder="Comentar… (use @ e o nome de quem segue)" autocomplete="off" name="c" />
          <button type="button" class="feed-post__comment-send" data-comment-send="${p.id}">Enviar</button>
        </form>
      </article>`;
    })
    .join("");
}

/** Submete comentário: REST primeiro (mais fiável), depois RPC. */
async function sendCommentForPost(postId) {
  const form = el.list?.querySelector(`[data-comment-form="${postId}"]`);
  const input = form?.querySelector?.(".feed-post__comment-input");
  const text = (input?.value || "").trim();
  if (!postId || !text) return;
  const btn = form?.querySelector?.("[data-comment-send]");
  if (btn) btn.disabled = true;

  let r = await supabase.from("feed_post_comments").insert({
    post_id: postId,
    author_id: userId,
    content: text,
  });
  let error = r.error;
  if (error) {
    console.warn("[feed] insert comentário (REST):", error);
    const rpc = await supabase.rpc("add_feed_post_comment", {
      p_post_id: postId,
      p_content: text,
    });
    error = rpc.error;
    if (error) console.warn("[feed] add_feed_post_comment (RPC):", error);
  }
  if (btn) btn.disabled = false;
  if (error) {
    setStatus(
      formatSupabaseErr(error) +
        " — Confirma no Supabase: tabelas feed_post_comments + COLE_FEED_INTERACTION_RPCS.sql."
    );
    return;
  }
  if (input) input.value = "";
  setStatus("");
  const wrap = el.list?.querySelector(`[data-feed-comments="${postId}"]`);
  if (wrap) {
    wrap.removeAttribute("data-loaded");
    wrap.innerHTML = "";
  }
  await loadFeed();
}

/** Curtir / descurtir: REST primeiro, depois RPC (evita falha quando só uma das vias está aplicada). */
async function toggleLike(postId) {
  if (!postId) return;
  const likeBtn = el.list?.querySelector(`[data-like-post="${postId}"]`);
  if (likeBtn) likeBtn.disabled = true;

  const post = lastPosts.find((x) => x.id === postId);
  const liked = !!post?.liked_by_me;

  let err = null;
  if (liked) {
    const r = await supabase
      .from("feed_post_likes")
      .delete()
      .eq("post_id", postId)
      .eq("user_id", userId);
    err = r.error;
  } else {
    const r = await supabase.from("feed_post_likes").insert({
      post_id: postId,
      user_id: userId,
    });
    err = r.error;
    if (err?.code === "23505") err = null;
  }

  if (err) {
    console.warn("[feed] toggle like (REST):", err);
    const rpc = await supabase.rpc("toggle_feed_post_like", { p_post_id: postId });
    err = rpc.error;
    if (err) console.warn("[feed] toggle_feed_post_like (RPC):", err);
  }

  if (likeBtn) likeBtn.disabled = false;

  if (err) {
    setStatus(
      formatSupabaseErr(err) +
        " — No Supabase: executa COLE_FEED_LIKES_COMMENTS.sql (tabelas + list_feed_posts) e COLE_FEED_INTERACTION_RPCS.sql."
    );
    return;
  }
  await loadFeed();
}

/**
 * Ouvintes de delegação: chamado uma única vez no init (não após re-render, para o fragmento nunca perder a referência do contentor).
 */
function wireFeedListInteractions() {
  if (!el.list || el.list._feedWired) return;
  el.list._feedWired = true;

  el.list.addEventListener("click", async (e) => {
    const sendBtn = e.target.closest("[data-comment-send]");
    if (sendBtn) {
      e.preventDefault();
      const id = sendBtn.getAttribute("data-comment-send");
      if (id) await sendCommentForPost(id);
      return;
    }

    const trig = e.target.closest("[data-toggle-comments]");
    if (trig) {
      const id = trig.getAttribute("data-toggle-comments");
      const wrap = el.list.querySelector(`[data-feed-comments="${id}"]`);
      if (!id || !wrap) return;
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
      e.preventDefault();
      const postId = likeBtn.getAttribute("data-like-post");
      if (postId && !likeBtn.disabled) await toggleLike(postId);
    }
  });

  el.list.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" || e.shiftKey) return;
    const inp = e.target && e.target.closest && e.target.closest(".feed-post__comment-input");
    if (!inp) return;
    e.preventDefault();
    const form = inp.closest("[data-comment-form]");
    const id = form && form.getAttribute("data-comment-form");
    if (id) void sendCommentForPost(id);
  });

  el.list.addEventListener("submit", (e) => {
    const form = e.target;
    if (!form || !form.matches || !form.matches(".feed-post__comment-form")) return;
    e.preventDefault();
    const id = form.getAttribute("data-comment-form");
    if (id) void sendCommentForPost(id);
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
        ? "Atualiza o feed: executa supabase/COLE_FEED_LIKES_COMMENTS.sql (e RPC de interação se ainda não aplicou)."
        : formatSupabaseErr(error)
    );
    return;
  }
  const rows = await augmentPostsWithInteractionCounts(data || []);
  await loadMentionList();
  render(rows);
  await primeSingleComments(rows);
}

async function createPost() {
  const content = (el.content?.value || "").trim();
  const file = el.image?.files?.[0] || null;
  if (!content) {
    setStatus("Escreva algo antes de publicar.");
    return;
  }
  el.post.disabled = true;
  setStatus("Publicando…");
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
    setStatus("Post publicado.");
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

  wireFeedListInteractions();
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
