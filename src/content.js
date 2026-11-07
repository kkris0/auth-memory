function getServiceDomain() {
    const params = new URLSearchParams(window.location.search);

    // find out the app url, redirect_uri is the most accurate for OAuth
    const paramKeys = [
        'redirect_uri', // Standard OAuth
        'continue', // Google Standard
        'origin', // Sometimes used
        'app_domain', // Specific wrappers
        'return_to', // Auth0 and others
    ];

    for (const key of paramKeys) {
        if (params.has(key)) {
            const value = params.get(key);
            try {
                const url = new URL(value.startsWith('http') ? value : `https://${value}`);

                // if the redirect is to accounts.google.com, it's an internal hop, skip it.
                if (url.hostname === 'accounts.google.com' || url.hostname === 'www.google.com') {
                    continue;
                }

                return url.hostname;
            } catch (e) {
                console.error(`[AuthMemory] Error parsing URL: ${e}`);
            }
        }
    }

    // if we are on a specific service login page that uses 'service' param, e.g. mail.google.com -> service=mail
    if (params.has('service')) {
        return params.get('service');
    }

    return null;
}

// Collapse a login hostname to the site's display domain: signin.memelord.com -> memelord.com.
// Keeps distinctive hosts (chrome.google.com) and non-domain values (IPs, "service" tokens).
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

function getFaviconUrl(domain) {
    if (!domain.includes('.')) return 'https://www.google.com/favicon.ico';
    return `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
}

const SELECTORS = {
    accountRow: 'li div[role="link"], div[role="button"]',
    emailText: 'div[data-email], div:not(:empty)',
};

// Read the saved records for a site. Handles the legacy string value ("domain" -> "email").
async function getRecords(key) {
    const storage = await chrome.storage.sync.get(key);
    const value = storage[key];
    if (Array.isArray(value)) return value;
    if (typeof value === 'string' && value) return [{ email: value, ts: 0, host: key }];
    return [];
}

// Save a login as a record, de-duplicating by email and keeping only the latest use.
async function saveRecord(key, email, host) {
    const records = await getRecords(key);
    const next = records.filter(r => r.email !== email);
    next.push({ email, ts: Date.now(), host: host || key });
    await chrome.storage.sync.set({ [key]: next });
    console.log(`[AuthMemory] Saved: ${email} -> ${key}`);
    return next;
}

async function highlightLastUsed(serviceDomain) {
    if (!serviceDomain) return;

    // Clean up any previous highlights before applying new ones
    cleanupHighlights();

    const key = displayDomain(serviceDomain);
    const records = await getRecords(key);

    if (!records.length) {
        console.log(`[AuthMemory] No saved account found for: ${key}`);
        return;
    }

    const lastUsedEmail = records.reduce((a, b) => (b.ts > a.ts ? b : a)).email;
    console.log(`[AuthMemory] Found saved account for ${key}: ${lastUsedEmail}`);

    const accountRows = document.querySelectorAll(SELECTORS.accountRow);

    accountRows.forEach(row => {
        const emailDiv = row.querySelector('div[data-email]') || row;
        const textContent = row.innerText || '';

        if (
            (emailDiv.dataset.email && emailDiv.dataset.email === lastUsedEmail) ||
            textContent.includes(lastUsedEmail)
        ) {
            applyVisuals(row, key);
        }
    });
}

function applyVisuals(rowElement, serviceDomain) {
    if (rowElement.dataset.authMemoryProcessed) return;
    rowElement.dataset.authMemoryProcessed = 'true';

    rowElement.classList.add('auth-memory-highlight');

    const badge = document.createElement('div');
    badge.className = 'auth-memory-badge';

    const logo = document.createElement('img');
    logo.src = getFaviconUrl(serviceDomain);
    logo.className = 'auth-memory-logo';
    logo.alt = '';

    const text = document.createElement('span');
    text.innerText = `Last used for ${serviceDomain}`;

    badge.appendChild(logo);
    badge.appendChild(text);

    const textContainer = rowElement.querySelector('div:nth-child(2)') || rowElement;
    textContainer.appendChild(badge);
}

function cleanupHighlights() {
    // Remove all badges
    document.querySelectorAll('.auth-memory-badge').forEach(badge => badge.remove());

    // Remove all highlight classes and reset processed flags
    document.querySelectorAll('.auth-memory-highlight').forEach(row => {
        row.classList.remove('auth-memory-highlight');
        delete row.dataset.authMemoryProcessed;
    });
}

function setupClickListener(serviceDomain) {
    const key = displayDomain(serviceDomain);

    document.body.addEventListener('click', e => {
        const row = e.target.closest(SELECTORS.accountRow);
        if (!row) return;

        let email = null;
        const emailDiv = row.querySelector('div[data-email]');

        if (emailDiv && emailDiv.dataset.email) {
            email = emailDiv.dataset.email;
        } else {
            const match = row.innerText.match(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/);
            if (match) email = match[0];
        }

        if (email && serviceDomain) {
            saveRecord(key, email, serviceDomain);
        }
    });
}

function init() {
    const serviceDomain = getServiceDomain();

    if (!serviceDomain) {
        console.log('[AuthMemory] Could not detect a 3rd party service domain. Idle.');
        return;
    }

    console.log(`[AuthMemory] Active. Detected Service: ${serviceDomain}`);

    setupClickListener(serviceDomain);
    highlightLastUsed(serviceDomain);

    const observer = new MutationObserver(() => {
        highlightLastUsed(serviceDomain);
    });

    observer.observe(document.body, { childList: true, subtree: true });
}

init();