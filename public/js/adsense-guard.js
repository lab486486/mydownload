(() => {
  const STORAGE_KEY = 'md_ads_ivt_v1';
  const CLICK_LIMIT = 3;
  const WINDOW_MS = 24 * 60 * 60 * 1000;
  const BLUR_DEBOUNCE_MS = 1200;
  const STICKY_ARM_MS = 14000;
  const CLIENT = 'ca-pub-8094444885520451';
  const SCRIPT_SRC = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${CLIENT}`;

  let wiping = false;
  let armed = false;
  let armTimer = 0;
  let lastRecordedAt = 0;
  let reinjectionObserver = null;
  let heuristicBound = false;

  function emptyStore() {
    return { startedAt: 0, count: 0 };
  }

  function readStore() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return emptyStore();

      const parsed = JSON.parse(raw);
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

  function writeStore(store) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  }

  function isBlocked() {
    return readStore().count >= CLICK_LIMIT;
  }

  function hosts() {
    return [...document.querySelectorAll('.ad-host[data-ad-slot]')];
  }

  function isAdFrame(iframe) {
    const id = iframe.id || '';
    const name = iframe.name || '';
    const src = iframe.getAttribute('src') || '';
    return (
      id.startsWith('aswift_') ||
      id.startsWith('google_ads_iframe') ||
      name.startsWith('aswift_') ||
      src.includes('googlesyndication') ||
      src.includes('doubleclick.net') ||
      src.includes('googleads')
    );
  }

  function isAdElement(node) {
    if (!(node instanceof Element)) return false;
    if (node.closest('.adsbygoogle, .ad-unit, .ad-host, .google-auto-placed')) return true;
    const iframe = node instanceof HTMLIFrameElement ? node : node.closest('iframe');
    return iframe instanceof HTMLIFrameElement && isAdFrame(iframe);
  }

  function hasAdDom() {
    return Boolean(
      document.querySelector(
        '.ad-unit, ins.adsbygoogle, .google-auto-placed, script[src*="adsbygoogle.js"]',
      ) || [...document.querySelectorAll('iframe')].some(isAdFrame),
    );
  }

  function blockPush() {
    const queue = window.adsbygoogle || [];
    queue.push = () => queue.length;
    window.adsbygoogle = queue;
  }

  function wipeAds() {
    if (wiping) return;
    wiping = true;
    try {
      blockPush();

      for (const host of hosts()) {
        host.replaceChildren();
        host.classList.remove('ad-slot');
        delete host.dataset.label;
      }

      document.querySelectorAll('.ad-unit, ins.adsbygoogle, .google-auto-placed').forEach((node) => {
        node.remove();
      });

      document.querySelectorAll('iframe').forEach((iframe) => {
        if (!isAdFrame(iframe)) return;
        iframe.src = 'about:blank';
        iframe.remove();
      });

      document
        .querySelectorAll('script[src*="adsbygoogle.js"], script[src*="googlesyndication.com/pagead"]')
        .forEach((node) => node.remove());
    } finally {
      wiping = false;
    }

    if (isBlocked() && hasAdDom()) wipeAds();
  }

  function watchForReinjection() {
    if (reinjectionObserver) return;

    reinjectionObserver = new MutationObserver(() => {
      if (wiping || !isBlocked()) return;
      if (hasAdDom()) wipeAds();
    });
    reinjectionObserver.observe(document.documentElement, { childList: true, subtree: true });
  }

  function recordClick() {
    const store = readStore();
    const now = Date.now();
    if (!store.startedAt || now - store.startedAt >= WINDOW_MS) {
      store.startedAt = now;
      store.count = 0;
    }
    store.count += 1;
    writeStore(store);
    if (store.count >= CLICK_LIMIT) {
      blockPush();
      wipeAds();
      watchForReinjection();
    }
  }

  function arm() {
    armed = true;
    window.clearTimeout(armTimer);
    armTimer = window.setTimeout(() => {
      armed = false;
    }, STICKY_ARM_MS);
  }

  function noteAdFocus() {
    if (isAdElement(document.activeElement)) arm();
  }

  function onLeavePage() {
    noteAdFocus();
    if (isBlocked()) {
      wipeAds();
      return;
    }
    if (!armed) return;

    const now = Date.now();
    if (now - lastRecordedAt < BLUR_DEBOUNCE_MS) return;

    lastRecordedAt = now;
    arm();
    recordClick();
  }

  function bindClickHeuristic() {
    if (heuristicBound) return;
    heuristicBound = true;

    const armIfAd = (event) => {
      if (isAdElement(event.target)) arm();
    };

    document.addEventListener('pointerover', armIfAd, true);
    document.addEventListener('pointerdown', armIfAd, true);
    document.addEventListener('touchstart', armIfAd, { capture: true, passive: true });
    document.addEventListener('focusin', armIfAd, true);
    document.addEventListener('focus', armIfAd, true);

    window.addEventListener('blur', () => {
      noteAdFocus();
      onLeavePage();
      window.setTimeout(() => {
        noteAdFocus();
        onLeavePage();
      }, 0);
    });

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') onLeavePage();
      else if (isBlocked()) wipeAds();
    });

    window.addEventListener('pagehide', onLeavePage);
  }

  function mountSlots() {
    if (isBlocked()) return;

    for (const host of hosts()) {
      if (isBlocked()) return;
      if (host.querySelector('ins.adsbygoogle')) continue;

      const ins = document.createElement('ins');
      ins.className = 'adsbygoogle ad-unit';
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
    if (isBlocked()) return;

    const slots = [...document.querySelectorAll('ins.adsbygoogle:not([data-ads-pushed])')];
    if (!slots.length || isBlocked()) return;

    window.adsbygoogle = window.adsbygoogle || [];
    for (const slot of slots) {
      if (isBlocked()) return;
      slot.setAttribute('data-ads-pushed', '1');
      window.adsbygoogle.push({});
    }
  }

  function loadAdScript() {
    if (isBlocked()) return;
    if (document.querySelector('script[src*="adsbygoogle.js"]')) return;

    const script = document.createElement('script');
    script.async = true;
    script.src = SCRIPT_SRC;
    script.crossOrigin = 'anonymous';
    document.body.appendChild(script);
  }

  function start() {
    if (isBlocked()) {
      blockPush();
      wipeAds();
      watchForReinjection();
      return;
    }

    mountSlots();
    if (isBlocked()) return;
    loadAdScript();
    pushSlots();
    bindClickHeuristic();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
