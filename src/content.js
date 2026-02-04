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

function getFaviconUrl(domain) {
    if (!domain.includes('.')) return 'https://www.google.com/favicon.ico';
    return `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
}

const SELECTORS = {
    accountRow: 'li div[role="link"], div[role="button"]',
    emailText: 'div[data-email], div:not(:empty)',
};

async function highlightLastUsed(serviceDomain) {
    if (!serviceDomain) return;

    // Clean up any previous highlights before applying new ones
    cleanupHighlights();

    const storage = await chrome.storage.sync.get(serviceDomain);
    const lastUsedEmail = storage[serviceDomain];

    if (!lastUsedEmail) {
        console.log(`[AuthMemory] No saved account found for: ${serviceDomain}`);
        return;
    }

    console.log(`[AuthMemory] Found saved account for ${serviceDomain}: ${lastUsedEmail}`);

    const accountRows = document.querySelectorAll(SELECTORS.accountRow);

    accountRows.forEach(row => {
        const emailDiv = row.querySelector('div[data-email]') || row;
        const textContent = row.innerText || '';

        if (
            (emailDiv.dataset.email && emailDiv.dataset.email === lastUsedEmail) ||
            textContent.includes(lastUsedEmail)
        ) {
            applyVisuals(row, serviceDomain);
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
            chrome.storage.sync.set({ [serviceDomain]: email }, () => {
                console.log(`[AuthMemory] Saved: ${email} -> ${serviceDomain}`);
            });
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
