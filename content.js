// ==================== StudoCu Downloader Pro - Content Script ====================
// Enhanced content script for better page detection and bypass

(function () {
    'use strict';

    // Prevent multiple injections
    if (window.__studocuDownloaderLoaded) return;
    window.__studocuDownloaderLoaded = true;

    console.log('[StudoCu Downloader Pro] Content script ready');

    // Remove blur on document pages
    function removeBlurEffects() {
        const style = document.createElement('style');
        style.id = 'studocu-downloader-style';
        style.textContent = `
            div[data-page-index],
            .pc, .bi, img.bi, .pf,
            #document-wrapper,
            .document-container {
                filter: none !important;
                -webkit-filter: none !important;
                opacity: 1 !important;
                visibility: visible !important;
            }
            
            #upgrade-overlay,
            .banner-wrapper,
            [class*="paywall"],
            [class*="blur-overlay"],
            [class*="premium-overlay"] {
                display: none !important;
                visibility: hidden !important;
                opacity: 0 !important;
            }
        `;
        
        if (!document.getElementById('studocu-downloader-style')) {
            (document.head || document.documentElement).appendChild(style);
        }
    }

    // Apply on load and observe for changes
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', removeBlurEffects);
    } else {
        removeBlurEffects();
    }

    // Re-apply periodically to counter dynamic content
    const observer = new MutationObserver(() => {
        removeBlurEffects();
    });

    observer.observe(document.documentElement, {
        childList: true,
        subtree: true
    });

    // Stop observing after 30 seconds to save resources
    setTimeout(() => {
        observer.disconnect();
    }, 30000);

})();
