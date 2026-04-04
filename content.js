chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "SCRAPE_POSTS") {
    const posts = scrapePosts();
    sendResponse({ posts });
    return true;
  }
  if (msg.type === "SCRAPE_SINGLE_POST") {
    const post = scrapeSinglePost();
    sendResponse({ post });
    return true;
  }
  if (msg.type === "FETCH_POST_INFO") {
    fetchPostInfo(msg.shortcode).then((info) => {
      sendResponse(info);
    });
    return true;
  }
});

function shortcodeToId(shortcode) {
  const alphabet =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  let id = BigInt(0);
  for (const char of shortcode) {
    id = id * BigInt(64) + BigInt(alphabet.indexOf(char));
  }
  return id.toString();
}

async function fetchPostInfo(shortcode) {
  try {
    const postId = shortcodeToId(shortcode);
    const resp = await fetch(`/api/v1/media/${postId}/info/`, {
      headers: {
        "X-IG-App-ID": "936619743392459",
        "X-Requested-With": "XMLHttpRequest",
      },
      credentials: "include",
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    const items = data.items || [];
    if (items.length === 0) return null;
    const item = items[0];
    const username = item.user?.username || "";
    const caption = item.caption?.text || "";
    const timestamp = item.taken_at
      ? new Date(item.taken_at * 1000).toISOString()
      : "";
    const isVideo = item.media_type === 2;
    const videoVersions = item.video_versions || [];
    const bestVideo = videoVersions.length > 0
      ? videoVersions.reduce((a, b) => (a.width > b.width ? a : b))
      : null;
    const imageVersions = item.image_versions2?.candidates || [];
    const bestImage = imageVersions.length > 0
      ? imageVersions.reduce((a, b) => (a.width > b.width ? a : b))
      : null;
    return {
      username,
      shortcode,
      caption,
      timestamp,
      type: isVideo ? "reel" : "post",
      postUrl: `https://www.instagram.com/reel/${shortcode}/`,
      imageURLs: bestImage ? [bestImage.url] : [],
      videoURLs: bestVideo ? [bestVideo.url] : [],
    };
  } catch {
    return null;
  }
}

function dedupeURLs(urls) {
  const seen = new Map();
  for (const url of urls) {
    const key = url.split("?")[0];
    seen.set(key, url);
  }
  return [...seen.values()];
}

function scrapePosts() {
  const pathMatch = window.location.pathname.match(/^\/([a-zA-Z0-9._]+)/);
  const username = pathMatch ? pathMatch[1] : "";

  const links = document.querySelectorAll('a[role="link"]');
  const seen = new Set();
  const posts = [];

  for (const link of links) {
    const href = link.getAttribute("href");
    if (!href) continue;

    const match = href.match(/\/(p|reel)\/([A-Za-z0-9_-]+)/);
    if (!match) continue;

    const [, kind, shortcode] = match;
    if (seen.has(shortcode)) continue;
    seen.add(shortcode);

    const imgs = link.querySelectorAll("img");
    const imageURLs = dedupeURLs(
      Array.from(imgs)
        .map((img) => img.getAttribute("src"))
        .filter(Boolean),
    );

    const caption = imgs[0]?.getAttribute("alt") || "";

    posts.push({
      caption,
      username,
      shortcode,
      type: kind === "reel" ? "reel" : "post",
      postUrl: `https://www.instagram.com/p/${shortcode}/`,
      imageURLs,
      videoURLs: [],
      timestamp: "",
    });
  }

  return posts;
}

function scrapeSinglePost() {
  const path = window.location.pathname;
  const pathMatch = path.match(
    /^\/(?:([a-zA-Z0-9._]+)\/)?(p|reel)\/([A-Za-z0-9_-]+)/,
  );
  if (!pathMatch) return null;

  const [, urlUsername, kind, shortcode] = pathMatch;
  const article =
    document.querySelector('main[role="main"] > div:first-child > div:first-child') ||
    document.querySelector('article[role="presentation"]') ||
    document.querySelector("article");
  if (!article) return null;

  let username = urlUsername || "";
  if (!username?.length) {
    const links = article.querySelectorAll("a[href]");
    for (const link of links) {
      const href = link.getAttribute("href");
      const m = href?.match(/^\/([a-zA-Z0-9._]+)\/?$/);
      if (m && link.textContent?.trim() === m[1]) {
        username = m[1];
        break;
      }
    }
  }

  const imageEls = article.querySelectorAll("._aagu ._aagv img");
  const imageURLs = dedupeURLs(
    Array.from(imageEls)
      .map((img) => img.getAttribute("src"))
      .filter(Boolean),
  );

  const videoEls = article.querySelectorAll("._aagu ._aagv video");
  const videoURLs = dedupeURLs(
    Array.from(videoEls)
      .map((v) => v.getAttribute("src"))
      .filter(Boolean),
  );

  const caption =
    article.querySelector("span.x126k92a")?.textContent?.trim() || "";

  const timeEl = article.querySelector("time.x1p4m5qa[datetime]");
  const timestamp = timeEl?.getAttribute("datetime") || "";

  return {
    caption,
    username,
    shortcode,
    type: kind === "reel" ? "reel" : "post",
    postUrl: `https://www.instagram.com/p/${shortcode}/`,
    imageURLs,
    videoURLs,
    timestamp,
  };
}
