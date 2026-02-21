chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'SCRAPE_POSTS') {
    const posts = scrapePosts();
    sendResponse({ posts });
    return true;
  }
});

function scrapePosts() {
  const links = document.querySelectorAll('a[role="link"]');
  const seen = new Set();
  const posts = [];

  for (const link of links) {
    const href = link.getAttribute('href');
    if (!href) continue;

    const match = href.match(/\/(p|reel)\/([A-Za-z0-9_-]+)/);
    if (!match) continue;

    const [, kind, shortcode] = match;
    if (seen.has(shortcode)) continue;
    seen.add(shortcode);

    const img = link.querySelector('img');
    const imageUrl = img?.getAttribute('src') || '';
    const caption = img?.getAttribute('alt') || '';

    posts.push({
      shortcode,
      postUrl: `https://www.instagram.com/p/${shortcode}/`,
      type: kind === 'reel' ? 'reel' : 'post',
      imageUrl,
      caption,
    });
  }

  return posts;
}
