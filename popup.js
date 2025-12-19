// ==================== STATE ====================
let isDownloading = false;

// ==================== HELPER FUNCTIONS ====================

function updateStatus(msg, type = 'info') {
    const statusText = document.getElementById('statusText');
    const statusBar = document.getElementById('status');

    if (statusText) statusText.textContent = msg;
    if (statusBar) {
        statusBar.className = 'status-bar';
        if (type !== 'info') statusBar.classList.add(type);
    }
}

function setButtonState(btn, isProcessing, text = null) {
    if (!btn) return;
    btn.disabled = isProcessing;
    if (text) {
        const titleEl = btn.querySelector('.btn-title');
        if (titleEl) titleEl.textContent = text;
    }
}

// ==================== BYPASS BLUR (Clear Cookies) ====================

document.getElementById('bypassBtn').addEventListener('click', async () => {
    const btn = document.getElementById('bypassBtn');
    setButtonState(btn, true, '🔄 Processing...');
    updateStatus('Scanning and deleting cookies...', 'processing');

    try {
        const allCookies = await chrome.cookies.getAll({});
        let count = 0;

        for (const cookie of allCookies) {
            if (cookie.domain.includes('studocu')) {
                let cleanDomain = cookie.domain.startsWith('.')
                    ? cookie.domain.substring(1)
                    : cookie.domain;
                const protocol = cookie.secure ? "https:" : "http:";
                const url = `${protocol}//${cleanDomain}${cookie.path}`;

                await chrome.cookies.remove({
                    url: url,
                    name: cookie.name,
                    storeId: cookie.storeId
                });
                count++;
            }
        }

        updateStatus(`✅ Deleted ${count} cookies! Reloading...`, 'success');
        setButtonState(btn, true, '✅ Done!');

        setTimeout(async () => {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (tab) chrome.tabs.reload(tab.id);
        }, 1000);

    } catch (e) {
        console.error('Bypass error:', e);
        updateStatus('❌ Error: ' + e.message, 'error');
        setButtonState(btn, false, '🔓 Bypass Blur');
    }
});

// ==================== CREATE PDF ====================

document.getElementById('pdfBtn').addEventListener('click', async () => {
    if (isDownloading) return;

    const btn = document.getElementById('pdfBtn');
    isDownloading = true;
    setButtonState(btn, true, '⏳ Processing...');
    updateStatus('Analyzing document...', 'processing');

    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

        if (!tab.url.includes('studocu')) {
            throw new Error('Please go to a StudoCu document page first!');
        }

        // Step 1: Auto-scroll to load all pages
        updateStatus('📜 Loading all pages...', 'processing');

        await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: autoScrollAndLoadPages
        });

        // Step 2: Extract image data
        updateStatus('🔍 Extracting images...', 'processing');

        const result = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: extractAndCreateViewer
        });

        if (result && result[0] && result[0].result) {
            const { success, message, pageCount } = result[0].result;
            if (success) {
                updateStatus(`✅ ${pageCount} pages ready! Print dialog opening...`, 'success');
                setButtonState(btn, false, '✅ Done!');

                setTimeout(() => {
                    setButtonState(btn, false, '📄 Create PDF');
                    isDownloading = false;
                }, 5000);
            } else {
                throw new Error(message);
            }
        } else {
            throw new Error('Script execution failed');
        }

    } catch (e) {
        console.error('PDF error:', e);
        updateStatus('❌ ' + e.message, 'error');
        setButtonState(btn, false, '📄 Create PDF');
        isDownloading = false;
    }
});

// ==================== AUTO SCROLL FUNCTION ====================

function autoScrollAndLoadPages() {
    return new Promise((resolve) => {
        const pages = document.querySelectorAll('div[data-page-index]');

        if (pages.length === 0) {
            resolve({ success: false, pageCount: 0 });
            return;
        }

        let currentIndex = 0;
        const totalPages = pages.length;

        function scrollNext() {
            if (currentIndex >= totalPages) {
                window.scrollTo({ top: 0, behavior: 'smooth' });
                setTimeout(() => resolve({ success: true, pageCount: totalPages }), 500);
                return;
            }

            pages[currentIndex].scrollIntoView({ behavior: 'smooth', block: 'center' });
            currentIndex++;
            setTimeout(scrollNext, 200);
        }

        scrollNext();
    });
}

// ==================== IMAGE-BASED PDF CREATION ====================
// Uses URL pattern matching for reliable page generation

function extractAndCreateViewer() {
    try {
        const pageElements = document.querySelectorAll('div[data-page-index]');
        const totalPages = pageElements.length;

        if (totalPages === 0) {
            return { success: false, message: 'No pages found! Scroll down first.', pageCount: 0 };
        }

        // Find first valid image
        let firstUrl = null;
        for (const page of pageElements) {
            const img = page.querySelector('img');
            if (img && img.src && !img.src.startsWith('data:')) {
                firstUrl = img.src;
                break;
            }
        }

        if (!firstUrl) {
            return { success: false, message: 'No images found!', pageCount: 0 };
        }

        // Generate image URLs using pattern
        let imageUrls = [];

        // Try pattern: /bg1.png, /bg2.png... (hex)
        const hexMatch = firstUrl.match(/(.*?\/bg)([0-9a-f]+)(\.png\?.*)/i);

        if (hexMatch) {
            const [, prefix, , suffix] = hexMatch;
            for (let i = 1; i <= totalPages; i++) {
                const hexIndex = i.toString(16);
                imageUrls.push(`${prefix}${hexIndex}${suffix}`);
            }
            console.log(`Pattern matched: ${totalPages} pages`);
        } else {
            // Fallback: collect unique images from pages
            const seen = new Set();
            for (const page of pageElements) {
                const img = page.querySelector('img');
                if (img && img.src && !img.src.startsWith('data:') && !seen.has(img.src)) {
                    seen.add(img.src);
                    imageUrls.push(img.src);
                }
            }
            console.log(`Direct collection: ${imageUrls.length} images`);
        }

        if (imageUrls.length === 0) {
            return { success: false, message: 'Could not extract images!', pageCount: 0 };
        }

        // Create HTML with images
        const pageHTMLs = imageUrls.map((src, i) => `
<div style="page-break-after:${i < imageUrls.length - 1 ? 'always' : 'auto'};page-break-inside:avoid;margin:0;padding:0;background:white;">
<img src="${src}" style="width:100%;height:auto;display:block;" onerror="this.parentElement.style.display='none'" />
</div>`).join('');

        const html = `<!DOCTYPE html><html><head><title>StudoCu - ${imageUrls.length} pages</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{background:white}
@media print{@page{margin:0;size:auto}}</style></head><body>${pageHTMLs}</body></html>`;

        // Open new window
        const blob = new Blob([html], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        const win = window.open(url, '_blank');

        if (win) {
            win.onload = () => setTimeout(() => win.print(), 500);
        }

        return { success: true, message: 'PDF ready!', pageCount: imageUrls.length };

    } catch (error) {
        console.error('PDF error:', error);
        return { success: false, message: error.message, pageCount: 0 };
    }
}

// Fallback: inject viewer into current page
function injectViewerDirectly(imageUrls) {
    // Remove existing viewer
    const existing = document.getElementById('studocu-clean-viewer');
    if (existing) existing.remove();

    // Create viewer container
    const viewer = document.createElement('div');
    viewer.id = 'studocu-clean-viewer';
    viewer.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: #f5f5f5;
        z-index: 999999;
        overflow: auto;
        display: flex;
        flex-direction: column;
        align-items: center;
        padding: 20px;
    `;

    // Add pages
    imageUrls.forEach((img, i) => {
        const page = document.createElement('div');
        page.className = 'std-page';
        page.style.cssText = `
            background: white;
            margin-bottom: 20px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            max-width: 800px;
        `;

        const imgEl = document.createElement('img');
        imgEl.src = img.src;
        imgEl.style.cssText = 'width: 100%; height: auto; display: block;';

        page.appendChild(imgEl);
        viewer.appendChild(page);
    });

    // Add close button
    const closeBtn = document.createElement('button');
    closeBtn.textContent = '✖ Close';
    closeBtn.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 10px 20px;
        background: #ef4444;
        color: white;
        border: none;
        border-radius: 8px;
        cursor: pointer;
        z-index: 1000000;
        font-size: 14px;
    `;
    closeBtn.onclick = () => viewer.remove();
    viewer.appendChild(closeBtn);

    // Add print button  
    const printBtn = document.createElement('button');
    printBtn.textContent = '🖨️ Print / Save PDF';
    printBtn.style.cssText = `
        position: fixed;
        top: 20px;
        right: 100px;
        padding: 10px 20px;
        background: #22c55e;
        color: white;
        border: none;
        border-radius: 8px;
        cursor: pointer;
        z-index: 1000000;
        font-size: 14px;
    `;
    printBtn.onclick = () => window.print();
    viewer.appendChild(printBtn);

    document.body.appendChild(viewer);
}

// ==================== INIT ====================
document.addEventListener('DOMContentLoaded', () => {
    const manifest = chrome.runtime.getManifest();
    const versionEl = document.getElementById('versionText');
    if (versionEl && manifest.version) {
        versionEl.textContent = 'v' + manifest.version;
    }
    console.log('StudoCu Downloader v' + manifest.version + ' loaded');
});
