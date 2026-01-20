const fs = require('fs-extra');
const archiver = require('archiver');
const path = require('path');

const DIST_DIR = path.join(__dirname, '../dist');
const SRC_DIR = path.join(__dirname, '../src');
const ICONS_DIR = path.join(__dirname, '../icons');

// Ensure dist directory exists
fs.ensureDirSync(DIST_DIR);

async function createPackage(browser) {
    const manifest = await fs.readJson(path.join(__dirname, '../manifest.json'));
    const zipName = `auth-memory-${browser}-v${manifest.version}.zip`;
    const output = fs.createWriteStream(path.join(DIST_DIR, zipName));
    const archive = archiver('zip', { zlib: { level: 9 } });

    console.log(`📦 Packaging for ${browser}...`);

    // Firefox Manifest V3 Fix
    if (browser === 'firefox') {
        // Firefox uses "background": { "scripts": [] } instead of "service_worker"
        if (manifest.background && manifest.background.service_worker) {
            manifest.background.scripts = [manifest.background.service_worker];
            delete manifest.background.service_worker;
        }
        // Firefox requires specific ID for updates
        manifest.browser_specific_settings = {
            gecko: {
                id: 'authmemory@yourdomain.com', // CHANGE THIS
                strict_min_version: '109.0',
            },
        };
    }

    archive.pipe(output);

    // Append modified manifest
    archive.append(JSON.stringify(manifest, null, 2), { name: 'manifest.json' });

    // Append source files
    archive.directory(SRC_DIR, 'src');
    archive.directory(ICONS_DIR, 'icons');

    await archive.finalize();
    console.log(`✅ Created ${zipName}`);
}

(async () => {
    await createPackage('chrome');
    await createPackage('firefox');
})();
