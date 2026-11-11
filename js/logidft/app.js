/*
 * LogiDFT - entry point.
 */
(function (root) {
    'use strict';
    const NS = root.LogiDFT;
    const doc = root.document;

    /** Replaces header images that fail to load with a text fallback (stored in data-fallback-html). */
    function setupImageFallbacks() {
        doc.querySelectorAll('img[data-fallback-html]').forEach(img => {
            const swap = () => {
                const tpl = doc.createElement('template');
                tpl.innerHTML = img.getAttribute('data-fallback-html');
                img.replaceWith(tpl.content);
            };
            img.addEventListener('error', swap, { once: true });
            if (img.complete && img.naturalWidth === 0 && img.getAttribute('src')) swap();
        });
    }

    function start() {
        setupImageFallbacks();
        NS.UI.init();
    }

    if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', start);
    else start();
})(window);
