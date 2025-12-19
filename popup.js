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
        // Get all StudoCu cookies using Chrome API
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

        // Reload the active tab
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
    const btn = document.getElementById('pdfBtn');
    setButtonState(btn, true, '⏳ Processing...');
    updateStatus('Analyzing document...', 'processing');

    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

        if (!tab.url.includes('studocu')) {
            throw new Error('Please go to a StudoCu document page first!');
        }

        // Step 1: Auto-scroll to load all pages
        updateStatus('📜 Auto-scrolling to load pages...', 'processing');

        const scrollResult = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: autoScrollDocument
        });

        if (scrollResult && scrollResult[0] && scrollResult[0].result) {
            const { pageCount } = scrollResult[0].result;
            updateStatus(`Found ${pageCount} pages. Processing...`, 'processing');
        }

        // Step 2: Inject print CSS
        await chrome.scripting.insertCSS({
            target: { tabId: tab.id },
            files: ["print.css"]
        });

        // Step 3: Create PDF viewer
        updateStatus('🔨 Building PDF...', 'processing');

        const results = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: createPDFViewer
        });

        if (results && results[0] && results[0].result) {
            const { success, message, pageCount } = results[0].result;
            if (success) {
                updateStatus(`✅ ${pageCount} pages ready! Opening print...`, 'success');
                setButtonState(btn, false, '✅ Done!');

                setTimeout(() => {
                    setButtonState(btn, false, '📄 Create PDF');
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
    }
});

// ==================== AUTO-SCROLL FUNCTION ====================

function autoScrollDocument() {
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
                // Scroll back to top
                window.scrollTo({ top: 0, behavior: 'smooth' });
                setTimeout(() => {
                    resolve({ success: true, pageCount: totalPages });
                }, 500);
                return;
            }

            pages[currentIndex].scrollIntoView({ behavior: 'smooth', block: 'center' });
            currentIndex++;

            setTimeout(scrollNext, 300);
        }

        scrollNext();
    });
}

// ==================== PDF VIEWER CREATION ====================

function createPDFViewer() {
    try {
        const pages = document.querySelectorAll('div[data-page-index]');

        if (pages.length === 0) {
            return {
                success: false,
                message: 'No pages found! Scroll down to load content first.',
                pageCount: 0
            };
        }

        const SCALE_FACTOR = 4;
        const HEIGHT_SCALE_DIVISOR = 4;

        // ==================== STYLE COPYING FUNCTIONS ====================

        function copyComputedStyle(source, target, scaleFactor, shouldScaleHeight = false, shouldScaleWidth = false) {
            const cs = window.getComputedStyle(source);

            const normalProps = [
                'position', 'left', 'top', 'bottom', 'right',
                'font-family', 'font-weight', 'font-style',
                'color', 'background-color',
                'text-align', 'white-space',
                'display', 'visibility', 'opacity', 'z-index',
                'text-shadow', 'unicode-bidi', 'font-feature-settings', 'padding'
            ];

            let styleString = '';

            normalProps.forEach(prop => {
                const value = cs.getPropertyValue(prop);
                if (value && value !== 'none' && value !== 'auto' && value !== 'normal') {
                    styleString += `${prop}: ${value} !important; `;
                }
            });

            // Handle width
            const widthValue = cs.getPropertyValue('width');
            if (widthValue && widthValue !== 'none' && widthValue !== 'auto') {
                if (shouldScaleWidth) {
                    const numValue = parseFloat(widthValue);
                    if (!isNaN(numValue) && numValue > 0) {
                        const unit = widthValue.replace(numValue.toString(), '');
                        styleString += `width: ${numValue / 4}${unit} !important; `;
                    }
                } else {
                    styleString += `width: ${widthValue} !important; `;
                }
            }

            // Handle height
            const heightValue = cs.getPropertyValue('height');
            if (heightValue && heightValue !== 'none' && heightValue !== 'auto') {
                if (shouldScaleHeight) {
                    const numValue = parseFloat(heightValue);
                    if (!isNaN(numValue) && numValue > 0) {
                        const unit = heightValue.replace(numValue.toString(), '');
                        styleString += `height: ${numValue / HEIGHT_SCALE_DIVISOR}${unit} !important; `;
                    }
                } else {
                    styleString += `height: ${heightValue} !important; `;
                }
            }

            // Handle margins with scaling
            ['margin-top', 'margin-right', 'margin-bottom', 'margin-left'].forEach(prop => {
                const value = cs.getPropertyValue(prop);
                if (value && value !== 'auto') {
                    const numValue = parseFloat(value);
                    if (!isNaN(numValue)) {
                        const shouldScaleMargin = source.tagName === 'SPAN' &&
                            source.classList &&
                            source.classList.contains('_') &&
                            Array.from(source.classList).some(cls => /^_(?:\d+[a-z]*|[a-z]+\d*)$/i.test(cls));

                        if (shouldScaleMargin && numValue !== 0) {
                            const unit = value.replace(numValue.toString(), '');
                            styleString += `${prop}: ${numValue / scaleFactor}${unit} !important; `;
                        } else {
                            styleString += `${prop}: ${value} !important; `;
                        }
                    }
                }
            });

            // Scale font-size and line-height
            ['font-size', 'line-height'].forEach(prop => {
                const value = cs.getPropertyValue(prop);
                if (value && value !== 'none' && value !== 'auto' && value !== 'normal') {
                    const numValue = parseFloat(value);
                    if (!isNaN(numValue) && numValue !== 0) {
                        const unit = value.replace(numValue.toString(), '');
                        styleString += `${prop}: ${numValue / scaleFactor}${unit} !important; `;
                    }
                }
            });

            const transformOrigin = cs.getPropertyValue('transform-origin');
            if (transformOrigin) {
                styleString += `transform-origin: ${transformOrigin} !important; `;
            }

            styleString += 'overflow: visible !important; max-width: none !important; max-height: none !important; clip: auto !important; clip-path: none !important; ';
            target.style.cssText += styleString;
        }

        function deepCloneWithStyles(element, scaleFactor, heightScaleDivisor, depth = 0) {
            const clone = element.cloneNode(false);
            const hasTextClass = element.classList && element.classList.contains('t');
            const hasUnderscoreClass = element.classList && element.classList.contains('_');

            copyComputedStyle(element, clone, scaleFactor, hasTextClass, hasUnderscoreClass);

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

        // ==================== BUILD CLEAN VIEWER ====================

        const existingViewer = document.getElementById('studocu-clean-viewer');
        if (existingViewer) existingViewer.remove();

        const viewerContainer = document.createElement('div');
        viewerContainer.id = 'studocu-clean-viewer';

        let successCount = 0;

        pages.forEach((page, index) => {
            const pc = page.querySelector('.pc');
            let width = 595.3;
            let height = 841.9;

            if (pc) {
                const pcStyle = window.getComputedStyle(pc);
                const pcWidth = parseFloat(pcStyle.width);
                const pcHeight = parseFloat(pcStyle.height);

                if (!isNaN(pcWidth) && pcWidth > 0 && !isNaN(pcHeight) && pcHeight > 0) {
                    width = pcWidth;
                    height = pcHeight;
                } else {
                    const rect = pc.getBoundingClientRect();
                    if (rect.width > 10 && rect.height > 10) {
                        width = rect.width;
                        height = rect.height;
                    }
                }
            }

            const newPage = document.createElement('div');
            newPage.className = 'std-page';
            newPage.id = `page-${index + 1}`;
            newPage.setAttribute('data-page-number', index + 1);
            newPage.style.width = width + 'px';
            newPage.style.height = height + 'px';

            // Background image layer
            const originalImg = page.querySelector('img.bi') || page.querySelector('img');
            if (originalImg) {
                const bgLayer = document.createElement('div');
                bgLayer.className = 'layer-bg';
                const imgClone = originalImg.cloneNode(true);
                imgClone.style.cssText = 'width: 100%; height: 100%; object-fit: cover; object-position: top center;';
                bgLayer.appendChild(imgClone);
                newPage.appendChild(bgLayer);
            }

            // Text layer
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
        }, 800);

        return {
            success: true,
            message: 'PDF ready!',
            pageCount: successCount
        };

    } catch (error) {
        console.error('PDF creation error:', error);
        return {
            success: false,
            message: error.message || 'Unknown error occurred',
            pageCount: 0
        };
    }
}

// ==================== INIT ====================
document.addEventListener('DOMContentLoaded', () => {
    // Load version from manifest.json
    const manifest = chrome.runtime.getManifest();
    const versionEl = document.getElementById('versionText');
    if (versionEl && manifest.version) {
        versionEl.textContent = 'v' + manifest.version;
    }
    console.log('StudoCu Downloader v' + manifest.version + ' loaded');
});
