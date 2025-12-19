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

        updateStatus(`✅ Deleted ${count} cookies! Reloading page...`, 'success');
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

        if (!tab.url.includes('studocu.com') && !tab.url.includes('studocu.vn')) {
            throw new Error('Please go to a StudoCu document page first!');
        }

        updateStatus('Injecting print styles...', 'processing');

        // Inject print CSS
        await chrome.scripting.insertCSS({
            target: { tabId: tab.id },
            files: ["print.css"]
        });

        updateStatus('Processing pages...', 'processing');

        // Execute the main PDF creation script
        const results = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: createPDFViewer
        });

        if (results && results[0] && results[0].result) {
            const { success, message, pageCount } = results[0].result;
            if (success) {
                updateStatus(`✅ ${pageCount} pages ready! Print dialog opening...`, 'success');
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

// ==================== PDF VIEWER CREATION (Injected into page) ====================

function createPDFViewer() {
    try {
        // Find all page elements
        const pages = document.querySelectorAll('div[data-page-index]');

        if (pages.length === 0) {
            return {
                success: false,
                message: 'No pages found! Scroll down to load all content first.',
                pageCount: 0
            };
        }

        // Constants for scaling (from Studocu-Helper)
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

            // Copy normal properties
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

            // Transform origin
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

            // Reset transform for .pc elements
            if (element.classList && element.classList.contains('pc')) {
                clone.style.setProperty('transform', 'none', 'important');
                clone.style.setProperty('-webkit-transform', 'none', 'important');
                clone.style.setProperty('overflow', 'visible', 'important');
                clone.style.setProperty('max-width', 'none', 'important');
                clone.style.setProperty('max-height', 'none', 'important');
            }

            // Clone children
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

        // Remove existing viewer
        const existingViewer = document.getElementById('studocu-clean-viewer');
        if (existingViewer) existingViewer.remove();

        const viewerContainer = document.createElement('div');
        viewerContainer.id = 'studocu-clean-viewer';

        let successCount = 0;

        pages.forEach((page, index) => {
            const pc = page.querySelector('.pc');
            let width = 595.3;  // A4 width fallback
            let height = 841.9; // A4 height fallback

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

            // Create page container
            const newPage = document.createElement('div');
            newPage.className = 'std-page';
            newPage.id = `page-${index + 1}`;
            newPage.setAttribute('data-page-number', index + 1);
            newPage.style.width = width + 'px';
            newPage.style.height = height + 'px';

            // Layer 1: Background image
            const originalImg = page.querySelector('img.bi') || page.querySelector('img');
            if (originalImg) {
                const bgLayer = document.createElement('div');
                bgLayer.className = 'layer-bg';
                const imgClone = originalImg.cloneNode(true);
                imgClone.style.cssText = 'width: 100%; height: 100%; object-fit: cover; object-position: top center;';
                bgLayer.appendChild(imgClone);
                newPage.appendChild(bgLayer);
            }

            // Layer 2: Text layer (for selectable text in PDF)
            const originalPc = page.querySelector('.pc');
            if (originalPc) {
                const textLayer = document.createElement('div');
                textLayer.className = 'layer-text';
                const pcClone = deepCloneWithStyles(originalPc, SCALE_FACTOR, HEIGHT_SCALE_DIVISOR);

                // Hide images in text layer
                pcClone.querySelectorAll('img').forEach(img => img.style.display = 'none');

                textLayer.appendChild(pcClone);
                newPage.appendChild(textLayer);
            }

            viewerContainer.appendChild(newPage);
            successCount++;
        });

        // Add viewer to document
        document.body.appendChild(viewerContainer);

        // Trigger print dialog after short delay
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
    console.log('StudoCu Downloader popup loaded');
});
