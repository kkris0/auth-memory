(function () {
    'use strict';

    // Running inside the extension? chrome.storage is available there; in a plain
    // browser tab (local preview) it is not, and we fall back to demo data.
    const IS_EXTENSION = typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync;

    const DEMO = {
        'composio.dev': [
            { email: 'kiko.krizman@gmail.com', ts: Date.now() - 5 * 60 * 1000, host: 'composio.dev' },
            { email: 'kristjan.krizman@gmail.com', ts: Date.now() - 12 * 24 * 3600 * 1000, host: 'composio.dev' },
        ],
        'memelord.com': [{ email: 'blazeindafаce89@gmail.com', ts: Date.now() - 26 * 3600 * 1000, host: 'signin.memelord.com' }],
        'workos.com': [{ email: 'kiko.krizman@gmail.com', ts: Date.now() - 30 * 3600 * 1000, host: 'auth.workos.com' }],
        'chrome.google.com': [
            { email: 'kkristjan@proton.me', ts: Date.now() - 2 * 24 * 3600 * 1000, host: 'chrome.google.com' },
            { email: 'kristjan.krizman@gmail.com', ts: Date.now() - 8 * 24 * 3600 * 1000, host: 'chrome.google.com' },
        ],
        'claude.ai': [{ email: 'kristjan.krizman@gmail.com', ts: Date.now() - 3 * 24 * 3600 * 1000, host: 'claude.ai' }],
        'photon.codes': [{ email: 'kiko.krizman@gmail.com', ts: Date.now() - 5 * 24 * 3600 * 1000, host: 'app.photon.codes' }],
    };

    const els = {
        count: document.getElementById('count'),
        search: document.getElementById('search'),
        pinned: document.getElementById('pinned'),
        history: document.getElementById('history'),
        historyTitle: document.getElementById('historyTitle'),
        empty: document.getElementById('empty'),
        emptyTitle: document.getElementById('emptyTitle'),
        emptySub: document.getElementById('emptySub'),
    };

    const state = {
        data: {},
        current: null,
    };

    function displayDomain(hostname) {
        if (!hostname) return '';
        const h = hostname.toLowerCase();
        if (h === 'localhost' || /^\d{1,3}(\.\d{1,3}){3}$/.test(h)) return h;
        const parts = h.split('.');
        if (parts.length >= 3) {
            const STRIP = new Set([
                'www', 'signin', 'login', 'auth', 'accounts', 'account',
                'sso', 'id', 'oauth', 'app', 'my', 'dashboard', 'admin', 'go', 'continue',
            ]);
            if (STRIP.has(parts[0])) return parts.slice(1).join('.');
        }
        return h;
    }

    // Resolve the actual service behind a Google account-chooser URL.
    function serviceDomainFromGoogle(url) {
        const params = url.searchParams;
        const keys = ['redirect_uri', 'continue', 'origin', 'app_domain', 'return_to'];
        for (const k of keys) {
            if (params.has(k)) {
                const v = params.get(k);
                try {
                    const u = new URL(v.startsWith('http') ? v : 'https://' + v);
                    if (u.hostname === 'accounts.google.com' || u.hostname === 'www.google.com') continue;
                    return u.hostname;
                } catch (e) {
                    /* ignore */
                }
            }
        }
        return params.get('service') || null;
    }

    async function loadStorage() {
        if (IS_EXTENSION) return await chrome.storage.sync.get(null);
        return DEMO;
    }

    async function getCurrentDomain() {
        if (!IS_EXTENSION) return 'composio.dev';
        try {
            const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
            const tab = tabs && tabs[0];
            if (!tab || !tab.url) return null;

            const url = new URL(tab.url);
            if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;

            if (url.hostname === 'accounts.google.com') {
                const target = serviceDomainFromGoogle(url);
                return target || null;
            }
            return url.hostname;
        } catch (e) {
            return null;
        }
    }

    function normalize(data) {
        const out = {};
        for (const key of Object.keys(data || {})) {
            const value = data[key];
            let records = [];
            if (Array.isArray(value)) records = value;
            else if (typeof value === 'string' && value) records = [{ email: value, ts: 0, host: key }];
            if (!records.length) continue;
            records = records
                .filter(r => r && r.email)
                .map(r => ({ email: r.email, ts: r.ts || 0, host: r.host || key }))
                .sort((a, b) => b.ts - a.ts);
            if (records.length) out[key] = records;
        }
        return out;
    }

    function lastTs(records) {
        return records.reduce((m, r) => Math.max(m, r.ts || 0), 0);
    }

    function timeAgo(ts) {
        if (!ts) return '';
        const s = Math.floor((Date.now() - ts) / 1000);
        if (s < 60) return 'just now';
        const m = Math.floor(s / 60);
        if (m < 60) return m + 'm ago';
        const h = Math.floor(m / 60);
        if (h < 24) return h + 'h ago';
        const d = Math.floor(h / 24);
        if (d === 1) return 'yesterday';
        if (d < 7) return d + ' days ago';
        const w = Math.floor(d / 7);
        if (w === 1) return 'last week';
        if (w < 5) return w + ' weeks ago';
        return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    }

    function hue(str) {
        let h = 0;
        for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) % 360;
        return h;
    }

    function makeFavicon(domain) {
        const wrap = document.createElement('span');
        wrap.className = 'fav';

        const letter = document.createElement('span');
        letter.className = 'fav-letter';
        letter.textContent = (domain || '?').charAt(0).toUpperCase();
        letter.style.setProperty('--hue', String(hue(domain || '')));
        wrap.appendChild(letter);

        if (domain && domain.includes('.')) {
            const img = document.createElement('img');
            img.className = 'fav-img';
            img.alt = '';
            img.src = 'https://www.google.com/s2/favicons?domain=' + encodeURIComponent(domain) + '&sz=64';
            img.addEventListener('error', () => img.remove());
            wrap.appendChild(img);
        }
        return wrap;
    }

    function rowEl(key, records) {
        const item = document.createElement('div');
        item.className = 'row';
        item.appendChild(makeFavicon(key));

        const body = document.createElement('div');
        body.className = 'row-body';

        const top = document.createElement('div');
        top.className = 'row-top';

        const name = document.createElement('span');
        name.className = 'row-domain';
        name.textContent = key;
        name.title = key;
        top.appendChild(name);

        const time = document.createElement('span');
        time.className = 'row-time';
        time.textContent = timeAgo(lastTs(records));
        top.appendChild(time);
        body.appendChild(top);

        const first = records[0];
        if (first.host && first.host !== key) {
            const host = document.createElement('div');
            host.className = 'row-host';
            host.textContent = first.host;
            body.appendChild(host);
        }

        records.forEach(r => {
            const em = document.createElement('div');
            em.className = 'row-email';
            em.textContent = r.email;
            em.title = r.email;
            body.appendChild(em);
        });

        item.appendChild(body);
        return item;
    }

    function renderPinned(key, records) {
        const card = document.createElement('div');
        card.className = 'pinned-card';

        const label = document.createElement('div');
        label.className = 'pinned-label';
        label.textContent = 'Current site';
        card.appendChild(label);

        if (records && records.length) {
            card.appendChild(rowEl(key, records));
        } else {
            const none = document.createElement('div');
            none.className = 'pinned-empty';
            none.textContent = 'No account remembered for ' + key + ' yet.';
            card.appendChild(none);
        }

        els.pinned.appendChild(card);
    }

    function matchesQuery(key, records, q) {
        if (key.toLowerCase().includes(q)) return true;
        return records.some(r =>
            (r.email || '').toLowerCase().includes(q) ||
            (r.host || '').toLowerCase().includes(q)
        );
    }

    function render() {
        const q = els.search.value.trim().toLowerCase();
        const data = normalize(state.data);
        const keys = Object.keys(data).sort((a, b) => lastTs(data[b]) - lastTs(data[a]));
        const total = keys.length;

        els.count.textContent = total === 1 ? '1 site' : total + ' sites';

        els.pinned.hidden = true;
        els.pinned.innerHTML = '';
        els.history.innerHTML = '';
        els.historyTitle.hidden = true;
        els.empty.hidden = true;

        // Empty overall state.
        if (!total) {
            els.empty.hidden = false;
            els.emptyTitle.textContent = 'Nothing remembered yet';
            els.emptySub.textContent = 'Sign in with Google on any site and AuthMemory will remember which account you used.';
            return;
        }

        // Searching: flat filtered list, no pin.
        if (q) {
            const matches = keys.filter(k => matchesQuery(k, data[k], q));
            if (!matches.length) {
                els.empty.hidden = false;
                els.emptyTitle.textContent = 'No matches';
                els.emptySub.textContent = 'Try a different site or email.';
                return;
            }
            matches.forEach(k => els.history.appendChild(rowEl(k, data[k])));
            return;
        }

        // Pinned current site.
        const current = state.current ? displayDomain(state.current) : null;
        if (current) {
            els.pinned.hidden = false;
            renderPinned(current, data[current] || null);
        }

        // History (all sites, current excluded since it is already pinned).
        const rest = keys.filter(k => k !== current);
        if (rest.length) {
            els.historyTitle.hidden = false;
            rest.forEach(k => els.history.appendChild(rowEl(k, data[k])));
        } else if (!current) {
            els.empty.hidden = false;
            els.emptyTitle.textContent = 'Nothing remembered yet';
            els.emptySub.textContent = 'Sign in with Google on any site and AuthMemory will remember which account you used.';
        }
    }

    async function init() {
        state.data = await loadStorage();
        state.current = await getCurrentDomain();
        render();

        els.search.addEventListener('input', render);
    }

    init();
})();