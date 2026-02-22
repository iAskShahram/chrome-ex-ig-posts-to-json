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
});

function dedupeURLs(urls) {
  const seen = new Map();
  for (const url of urls) {
    const key = url.split("?")[0];
    if (!seen.has(key)) seen.set(key, url);
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
  const article = document.querySelector(
    'main[role="main"] > div:first-child > div:first-child',
  );
  if (!article) return null;

  let username = urlUsername || "";
  if (!username?.length) {
    const authorLink = article.querySelector("a._a6hd[href]");
    if (authorLink) {
      const m = authorLink
        .getAttribute("href")
        .match(/^\/([a-zA-Z0-9._]+)\/?$/);
      if (m) username = m[1];
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
