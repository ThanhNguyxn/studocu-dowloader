// ==================== STATE ====================
let isDownloading = false;

// ==================== DOM ELEMENTS ====================
const pdfBtn = document.getElementById('pdfBtn');
const bypassBtn = document.getElementById('bypassBtn');
const statusBar = document.getElementById('status');
const statusText = document.getElementById('statusText');
const progressSection = document.getElementById('progressSection');
const progressBar = document.getElementById('progressBar');
const progressTitle = document.getElementById('progressTitle');
const progressCount = document.getElementById('progressCount');
const progressDetail = document.getElementById('progressDetail');
const useRangeCheckbox = document.getElementById('useRange');
const rangeInputs = document.getElementById('rangeInputs');
const pageFromInput = document.getElementById('pageFrom');
const pageToInput = document.getElementById('pageTo');

// ==================== HELPER FUNCTIONS ====================

function updateStatus(msg, type = 'info') {
    if (statusText) statusText.textContent = msg;
    if (statusBar) {
        statusBar.className = 'status-bar';
        if (type !== 'info') statusBar.classList.add(type);
    }
}

function showProgress(show = true) {
    if (progressSection) {
        progressSection.classList.toggle('visible', show);
    }
}

function updateProgress(current, total, title, detail = '') {
    const percent = total > 0 ? Math.round((current / total) * 100) : 0;
    if (progressBar) progressBar.style.width = `${percent}%`;
    if (progressTitle) progressTitle.textContent = title;
    if (progressCount) progressCount.textContent = `${current}/${total}`;
    if (progressDetail) progressDetail.textContent = detail;
}

function setButtonState(btn, isProcessing, text = null) {
    if (!btn) return;
    btn.disabled = isProcessing;
    btn.classList.toggle('loading', isProcessing);
    if (text) {
        const titleEl = btn.querySelector('.btn-title');
        if (titleEl) titleEl.textContent = text;
    }
}

function resetButtons() {
    setButtonState(pdfBtn, false, 'Download All Pages');
    setButtonState(bypassBtn, false, 'Bypass Blur & Watermark');
}

// ==================== RANGE TOGGLE ====================

useRangeCheckbox?.addEventListener('change', () => {
    rangeInputs?.classList.toggle('visible', useRangeCheckbox.checked);
});

// ==================== BYPASS BLUR ====================

bypassBtn?.addEventListener('click', async () => {
    setButtonState(bypassBtn, true, 'Processing...');
    updateStatus('Scanning cookies...', 'processing');

    try {
        const allCookies = await chrome.cookies.getAll({});
        let count = 0;

        for (const cookie of allCookies) {
            if (cookie.domain.includes('studocu')) {
                const cleanDomain = cookie.domain.startsWith('.')
                    ? cookie.domain.substring(1)
                    : cookie.domain;
                const protocol = cookie.secure ? 'https:' : 'http:';
                const url = `${protocol}//${cleanDomain}${cookie.path}`;

                await chrome.cookies.remove({
                    url: url,
                    name: cookie.name,
                    storeId: cookie.storeId
                });
                count++;
            }
        }

        updateStatus(`Done! Deleted ${count} cookies. Reloading...`, 'success');

        setTimeout(async () => {
            setButtonState(bypassBtn, false, 'Bypass Blur & Watermark');
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (tab) chrome.tabs.reload(tab.id);
        }, 1000);

    } catch (e) {
        console.error('Bypass error:', e);
        updateStatus('Error: ' + e.message, 'error');
        setButtonState(bypassBtn, false, 'Bypass Blur & Watermark');
    }
});

// ==================== CREATE PDF ====================

pdfBtn?.addEventListener('click', async () => {
    if (isDownloading) return;

    isDownloading = true;
    setButtonState(pdfBtn, true, 'Processing...');
    showProgress(true);
    updateStatus('Starting...', 'processing');

    const useRange = useRangeCheckbox?.checked || false;
    const pageFrom = parseInt(pageFromInput?.value) || 1;
    const pageTo = parseInt(pageToInput?.value) || 9999;

    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

        if (!tab.url.includes('studocu')) {
            throw new Error('Please open a StudoCu document first!');
        }

        updateProgress(0, 100, 'Loading pages...', 'Scrolling document...');

        // Step 1: Scroll to load all pages
        await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: scrollAndLoadPages,
            args: [useRange, pageFrom, pageTo]
        });

        // Poll for scroll progress
        let scrollComplete = false;
        let pageCount = 0;

        while (!scrollComplete) {
            await new Promise(r => setTimeout(r, 300));
            
            const result = await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: () => window.__scrollProgress || { done: false, current: 0, total: 0 }
            });

            const progress = result[0]?.result;
            if (progress) {
                pageCount = progress.current;
                updateProgress(
                    progress.current,
                    progress.total || progress.current + 5,
                    progress.phase || 'Loading...',
                    `${progress.current} pages`
                );
                scrollComplete = progress.done;
            }
        }

        if (pageCount === 0) {
            throw new Error('No pages found. Try scrolling manually first.');
        }

        updateProgress(pageCount, pageCount, 'Creating PDF viewer...', 'Please wait...');
        updateStatus(`Found ${pageCount} pages. Creating viewer...`, 'processing');

        // Step 2: Inject print CSS
        await chrome.scripting.insertCSS({
            target: { tabId: tab.id },
            files: ['print.css']
        });

        // Step 3: Create clean viewer (Studocu-Helper style)
        const result = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: runCleanViewer,
            args: [useRange, pageFrom, pageTo]
        });

        if (result?.[0]?.result?.success) {
            const finalCount = result[0].result.pageCount;
            showProgress(false);
            updateStatus(`${finalCount} pages ready! Use Ctrl+P to save PDF`, 'success');
            setButtonState(pdfBtn, false, 'Done!');

            setTimeout(() => {
                resetButtons();
                isDownloading = false;
            }, 3000);
        } else {
            throw new Error(result?.[0]?.result?.message || 'Failed to create viewer');
        }

    } catch (e) {
        console.error('PDF error:', e);
        updateStatus(e.message, 'error');
        showProgress(false);
        resetButtons();
        isDownloading = false;
    }
});

// ==================== SCROLL FUNCTION (injected) ====================

function scrollAndLoadPages(useRange, pageFrom, pageTo) {
    if (window.__isScrolling) return;
    window.__isScrolling = true;
    window.__scrollProgress = { done: false, current: 0, total: 0, phase: 'Starting...' };

    const wait = (ms) => new Promise(r => setTimeout(r, ms));
    const getPages = () => document.querySelectorAll('div[data-page-index]');

    (async () => {
        try {
            let lastCount = 0;
            let stableCount = 0;
            const MAX_STABLE = 8;

            window.__scrollProgress.phase = 'Discovering pages...';
            
            while (stableCount < MAX_STABLE) {
                window.scrollBy({ top: window.innerHeight * 0.5, behavior: 'smooth' });
                await wait(400);

                const currentCount = getPages().length;
                window.__scrollProgress.current = currentCount;
                window.__scrollProgress.total = currentCount + (stableCount < 3 ? 10 : 0);

                if (currentCount > lastCount) {
                    lastCount = currentCount;
                    stableCount = 0;
                } else {
                    stableCount++;
                }

                if (useRange && currentCount >= pageTo) break;
                if (lastCount > 500) break;
            }

            // Load each page carefully
            window.__scrollProgress.phase = 'Loading content...';
            const allPages = getPages();
            const endPage = useRange ? Math.min(pageTo, allPages.length) : allPages.length;
            const startPage = useRange ? Math.max(0, pageFrom - 1) : 0;

            window.__scrollProgress.total = endPage - startPage;

            for (let i = startPage; i < endPage; i++) {
                const page = allPages[i];
                if (page) {
                    page.scrollIntoView({ behavior: 'instant', block: 'center' });
                    await wait(200);
                    window.__scrollProgress.current = i - startPage + 1;
                    window.__scrollProgress.phase = `Loading page ${i + 1}/${endPage}`;
                }
            }

            window.scrollTo({ top: 0, behavior: 'instant' });
            await wait(300);

            window.__scrollProgress.done = true;
            window.__scrollProgress.current = endPage - startPage;
            window.__scrollProgress.total = endPage - startPage;
            window.__scrollProgress.phase = 'Complete!';

        } catch (error) {
            console.error('[StudoCu] Scroll error:', error);
            window.__scrollProgress.done = true;
        } finally {
            window.__isScrolling = false;
        }
    })();
}

// ==================== CLEAN VIEWER with Canvas Data URL ====================

async function runCleanViewer(useRange, pageFrom, pageTo) {
    try {
        const allPages = document.querySelectorAll('div[data-page-index]');
        
        if (allPages.length === 0) {
            return { success: false, message: 'No pages found!', pageCount: 0 };
        }

        // Filter by range
        const startIdx = useRange ? Math.max(0, pageFrom - 1) : 0;
        const endIdx = useRange ? Math.min(pageTo, allPages.length) : allPages.length;
        const pages = Array.from(allPages).slice(startIdx, endIdx);

        console.log(`[StudoCu] Processing ${pages.length} pages`);

        const SCALE_FACTOR = 4;

        // Convert image to Data URL using Canvas (bypasses CORS in print)
        async function imageToDataURL(imgSrc) {
            return new Promise((resolve) => {
                const img = new Image();
                img.crossOrigin = 'anonymous';
                img.onload = () => {
                    try {
                        const canvas = document.createElement('canvas');
                        canvas.width = img.naturalWidth || img.width;
                        canvas.height = img.naturalHeight || img.height;
                        const ctx = canvas.getContext('2d');
                        ctx.drawImage(img, 0, 0);
                        const dataURL = canvas.toDataURL('image/jpeg', 0.92);
                        console.log(`[StudoCu] Converted to DataURL: ${dataURL.substring(0, 50)}...`);
                        resolve(dataURL);
                    } catch (e) {
                        console.error('[StudoCu] Canvas error:', e);
                        resolve(imgSrc); // fallback to original
                    }
                };
                img.onerror = () => {
                    console.error('[StudoCu] Image load error:', imgSrc);
                    resolve(imgSrc);
                };
                img.src = imgSrc;
            });
        }

        // Copy computed styles with scaling
        function copyComputedStyle(source, target, scaleFactor, shouldScaleHeight = false, shouldScaleWidth = false) {
            const cs = window.getComputedStyle(source);
            const props = ['position','left','top','bottom','right','font-family','font-weight','font-style','color','background-color','text-align','white-space','display','visibility','opacity','z-index','text-shadow','padding'];
            let style = '';
            
            props.forEach(p => {
                const v = cs.getPropertyValue(p);
                if (v && v !== 'none' && v !== 'auto' && v !== 'normal') {
                    style += `${p}: ${v} !important; `;
                }
            });
            
            const w = cs.getPropertyValue('width');
            if (w && w !== 'auto') {
                const n = parseFloat(w);
                if (!isNaN(n) && shouldScaleWidth) {
                    style += `width: ${n/4}px !important; `;
                } else if (w) {
                    style += `width: ${w} !important; `;
                }
            }
            
            const h = cs.getPropertyValue('height');
            if (h && h !== 'auto') {
                const n = parseFloat(h);
                if (!isNaN(n) && shouldScaleHeight) {
                    style += `height: ${n/4}px !important; `;
                } else if (h) {
                    style += `height: ${h} !important; `;
                }
            }
            
            ['margin-top','margin-right','margin-bottom','margin-left'].forEach(p => {
                const v = cs.getPropertyValue(p);
                if (v && v !== 'auto') {
                    const n = parseFloat(v);
                    if (!isNaN(n) && n !== 0) {
                        style += `${p}: ${n/scaleFactor}px !important; `;
                    }
                }
            });
            
            ['font-size','line-height'].forEach(p => {
                const v = cs.getPropertyValue(p);
                if (v && v !== 'normal') {
                    const n = parseFloat(v);
                    if (!isNaN(n) && n > 0) {
                        style += `${p}: ${n/scaleFactor}px !important; `;
                    }
                }
            });
            
            style += 'overflow: visible !important; transform: none !important; -webkit-transform: none !important; ';
            target.style.cssText += style;
        }

        // Deep clone with styles
        function deepClone(el, scaleFactor) {
            const clone = el.cloneNode(false);
            const hasT = el.classList?.contains('t');
            const hasU = el.classList?.contains('_');
            
            copyComputedStyle(el, clone, scaleFactor, hasT, hasU);
            
            if (el.classList?.contains('pc')) {
                clone.style.setProperty('transform', 'none', 'important');
            }
            
            if (el.childNodes.length === 1 && el.childNodes[0].nodeType === 3) {
                clone.textContent = el.textContent;
            } else {
                el.childNodes.forEach(child => {
                    if (child.nodeType === 1) {
                        clone.appendChild(deepClone(child, scaleFactor));
                    } else if (child.nodeType === 3) {
                        clone.appendChild(child.cloneNode(true));
                    }
                });
            }
            return clone;
        }

        // Remove existing viewer
        document.getElementById('clean-viewer-container')?.remove();

        // Build HTML for new window (like studocu-pdf-downloader)
        let pagesHTML = '';
        let successCount = 0;

        for (let index = 0; index < pages.length; index++) {
            const page = pages[index];
            const pc = page.querySelector('.pc');
            const originalImg = page.querySelector('img.bi') || page.querySelector('img');
            
            let width = 595;
            let height = 842;

            if (originalImg) {
                // Get image dimensions
                const rect = originalImg.getBoundingClientRect();
                if (rect.width > 50 && rect.height > 50) {
                    width = rect.width;
                    height = rect.height;
                }
            } else if (pc) {
                const cs = window.getComputedStyle(pc);
                const w = parseFloat(cs.width);
                const h = parseFloat(cs.height);
                if (w > 50 && h > 50) {
                    width = w / SCALE_FACTOR;
                    height = h / SCALE_FACTOR;
                }
            }

            let imgDataURL = '';
            if (originalImg && originalImg.src) {
                console.log(`[StudoCu] Converting page ${index + 1} image...`);
                imgDataURL = await imageToDataURL(originalImg.src);
            }

            let textHTML = '';
            if (pc) {
                const pcClone = deepClone(pc, SCALE_FACTOR);
                pcClone.querySelectorAll('img').forEach(img => img.remove());
                textHTML = pcClone.outerHTML;
            }

            pagesHTML += `
                <div class="page" style="width:${width}px; height:${height}px; position:relative; background:white; page-break-after:always; margin:0 auto;">
                    ${imgDataURL ? `<img src="${imgDataURL}" style="position:absolute; top:0; left:0; width:100%; height:100%; object-fit:contain;">` : ''}
                    ${textHTML ? `<div style="position:absolute; top:0; left:0; width:100%; height:100%; z-index:10;">${textHTML}</div>` : ''}
                </div>
            `;
            successCount++;
            console.log(`[StudoCu] Page ${index + 1}/${pages.length} processed`);
        }

        // Open new window with converted images
        const printWindow = window.open('', '_blank');
        printWindow.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>StudoCu PDF - ${pages.length} pages</title>
                <style>
                    * { margin: 0; padding: 0; box-sizing: border-box; }
                    body { background: #f0f0f0; padding-top: 60px; }
                    .toolbar {
                        position: fixed;
                        top: 0;
                        left: 0;
                        right: 0;
                        height: 50px;
                        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                        display: flex;
                        align-items: center;
                        justify-content: space-between;
                        padding: 0 20px;
                        box-shadow: 0 2px 10px rgba(0,0,0,0.3);
                        z-index: 1000;
                    }
                    .toolbar-title {
                        color: white;
                        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                        font-size: 16px;
                        font-weight: 600;
                        display: flex;
                        align-items: center;
                        gap: 8px;
                    }
                    .toolbar-links {
                        display: flex;
                        align-items: center;
                        gap: 15px;
                        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                        font-size: 13px;
                    }
                    .toolbar-links a {
                        color: rgba(255,255,255,0.95);
                        text-decoration: none;
                        transition: color 0.2s;
                    }
                    .toolbar-links a:hover {
                        color: #ffd700;
                    }
                    .toolbar-links .divider {
                        color: rgba(255,255,255,0.5);
                    }
                    .toolbar-links .credit {
                        color: rgba(255,255,255,0.8);
                    }
                    .toolbar-links .credit a {
                        color: #ffd700;
                        font-weight: 600;
                    }
                    .page { 
                        background: white; 
                        margin: 20px auto; 
                        box-shadow: 0 2px 10px rgba(0,0,0,0.2);
                    }
                    @media print {
                        body { background: white; padding-top: 0; }
                        .toolbar { display: none; }
                        .page { 
                            margin: 0; 
                            box-shadow: none;
                            page-break-after: always;
                        }
                        .page:last-child { page-break-after: auto; }
                    }
                </style>
            </head>
            <body>
                <div class="toolbar">
                    <div class="toolbar-title">📚 StudoCu Downloader</div>
                    <div class="toolbar-links">
                        <a href="https://github.com/ThanhNguyxn/studocu-dowloader" target="_blank">⭐ GitHub</a>
                        <a href="https://github.com/sponsors/ThanhNguyxn" target="_blank">💖 Sponsor</a>
                        <a href="https://buymeacoffee.com/thanhnguyxn" target="_blank">☕ Coffee</a>
                        <span class="divider">|</span>
                        <span class="credit">by <a href="https://github.com/ThanhNguyxn" target="_blank">ThanhNguyxn</a></span>
                    </div>
                </div>
                ${pagesHTML}
            </body>
            </html>
        `);
        printWindow.document.close();
        
        // Auto print after content loaded
        let hasPrinted = false;
        printWindow.onload = function() {
            if (hasPrinted) return;
            hasPrinted = true;
            setTimeout(() => {
                printWindow.print();
            }, 500);
        };

        return { success: true, message: 'PDF window opened!', pageCount: successCount };

    } catch (error) {
        console.error('[StudoCu] Viewer error:', error);
        return { success: false, message: error.message, pageCount: 0 };
    }
}

// ==================== INIT ====================

document.addEventListener('DOMContentLoaded', () => {
    const manifest = chrome.runtime.getManifest();
    const versionEl = document.getElementById('versionText');
    if (versionEl && manifest.version) {
        versionEl.textContent = 'v' + manifest.version;
    }
    console.log('[StudoCu Downloader Pro] v' + manifest.version + ' loaded');
});
