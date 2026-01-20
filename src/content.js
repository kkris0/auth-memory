/**
 * AuthMemory Content Script - v1.1
 * Logic:
 * 1. Parse URL to find the "Destination Service" (e.g., replit.com).
 * 2. If found, check storage for a saved email for THAT specific domain.
 * 3. Highlight the account if found.
 * 4. Listen for clicks to save the mapping (Domain -> Email).
 */

// --- 1. ROBUST DOMAIN EXTRACTION ---

function getServiceDomain() {
    const params = new URLSearchParams(window.location.search);

    // The list of parameters where the "real" app usually hides its URL.
    // Order matters: redirect_uri is usually the most accurate for OAuth.
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
                // 1. Try to parse as a full URL
                const url = new URL(value.startsWith('http') ? value : `https://${value}`);

                // 2. Filter out Google's own infrastructure (we want the 3rd party app)
                // If the redirect is to accounts.google.com, it's an internal hop, skip it.
                if (url.hostname === 'accounts.google.com' || url.hostname === 'www.google.com') {
                    continue;
                }

                // 3. Return the clean hostname (e.g., "replit.com")
                return url.hostname;
            } catch (e) {
                // Ignore parse errors, try next key
            }
        }
    }

    // Fallback: If we are on a specific service login page that uses 'service' param
    // e.g. mail.google.com -> service=mail. This is less useful for 3rd party apps but good for Google apps.
    if (params.has('service')) {
        return params.get('service'); // e.g. "youtube", "mail"
    }

    return null;
}

// --- 2. HELPERS ---

function getFaviconUrl(domain) {
    // If it's a simple string like "mail", default to Google logo, else fetch domain favicon
    if (!domain.includes('.')) return 'https://www.google.com/favicon.ico';
    return `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
}

// --- 3. CORE LOGIC ---

const SELECTORS = {
    accountRow: 'li div[role="link"], div[role="button"]',
    emailText: 'div[data-email], div:not(:empty)',
};

async function highlightLastUsed(serviceDomain) {
    if (!serviceDomain) return;

    // KEY FIX: We get the email specifically for THIS domain
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

        // Check if this row matches the saved email
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

    // Highlight
    rowElement.classList.add('auth-memory-highlight');

    // Badge
    const badge = document.createElement('div');
    badge.className = 'auth-memory-badge';

    const logo = document.createElement('img');
    logo.src = getFaviconUrl(serviceDomain);
    logo.className = 'auth-memory-logo';

    const text = document.createElement('span');
    text.innerText = `Last used for ${serviceDomain}`;

    badge.appendChild(logo);
    badge.appendChild(text);

    // Append to the text container to keep layout clean
    const textContainer = rowElement.querySelector('div:nth-child(2)') || rowElement;
    textContainer.appendChild(badge);
}

function setupClickListener(serviceDomain) {
    document.body.addEventListener('click', e => {
        const row = e.target.closest(SELECTORS.accountRow);
        if (!row) return;

        // Extract Email
        let email = null;
        const emailDiv = row.querySelector('div[data-email]');

        if (emailDiv && emailDiv.dataset.email) {
            email = emailDiv.dataset.email;
        } else {
            // Regex fallback
            const match = row.innerText.match(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/);
            if (match) email = match[0];
        }

        if (email && serviceDomain) {
            // KEY FIX: Save specifically for THIS domain
            chrome.storage.sync.set({ [serviceDomain]: email }, () => {
                console.log(`[AuthMemory] Saved: ${email} -> ${serviceDomain}`);
            });
        }
    });
}

// --- 4. INITIALIZATION ---

function init() {
    const serviceDomain = getServiceDomain();

    if (!serviceDomain) {
        console.log('[AuthMemory] Could not detect a 3rd party service domain. Idle.');
        return;
    }

    console.log(`[AuthMemory] Active. Detected Service: ${serviceDomain}`);

    setupClickListener(serviceDomain);
    highlightLastUsed(serviceDomain);

    // Observer for dynamic rendering
    const observer = new MutationObserver(() => {
        highlightLastUsed(serviceDomain);
    });

    observer.observe(document.body, { childList: true, subtree: true });
}

init();
