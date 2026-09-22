const STORAGE_KEY = 'md_ads_ivt_v1';
const CLICK_LIMIT = 3;
const WINDOW_MS = 24 * 60 * 60 * 1000;
const BLUR_DEBOUNCE_MS = 1200;
const DISARM_MS = 400;
const CLIENT = 'ca-pub-8094444885520451';
const SCRIPT_SRC = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${CLIENT}`;

type Store = {
  startedAt: number;
  count: number;
};

function emptyStore(): Store {
  return { startedAt: 0, count: 0 };
}

function readStore(): Store {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyStore();

    const parsed = JSON.parse(raw) as Partial<Store>;
    if (typeof parsed.startedAt !== 'number' || typeof parsed.count !== 'number') {
      return emptyStore();
    }

    if (parsed.startedAt > 0 && Date.now() - parsed.startedAt >= WINDOW_MS) {
      localStorage.removeItem(STORAGE_KEY);
      return emptyStore();
    }

    return { startedAt: parsed.startedAt, count: parsed.count };
  } catch {
    return emptyStore();
  }
}

function writeStore(store: Store) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

function isBlocked(): boolean {
  return readStore().count >= CLICK_LIMIT;
}

function recordClick() {
  const store = readStore();
  const now = Date.now();
  if (!store.startedAt) store.startedAt = now;
  store.count += 1;
  writeStore(store);
  if (store.count >= CLICK_LIMIT) unloadAds();
}

function hosts(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>('.ad-host[data-ad-slot]')];
}

function mountSlots() {
  for (const host of hosts()) {
    if (host.querySelector('.adsbygoogle')) continue;

    const ins = document.createElement('ins');
    ins.className = 'adsbygoogle';
    ins.style.display = 'block';
    ins.setAttribute('data-ad-client', host.dataset.adClient || CLIENT);
    ins.setAttribute('data-ad-slot', host.dataset.adSlot || '');
    if (host.dataset.adFormat) ins.setAttribute('data-ad-format', host.dataset.adFormat);
    if (host.dataset.fullWidthResponsive) {
      ins.setAttribute('data-full-width-responsive', host.dataset.fullWidthResponsive);
    }

    host.classList.add('ad-slot');
    if (host.dataset.adLabel) host.dataset.label = host.dataset.adLabel;
    host.appendChild(ins);
  }
}

function pushSlots() {
  window.adsbygoogle = window.adsbygoogle || [];
  const slots = document.querySelectorAll('.adsbygoogle');
  for (let i = 0; i < slots.length; i += 1) {
    window.adsbygoogle.push({});
  }
}

function loadAdScript() {
  if (document.querySelector(`script[src*="adsbygoogle.js"]`)) return;

  const script = document.createElement('script');
  script.async = true;
  script.src = SCRIPT_SRC;
  script.crossOrigin = 'anonymous';
  document.body.appendChild(script);
}

function isAdFrame(iframe: HTMLIFrameElement) {
  const id = iframe.id;
  const name = iframe.name;
  const src = iframe.getAttribute('src') || iframe.src || '';
  return (
    id.startsWith('aswift_') ||
    id.startsWith('google_ads_iframe') ||
    name.startsWith('aswift_') ||
    src.includes('googlesyndication') ||
    src.includes('doubleclick.net') ||
    src.includes('googleads')
  );
}

function hasAdDom() {
  return Boolean(
    document.querySelector('.adsbygoogle') ||
      document.querySelector('.google-auto-placed') ||
      [...document.querySelectorAll('iframe')].some((iframe) => isAdFrame(iframe)),
  );
}

function unloadAds() {
  for (const host of hosts()) {
    host.replaceChildren();
    host.classList.remove('ad-slot');
    delete host.dataset.label;
  }

  document.querySelectorAll('.adsbygoogle, .google-auto-placed').forEach((node) => node.remove());
  document.querySelectorAll('iframe').forEach((iframe) => {
    if (isAdFrame(iframe)) iframe.remove();
  });
  document.querySelectorAll('script[src*="adsbygoogle.js"]').forEach((node) => node.remove());

  watchForReinjection();
}

let reinjectionObserver: MutationObserver | null = null;

function watchForReinjection() {
  if (reinjectionObserver) return;

  reinjectionObserver = new MutationObserver(() => {
    if (isBlocked() && hasAdDom()) unloadAds();
  });
  reinjectionObserver.observe(document.documentElement, { childList: true, subtree: true });
}

function bindClickHeuristic() {
  let armed = false;
  let lastRecordedAt = 0;
  let disarmTimer = 0;

  const arm = () => {
    armed = true;
    window.clearTimeout(disarmTimer);
  };

  const scheduleDisarm = () => {
    window.clearTimeout(disarmTimer);
    disarmTimer = window.setTimeout(() => {
      armed = false;
    }, DISARM_MS);
  };

  const onLeavePage = () => {
    if (!armed) return;

    const now = Date.now();
    if (now - lastRecordedAt < BLUR_DEBOUNCE_MS) return;

    lastRecordedAt = now;
    armed = false;
    recordClick();
  };

  document.addEventListener('pointerover', (event) => {
    const target = event.target;
    if (target instanceof Element && target.closest('.adsbygoogle')) arm();
  });

  document.addEventListener('pointerout', (event) => {
    const target = event.target;
    const next = event.relatedTarget;
    if (!(target instanceof Element) || !target.closest('.adsbygoogle')) return;
    if (next instanceof Element && next.closest('.adsbygoogle')) return;
    scheduleDisarm();
  });

  document.addEventListener(
    'touchstart',
    (event) => {
      const target = event.target;
      if (target instanceof Element && target.closest('.adsbygoogle')) arm();
    },
    { passive: true },
  );

  window.addEventListener('blur', onLeavePage);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) onLeavePage();
    else if (isBlocked()) unloadAds();
  });
  window.addEventListener('focus', () => {
    if (isBlocked()) unloadAds();
  });
}

function loadAds() {
  if (isBlocked()) return;

  mountSlots();
  pushSlots();
  loadAdScript();
  bindClickHeuristic();
}

export function initAdsGuard() {
  if (isBlocked()) return;

  if (document.readyState === 'complete') {
    loadAds();
    return;
  }

  window.addEventListener('load', loadAds, { once: true });
}

declare global {
  interface Window {
    adsbygoogle?: unknown[];
  }
}
