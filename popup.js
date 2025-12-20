// ==================== STATE ====================
let isDownloading = false;

// ==================== HELPER FUNCTIONS ====================

function updateStatus(msg, type = 'info') {
    const statusText = document.getElementById('statusText');
    const statusBar = document.getElementById('status');
    const statusIcon = statusBar?.querySelector('.status-icon');

    if (statusText) statusText.textContent = msg;
    if (statusBar) {
        statusBar.className = 'status-bar';
        if (type !== 'info') statusBar.classList.add(type);
    }
    if (statusIcon) {
        const icons = { info: '💡', success: '✅', error: '❌', processing: '⏳' };
        statusIcon.textContent = icons[type] || '💡';
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

// ==================== BYPASS BLUR ====================

document.getElementById('bypassBtn').addEventListener('click', async () => {
    const btn = document.getElementById('bypassBtn');
    setButtonState(btn, true, 'Processing...');
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

        updateStatus(`Deleted ${count} cookies! Reloading...`, 'success');
        setButtonState(btn, true, 'Done!');

        setTimeout(async () => {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (tab) chrome.tabs.reload(tab.id);
        }, 1000);

    } catch (e) {
        console.error('Bypass error:', e);
        updateStatus('Error: ' + e.message, 'error');
        setButtonState(btn, false, 'Bypass Blur');
    }
});

// ==================== CREATE PDF ====================

document.getElementById('pdfBtn').addEventListener('click', async () => {
    if (isDownloading) return;

    const btn = document.getElementById('pdfBtn');
    isDownloading = true;
    setButtonState(btn, true, 'Processing...');
    updateStatus('Analyzing document...', 'processing');

    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

        if (!tab.url.includes('studocu')) {
            throw new Error('Please open a StudoCu document first!');
        }

        // Step 1: Auto-scroll to load all pages
        updateStatus('Loading all pages...', 'processing');

        const scrollResult = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: autoScrollAndLoadPages
        });

        const pageCount = scrollResult[0]?.result?.pageCount || 0;
        if (pageCount === 0) {
            throw new Error('No pages found. Please scroll through the document first.');
        }

        updateStatus(`Found ${pageCount} pages. Building PDF...`, 'processing');

        // Step 2: Inject print CSS
        await chrome.scripting.insertCSS({
            target: { tabId: tab.id },
            files: ['print.css']
        });

        // Step 3: Create PDF viewer
        const result = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: runCleanViewer
        });

        if (result?.[0]?.result?.success) {
            const finalCount = result[0].result.pageCount;
            updateStatus(`${finalCount} pages ready! Print dialog opening...`, 'success');
            setButtonState(btn, false, 'Done!');

            setTimeout(() => {
                setButtonState(btn, false, 'Create PDF');
                isDownloading = false;
            }, 3000);
        } else {
            throw new Error(result?.[0]?.result?.message || 'Unknown error');
        }

    } catch (e) {
        console.error('PDF error:', e);
        updateStatus(e.message, 'error');
        setButtonState(btn, false, 'Create PDF');
        isDownloading = false;
    }
});

// ==================== AUTO SCROLL (Dynamic) ====================

async function autoScrollAndLoadPages() {
    console.log('[StudoCu] Starting slow page-by-page scroll...');

    const wait = (ms) => new Promise(r => setTimeout(r, ms));
    const getPages = () => document.querySelectorAll('div[data-page-index]');

    // Wait for a specific image to load
    const waitForImage = async (img, timeout = 5000) => {
        if (!img || img.complete) return true;
        return new Promise(resolve => {
            const timer = setTimeout(() => resolve(false), timeout);
            img.onload = () => { clearTimeout(timer); resolve(true); };
            img.onerror = () => { clearTimeout(timer); resolve(false); };
        });
    };

    let lastCount = 0;
    let stableCount = 0;
    const MAX_STABLE = 5;

    // Phase 1: Scroll to bottom slowly to trigger lazy loading
    console.log('[StudoCu] Phase 1: Scrolling to load all pages...');
    while (stableCount < MAX_STABLE) {
        // Scroll down by viewport height
        window.scrollBy({ top: window.innerHeight * 0.8, behavior: 'smooth' });
        await wait(500);

        const currentCount = getPages().length;
        if (currentCount > lastCount) {
            console.log(`[StudoCu] Found ${currentCount} pages`);
            lastCount = currentCount;
            stableCount = 0;
        } else {
            stableCount++;
        }

        if (stableCount > 500) break;
    }

    console.log(`[StudoCu] Phase 1 complete: ${lastCount} pages found`);

    // Phase 2: Scroll through each page slowly to ensure images load
    console.log('[StudoCu] Phase 2: Loading all images...');
    const allPages = getPages();

    for (let i = 0; i < allPages.length; i++) {
        const page = allPages[i];
        page.scrollIntoView({ behavior: 'instant', block: 'center' });

        const img = page.querySelector('img');
        await waitForImage(img, 3000);
        await wait(100);

        if ((i + 1) % 20 === 0) {
            console.log(`[StudoCu] Loaded ${i + 1}/${allPages.length} pages`);
        }
    }

    console.log('[StudoCu] Phase 2 complete: All images loaded');
    window.scrollTo({ top: 0, behavior: 'instant' });
    await wait(300);

    return { success: true, pageCount: allPages.length };
}

// ==================== CLEAN VIEWER (Core Logic) ====================

function runCleanViewer() {
    try {
        const pages = document.querySelectorAll('div[data-page-index]');

        if (pages.length === 0) {
            return { success: false, message: 'No pages found!', pageCount: 0 };
        }

        console.log(`[StudoCu] Processing ${pages.length} pages...`);

        // ===== Constants (from Studocu-Helper) =====
        const SCALE_FACTOR = 4;
        const HEIGHT_SCALE_DIVISOR = 4;

        // ===== EXACT copyComputedStyle from Studocu-Helper =====
        function copyComputedStyle(source, target, scaleFactor, shouldScaleHeight = false, shouldScaleWidth = false, heightScaleDivisor = 4, widthScaleDivisor = 4, shouldScaleMargin = false, marginScaleDivisor = 4) {
            const computedStyle = window.getComputedStyle(source);

            const normalProps = [
                'position', 'left', 'top', 'bottom', 'right',
                'font-family', 'font-weight', 'font-style',
                'color', 'background-color',
                'text-align', 'white-space',
                'display', 'visibility', 'opacity', 'z-index',
                'text-shadow', 'unicode-bidi', 'font-feature-settings', 'padding'
            ];

            const scaleProps = ['font-size', 'line-height'];
            let styleString = '';

            normalProps.forEach(prop => {
                const value = computedStyle.getPropertyValue(prop);
                if (value && value !== 'none' && value !== 'auto' && value !== 'normal') {
                    styleString += `${prop}: ${value} !important; `;
                }
            });

            const widthValue = computedStyle.getPropertyValue('width');
            if (widthValue && widthValue !== 'none' && widthValue !== 'auto') {
                if (shouldScaleWidth) {
                    const numValue = parseFloat(widthValue);
                    if (!isNaN(numValue) && numValue > 0) {
                        const unit = widthValue.replace(numValue.toString(), '');
                        styleString += `width: ${numValue / widthScaleDivisor}${unit} !important; `;
                    } else {
                        styleString += `width: ${widthValue} !important; `;
                    }
                } else {
                    styleString += `width: ${widthValue} !important; `;
                }
            }

            const heightValue = computedStyle.getPropertyValue('height');
            if (heightValue && heightValue !== 'none' && heightValue !== 'auto') {
                if (shouldScaleHeight) {
                    const numValue = parseFloat(heightValue);
                    if (!isNaN(numValue) && numValue > 0) {
                        const unit = heightValue.replace(numValue.toString(), '');
                        styleString += `height: ${numValue / heightScaleDivisor}${unit} !important; `;
                    } else {
                        styleString += `height: ${heightValue} !important; `;
                    }
                } else {
                    styleString += `height: ${heightValue} !important; `;
                }
            }

            ['margin-top', 'margin-right', 'margin-bottom', 'margin-left'].forEach(prop => {
                const value = computedStyle.getPropertyValue(prop);
                if (value && value !== 'auto') {
                    const numValue = parseFloat(value);
                    if (!isNaN(numValue)) {
                        if (shouldScaleMargin && numValue !== 0) {
                            const unit = value.replace(numValue.toString(), '');
                            styleString += `${prop}: ${numValue / marginScaleDivisor}${unit} !important; `;
                        } else {
                            styleString += `${prop}: ${value} !important; `;
                        }
                    }
                }
            });

            scaleProps.forEach(prop => {
                const value = computedStyle.getPropertyValue(prop);
                if (value && value !== 'none' && value !== 'auto' && value !== 'normal') {
                    const numValue = parseFloat(value);
                    if (!isNaN(numValue) && numValue !== 0) {
                        const unit = value.replace(numValue.toString(), '');
                        styleString += `${prop}: ${numValue / scaleFactor}${unit} !important; `;
                    } else {
                        styleString += `${prop}: ${value} !important; `;
                    }
                }
            });

            let transformOrigin = computedStyle.getPropertyValue('transform-origin');
            if (transformOrigin) {
                styleString += `transform-origin: ${transformOrigin} !important; -webkit-transform-origin: ${transformOrigin} !important; `;
            }

            styleString += 'overflow: visible !important; max-width: none !important; max-height: none !important; clip: auto !important; clip-path: none !important; ';
            target.style.cssText += styleString;
        }

        // ===== EXACT deepCloneWithStyles from Studocu-Helper =====
        function deepCloneWithStyles(element, scaleFactor, heightScaleDivisor, depth = 0) {
            const clone = element.cloneNode(false);
            const hasTextClass = element.classList && element.classList.contains('t');
            const hasUnderscoreClass = element.classList && element.classList.contains('_');

            const shouldScaleMargin = element.tagName === 'SPAN' &&
                element.classList &&
                element.classList.contains('_') &&
                Array.from(element.classList).some(cls => /^_(?:\d+[a-z]*|[a-z]+\d*)$/i.test(cls));

            copyComputedStyle(element, clone, scaleFactor, hasTextClass, hasUnderscoreClass, heightScaleDivisor, 4, shouldScaleMargin, scaleFactor);

            if (element.classList && element.classList.contains('pc')) {
                clone.style.setProperty('transform', 'none', 'important');
                clone.style.setProperty('-webkit-transform', 'none', 'important');
                clone.style.setProperty('overflow', 'visible', 'important');
                clone.style.setProperty('max-width', 'none', 'important');
                clone.style.setProperty('max-height', 'none', 'important');
            }

            if (element.childNodes.length === 1 && element.childNodes[0].nodeType === 3) {
                clone.textContent = element.textContent;
            } else {
                element.childNodes.forEach(child => {
                    if (child.nodeType === 1) {
                        clone.appendChild(deepCloneWithStyles(child, scaleFactor, heightScaleDivisor, depth + 1));
                    } else if (child.nodeType === 3) {
                        clone.appendChild(child.cloneNode(true));
                    }
                });
            }
            return clone;
        }

        // ===== Remove existing viewer =====
        document.getElementById('clean-viewer-container')?.remove();

        // ===== Create viewer container =====
        const viewerContainer = document.createElement('div');
        viewerContainer.id = 'clean-viewer-container';

        let successCount = 0;

        pages.forEach((page, index) => {
            const pc = page.querySelector('.pc');
            let width = 595.3;
            let height = 841.9;

            // Use getBoundingClientRect for actual rendered dimensions
            if (pc) {
                const rect = pc.getBoundingClientRect();
                if (rect.width > 10 && rect.height > 10) {
                    width = rect.width;
                    height = rect.height;
                }
            }

            const newPage = document.createElement('div');
            newPage.className = 'std-page';
            newPage.id = `page-${index + 1}`;
            newPage.setAttribute('data-page-number', index + 1);

            newPage.style.width = width + 'px';
            newPage.style.height = height + 'px';

            // Layer ảnh
            const originalImg = page.querySelector('img.bi') || page.querySelector('img');
            if (originalImg) {
                const bgLayer = document.createElement('div');
                bgLayer.className = 'layer-bg';
                const imgClone = originalImg.cloneNode(true);
                imgClone.style.cssText = 'width: 100%; height: 100%; object-fit: cover; object-position: top center';
                bgLayer.appendChild(imgClone);
                newPage.appendChild(bgLayer);
            }

            // Layer Text
            const originalPc = page.querySelector('.pc');
            if (originalPc) {
                const textLayer = document.createElement('div');
                textLayer.className = 'layer-text';
                const pcClone = deepCloneWithStyles(originalPc, SCALE_FACTOR, HEIGHT_SCALE_DIVISOR);

                pcClone.querySelectorAll('img').forEach(img => img.style.display = 'none');
                textLayer.appendChild(pcClone);
                newPage.appendChild(textLayer);
            }

            viewerContainer.appendChild(newPage);
            successCount++;
        });

        document.body.appendChild(viewerContainer);

        setTimeout(() => {
            window.print();
        }, 1000);

        return { success: true, message: 'PDF ready!', pageCount: successCount };

    } catch (error) {
        console.error('[StudoCu] Error:', error);
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
    console.log('[StudoCu Downloader] v' + manifest.version + ' loaded');
});
