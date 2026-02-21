const statusEl = document.getElementById('status');
const statusTextEl = statusEl.querySelector('.status-text');
const successEl = document.getElementById('success');
const usernameEl = document.getElementById('username');
const countEl = document.getElementById('count');
const actionsEl = document.getElementById('actions');
const copyBtn = document.getElementById('copyBtn');
const downloadBtn = document.getElementById('downloadBtn');
const redoBtn = document.getElementById('redoBtn');
const toastEl = document.getElementById('toast');
const previewEl = document.getElementById('preview');

let currentUsername = null;
let currentPosts = [];

async function init() {
  statusEl.style.display = 'flex';
  successEl.style.display = 'none';
  actionsEl.style.display = 'none';
  previewEl.style.display = 'none';

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url?.includes('instagram.com')) {
    statusTextEl.textContent = 'Open an Instagram profile to use this extension.';
    return;
  }

  const username = extractUsername(tab.url);
  if (!username) {
    statusTextEl.textContent = 'Navigate to an Instagram profile page.';
    return;
  }

  currentUsername = username;
  statusTextEl.textContent = `Reading posts for @${username}...`;

  chrome.tabs.sendMessage(tab.id, { type: 'SCRAPE_POSTS' }, (response) => {
    if (chrome.runtime.lastError || !response) {
      statusTextEl.textContent = 'Failed to read posts. Refresh the page and try again.';
      return;
    }

    currentPosts = response.posts || [];

    if (currentPosts.length === 0) {
      statusTextEl.textContent = 'No posts found. Scroll the profile first, then try again.';
      return;
    }

    statusEl.style.display = 'none';
    successEl.style.display = 'flex';
    usernameEl.textContent = `@${username}`;
    countEl.textContent = `${currentPosts.length} posts`;
    actionsEl.style.display = 'flex';
    previewEl.style.display = 'block';
    previewEl.textContent = JSON.stringify(currentPosts, null, 2);
  });
}

function extractUsername(url) {
  try {
    const path = new URL(url).pathname;
    const match = path.match(/^\/([a-zA-Z0-9._]+)\/?$/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

function showToast(text) {
  toastEl.textContent = text;
  toastEl.style.display = 'block';
  setTimeout(() => (toastEl.style.display = 'none'), 1500);
}

copyBtn.addEventListener('click', async () => {
  const json = JSON.stringify(currentPosts, null, 2);
  await navigator.clipboard.writeText(json);
  showToast('Copied!');
});

downloadBtn.addEventListener('click', () => {
  const json = JSON.stringify(currentPosts, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${currentUsername || 'instagram'}_posts.json`;
  a.click();
  URL.revokeObjectURL(url);
});

redoBtn.addEventListener('click', init);

init();
