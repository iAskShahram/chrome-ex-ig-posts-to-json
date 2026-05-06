const statusEl = document.getElementById("status");
const statusTextEl = statusEl.querySelector(".status-text");
const successEl = document.getElementById("success");
const usernameEl = document.getElementById("username");
const countEl = document.getElementById("count");
const actionsEl = document.getElementById("actions");
const copyBtn = document.getElementById("copyBtn");
const downloadBtn = document.getElementById("downloadBtn");
const redoBtn = document.getElementById("redoBtn");
const toastEl = document.getElementById("toast");
const previewEl = document.getElementById("preview");
const storageListEl = document.getElementById("storage-list");
const storageItemsEl = document.getElementById("storage-items");
const storageEmptyEl = document.getElementById("storage-empty");
const backBtn = document.getElementById("backBtn");
const saveVideoBtn = document.getElementById("saveVideoBtn");
const clearBtn = document.getElementById("clearBtn");

let currentUsername = null;
let currentShortcode = null;
let currentPosts = [];

function mergeURLArrays(existing, incoming) {
  const seen = new Map();
  for (const url of existing) {
    const key = url.split("?")[0];
    if (!seen.has(key)) seen.set(key, url);
  }
  for (const url of incoming) {
    const key = url.split("?")[0];
    seen.set(key, url);
  }
  return [...seen.values()];
}

function mergePostArrays(existing, scraped) {
  const map = new Map(existing.map((p) => [p.shortcode, { ...p }]));
  for (const post of scraped) {
    const prev = map.get(post.shortcode);
    if (prev) {
      prev.imageURLs = mergeURLArrays(
        prev.imageURLs || [],
        post.imageURLs || [],
      );
      prev.videoURLs = mergeURLArrays(
        prev.videoURLs || [],
        post.videoURLs || [],
      );
      Object.assign(prev, {
        ...post,
        imageURLs: prev.imageURLs,
        videoURLs: prev.videoURLs,
      });
    } else {
      map.set(post.shortcode, { ...post });
    }
  }
  return [...map.values()];
}

function mergeSinglePost(existing, post) {
  const idx = existing.findIndex((p) => p.shortcode === post.shortcode);
  if (idx !== -1) {
    const prev = existing[idx];
    const merged = {
      ...prev,
      ...post,
      imageURLs: mergeURLArrays(prev.imageURLs || [], post.imageURLs || []),
      videoURLs: mergeURLArrays(prev.videoURLs || [], post.videoURLs || []),
    };
    existing[idx] = merged;
    return [...existing];
  }
  return [...existing, post];
}

async function persistAndShow(storageKey, posts, label, count) {
  await chrome.storage.local.set({ [storageKey]: posts });
  currentPosts = posts;
  showSuccess(label, count);
}

async function init() {
  statusEl.style.display = "flex";
  successEl.style.display = "none";
  actionsEl.style.display = "none";
  previewEl.style.display = "none";
  storageListEl.style.display = "none";
  clearBtn.style.display = "none";
  saveVideoBtn.style.display = "none";

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url?.includes("instagram.com")) {
    statusTextEl.textContent =
      "Open an Instagram profile to use this extension.";
    return;
  }

  const postInfo = extractPostInfo(tab.url);
  if (postInfo) {
    currentShortcode = postInfo.shortcode;
    statusTextEl.textContent = `Reading post ${postInfo.shortcode}...`;

    const apiFetch = new Promise((resolve) => {
      chrome.tabs.sendMessage(
        tab.id,
        { type: "FETCH_POST_INFO", shortcode: postInfo.shortcode },
        (post) => {
          if (chrome.runtime.lastError || !post) resolve(null);
          else resolve(post);
        },
      );
    });

    const domScrape = new Promise((resolve) => {
      chrome.tabs.sendMessage(
        tab.id,
        { type: "SCRAPE_SINGLE_POST" },
        (resp) => {
          if (chrome.runtime.lastError || !resp?.post) resolve(null);
          else resolve(resp.post);
        },
      );
    });

    const [apiPost, domPost] = await Promise.all([apiFetch, domScrape]);

    if (!apiPost) {
      statusTextEl.textContent =
        "Failed to read post. Log into Instagram and try again.";
      return;
    }

    let post = apiPost;
    if (domPost) {
      post = {
        ...apiPost,
        imageURLs: mergeURLArrays(apiPost.imageURLs || [], domPost.imageURLs || []),
        videoURLs: mergeURLArrays(apiPost.videoURLs || [], domPost.videoURLs || []),
      };
    }

    const username = post.username;
    if (!username) {
      statusTextEl.textContent =
        "Could not determine username. Log into Instagram and try again.";
      return;
    }
    currentUsername = username;
    const storageKey = `posts_${username}`;
    const existing =
      (await chrome.storage.local.get(storageKey))[storageKey] || [];
    const merged = mergeSinglePost(existing, post);
    const current =
      merged.find((p) => p.shortcode === postInfo.shortcode) || post;

    await chrome.storage.local.set({ [storageKey]: merged });
    currentPosts = [current];
    showSuccess(`@${username}`, "1 post");

    if (current.type === "reel" || (current.videoURLs && current.videoURLs.length > 0)) {
      saveVideoBtn.style.display = "";
    }
    return;
  }

  const username = extractUsername(tab.url);
  if (!username) {
    return showStorageList();
  }

  currentUsername = username;
  currentShortcode = null;
  statusTextEl.textContent = `Reading posts for @${username}...`;

  chrome.tabs.sendMessage(
    tab.id,
    { type: "SCRAPE_POSTS" },
    async (response) => {
      if (chrome.runtime.lastError || !response) {
        statusTextEl.textContent =
          "Failed to read posts. Refresh the page and try again.";
        return;
      }

      const scraped = response.posts || [];
      if (scraped.length === 0) {
        statusTextEl.textContent =
          "No posts found. Scroll the profile first, then try again.";
        return;
      }

      const storageKey = `posts_${username}`;
      const existing =
        (await chrome.storage.local.get(storageKey))[storageKey] || [];
      const merged = mergePostArrays(existing, scraped);

      await persistAndShow(
        storageKey,
        merged,
        `@${username}`,
        `${merged.length} posts`,
      );
    },
  );
}

async function showStorageList() {
  statusEl.style.display = "none";
  storageListEl.style.display = "flex";

  const all = await chrome.storage.local.get(null);
  const entries = Object.entries(all)
    .filter(([key]) => key.startsWith("posts_"))
    .map(([key, posts]) => ({
      username: key.replace("posts_", ""),
      count: Array.isArray(posts) ? posts.length : 0,
      posts,
    }))
    .sort((a, b) => b.count - a.count);

  if (entries.length === 0) {
    storageEmptyEl.style.display = "block";
    return;
  }

  storageItemsEl.innerHTML = "";
  for (const entry of entries) {
    const item = document.createElement("div");
    item.className = "storage-item";

    const info = document.createElement("div");
    info.className = "storage-item-info";
    const nameSpan = document.createElement("span");
    nameSpan.className = "storage-item-username";
    nameSpan.textContent = `@${entry.username}`;
    const countSpan = document.createElement("span");
    countSpan.className = "count";
    countSpan.textContent = `${entry.count} post${entry.count !== 1 ? "s" : ""}`;
    info.append(nameSpan, countSpan);
    info.addEventListener("click", () => viewStoredEntry(entry));

    const actions = document.createElement("div");
    actions.className = "storage-item-actions";

    const copyBtn = document.createElement("button");
    copyBtn.className = "btn btn-primary btn-sm";
    copyBtn.title = "Copy";
    copyBtn.innerHTML = '<span class="btn-icon">📋</span>';
    copyBtn.addEventListener("click", async () => {
      const json = JSON.stringify(entry.posts, null, 2);
      await navigator.clipboard.writeText(json);
      showToast("Copied!");
    });

    const dlBtn = document.createElement("button");
    dlBtn.className = "btn btn-secondary btn-sm";
    dlBtn.title = "Download";
    dlBtn.innerHTML = '<span class="btn-icon">⬇</span>';
    dlBtn.addEventListener("click", () => {
      const json = JSON.stringify(entry.posts, null, 2);
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${entry.username}_posts.json`;
      a.click();
      URL.revokeObjectURL(url);
    });

    const delBtn = document.createElement("button");
    delBtn.className = "btn btn-danger-ghost btn-sm";
    delBtn.title = "Delete";
    delBtn.innerHTML = '<span class="btn-icon">🗑</span>';
    delBtn.addEventListener("click", async () => {
      await chrome.storage.local.remove(`posts_${entry.username}`);
      showToast("Deleted");
      showStorageList();
    });

    actions.append(copyBtn, dlBtn, delBtn);
    item.append(info, actions);
    storageItemsEl.appendChild(item);
  }
}

function viewStoredEntry(entry) {
  storageListEl.style.display = "none";
  currentPosts = entry.posts;
  currentUsername = entry.username;
  currentShortcode = null;
  backBtn.style.display = "";
  redoBtn.style.display = "none";
  showSuccess(
    `@${entry.username}`,
    `${entry.count} post${entry.count !== 1 ? "s" : ""}`,
  );
}

function showSuccess(label, count) {
  statusEl.style.display = "none";
  successEl.style.display = "flex";
  usernameEl.textContent = label;
  countEl.textContent = count;
  actionsEl.style.display = "flex";
  previewEl.style.display = "block";
  previewEl.textContent = JSON.stringify(currentPosts, null, 2);
  clearBtn.style.display = "";
}

function extractPostInfo(url) {
  try {
    const path = new URL(url).pathname;
    const match = path.match(
      /^\/(?:([a-zA-Z0-9._]+)\/)?(p|reel)\/([A-Za-z0-9_-]+)/,
    );
    return match ? { username: match[1] || null, shortcode: match[3] } : null;
  } catch {
    return null;
  }
}

function extractUsername(url) {
  try {
    const path = new URL(url).pathname;
    const match = path.match(/^\/([a-zA-Z0-9._]+)(?:\/.*)?$/);
    if (!match) return null;
    const reserved = ["explore", "reels", "direct", "accounts", "stories", "p", "reel", "about", "legal", "api"];
    return reserved.includes(match[1]) ? null : match[1];
  } catch {
    return null;
  }
}

function showToast(text) {
  toastEl.textContent = text;
  toastEl.style.display = "block";
  setTimeout(() => (toastEl.style.display = "none"), 1500);
}

copyBtn.addEventListener("click", async () => {
  const json = JSON.stringify(currentPosts, null, 2);
  await navigator.clipboard.writeText(json);
  showToast("Copied!");
});

downloadBtn.addEventListener("click", () => {
  const json = JSON.stringify(currentPosts, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const filename = currentShortcode
    ? `${currentUsername || "instagram"}_${currentShortcode}.json`
    : `${currentUsername || "instagram"}_posts.json`;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
});

saveVideoBtn.addEventListener("click", async () => {
  if (!currentShortcode) return;

  const icon = saveVideoBtn.querySelector(".btn-icon");
  const label = saveVideoBtn.querySelector(".btn-label");
  saveVideoBtn.disabled = true;
  icon.textContent = "";
  label.textContent = "Downloading...";

  try {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    const apiResp = await chrome.tabs.sendMessage(tab.id, {
      type: "FETCH_POST_INFO",
      shortcode: currentShortcode,
    });

    const videoUrl = apiResp?.videoURLs?.[0];
    if (!videoUrl) throw new Error("No video URL");

    const resp = await fetch(videoUrl);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

    const blob = await resp.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = `${currentUsername || "instagram"}_${currentShortcode}.mp4`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);

    icon.textContent = "✓";
    label.textContent = "Saved!";
    setTimeout(() => {
      icon.textContent = "🎬";
      label.textContent = "Save Video";
      saveVideoBtn.disabled = false;
    }, 2000);
  } catch {
    showToast("Download failed — log into Instagram and try again");
    icon.textContent = "🎬";
    label.textContent = "Save Video";
    saveVideoBtn.disabled = false;
  }
});

redoBtn.addEventListener("click", init);

clearBtn.addEventListener("click", async () => {
  if (!currentUsername) return;
  const storageKey = `posts_${currentUsername}`;

  if (currentShortcode) {
    const existing =
      (await chrome.storage.local.get(storageKey))[storageKey] || [];
    const filtered = existing.filter((p) => p.shortcode !== currentShortcode);
    if (filtered.length > 0) {
      await chrome.storage.local.set({ [storageKey]: filtered });
    } else {
      await chrome.storage.local.remove(storageKey);
    }
    showToast("Post cleared");
  } else {
    await chrome.storage.local.remove(storageKey);
    showToast("Profile data cleared");
  }
  init();
});

backBtn.addEventListener("click", () => {
  successEl.style.display = "none";
  actionsEl.style.display = "none";
  previewEl.style.display = "none";
  backBtn.style.display = "none";
  redoBtn.style.display = "";
  showStorageList();
});

init();
