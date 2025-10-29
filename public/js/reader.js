// Reader JavaScript
document.addEventListener('DOMContentLoaded', function() {
    // Global variables
    let book = null;
    let currentPage = 1;
    let totalPages = 1;
    let fontSize = 100;
    let currentTheme = 'light';
    let pdfDoc = null;
    let pageRendering = false;
    let pageNumPending = null;
    let scale = 1;

    // Elements
    const menuBtn = document.getElementById('menuBtn');
    const readerMenu = document.getElementById('readerMenu');
    const decreaseFont = document.getElementById('decreaseFont');
    const increaseFont = document.getElementById('increaseFont');
    const fontSizeValue = document.getElementById('fontSizeValue');
    const themeButtons = document.querySelectorAll('.theme-btn');
    const prevBtn = document.getElementById('prevBtn');
    const nextBtn = document.getElementById('nextBtn');
    const currentPageEl = document.getElementById('currentPage');
    const totalPagesEl = document.getElementById('totalPages');
    const progressFill = document.getElementById('progressFill');
    const loadingIndicator = document.getElementById('loadingIndicator');
    const contentArea = document.getElementById('contentArea');

    // Initialize based on format
    if (bookData.format === 'epub') {
        initEpubReader();
    } else if (bookData.format === 'pdf') {
        initPdfReader();
    }

    // Event Listeners
    menuBtn.addEventListener('click', toggleMenu);
    decreaseFont.addEventListener('click', () => changeFontSize(-10));
    increaseFont.addEventListener('click', () => changeFontSize(10));
    prevBtn.addEventListener('click', previousPage);
    nextBtn.addEventListener('click', nextPage);

    themeButtons.forEach(btn => {
        btn.addEventListener('click', () => changeTheme(btn.dataset.theme));
    });

    // Close menu when clicking outside
    document.addEventListener('click', (e) => {
        if (!readerMenu.contains(e.target) && !menuBtn.contains(e.target)) {
            readerMenu.classList.add('hidden');
        }
    });

    // EPUB Reader Functions
    async function initEpubReader() {
        loadingIndicator.classList.remove('hidden');
        
        console.log('Initializing EPUB reader...');
        console.log('Book path:', bookData.path);
        
        try {
            // Check if ePub is loaded
            if (typeof ePub === 'undefined') {
                throw new Error('EPUB.js library not loaded');
            }
            
            book = ePub(bookData.path);
            const viewer = document.getElementById('epubViewer');
            
            // Add error handling for book loading
            book.loaded.spine.catch(error => {
                console.error('Failed to load EPUB spine:', error);
                showError('Failed to load EPUB structure. The file may be corrupted.');
                loadingIndicator.classList.add('hidden');
            });
            
            const rendition = book.renderTo(viewer, {
                width: '100%',
                height: '100%',
                spread: 'none',
                flow: 'paginated',
                allowScriptedContent: true
            });

            // Add rendition error handling
            rendition.hooks.content.register(function(contents) {
                console.log('EPUB content loaded for:', contents.window.location.href);
            });

            // Apply saved position
            book.ready.then(() => {
                console.log('EPUB book ready, generating locations...');
                return book.locations.generate(1024);
            }).then(() => {
                console.log('Locations generated, displaying content...');
                if (bookData.savedPosition > 0) {
                    rendition.display(book.locations.cfiFromPercentage(bookData.savedPosition / 100));
                } else {
                    rendition.display();
                }
                loadingIndicator.classList.add('hidden');
            }).catch(error => {
                console.error('Error in EPUB ready/display:', error);
                // Try simpler display method
                rendition.display().then(() => {
                    console.log('Fallback display successful');
                    loadingIndicator.classList.add('hidden');
                }).catch(displayError => {
                    console.error('Display error:', displayError);
                    showError('Failed to render EPUB: ' + displayError.message);
                    loadingIndicator.classList.add('hidden');
                });
            });

            // Navigation
            rendition.on('relocated', function(location) {
                if (book.locations && book.locations.length()) {
                    const percent = book.locations.percentageFromCfi(location.start.cfi);
                    updateProgress(percent * 100);
                    savePosition(percent * 100);
                }
                currentPage = location.start.displayed.page || 1;
                totalPages = location.start.displayed.total || 1;
                currentPageEl.textContent = currentPage;
                totalPagesEl.textContent = totalPages;
            });

            // Error event
            rendition.on('error', function(error) {
                console.error('Rendition error:', error);
                showError('EPUB rendering error: ' + error.message);
            });

            // Touch navigation
            rendition.on('touchstart', handleTouchStart);
            rendition.on('touchend', handleTouchEnd);

            // Keyboard navigation
            document.addEventListener('keydown', (e) => {
                if (e.key === 'ArrowLeft') previousPage();
                if (e.key === 'ArrowRight') nextPage();
            });

            // Table of contents
            book.loaded.navigation.then(nav => {
                const tocContainer = document.getElementById('tocContainer');
                if (nav && nav.toc) {
                    const tocHtml = nav.toc.map(chapter => {
                        return `<div class="toc-item level-${chapter.level || 1}" data-href="${chapter.href}">
                            ${chapter.label}
                        </div>`;
                    }).join('');
                    tocContainer.innerHTML = tocHtml;

                    // TOC click handlers
                    tocContainer.querySelectorAll('.toc-item').forEach(item => {
                        item.addEventListener('click', () => {
                            rendition.display(item.dataset.href);
                            readerMenu.classList.add('hidden');
                        });
                    });
                }
            }).catch(error => {
                console.warn('Could not load TOC:', error);
            });

            // Flow mode toggle
            const flowSelect = document.getElementById('flowSelect');
            if (flowSelect) {
                flowSelect.addEventListener('change', (e) => {
                    rendition.flow(e.target.value);
                });
            }

            // Store rendition for navigation
            window.epubRendition = rendition;

        } catch (error) {
            console.error('Error initializing EPUB reader:', error);
            showError('Failed to initialize EPUB reader: ' + error.message);
            loadingIndicator.classList.add('hidden');
        }
    }

    // PDF Reader Functions
    async function initPdfReader() {
        loadingIndicator.classList.remove('hidden');
        
        try {
            const loadingTask = pdfjsLib.getDocument(bookData.path);
            pdfDoc = await loadingTask.promise;
            totalPages = pdfDoc.numPages;
            totalPagesEl.textContent = totalPages;

            // Set initial scale based on viewport
            const viewport = contentArea.getBoundingClientRect();
            const pageViewport = await getPageViewport(1);
            scale = Math.min(
                viewport.width / pageViewport.width,
                viewport.height / pageViewport.height
            ) * 0.95;

            // Load saved position or first page
            currentPage = Math.max(1, Math.floor((bookData.savedPosition / 100) * totalPages));
            await renderPdfPage(currentPage);
            
            loadingIndicator.classList.add('hidden');

            // Keyboard navigation
            document.addEventListener('keydown', (e) => {
                if (e.key === 'ArrowLeft') previousPage();
                if (e.key === 'ArrowRight') nextPage();
                if (e.key === 'ArrowUp') previousPage();
                if (e.key === 'ArrowDown') nextPage();
            });

            // Build TOC (if available)
            pdfDoc.getOutline().then(outline => {
                if (outline) {
                    buildPdfToc(outline);
                }
            });

        } catch (error) {
            console.error('Error loading PDF:', error);
            showError('Failed to load PDF file');
            loadingIndicator.classList.add('hidden');
        }
    }

    async function getPageViewport(pageNum) {
        const page = await pdfDoc.getPage(pageNum);
        return page.getViewport({ scale: 1 });
    }

    async function renderPdfPage(pageNum) {
        if (pageRendering) {
            pageNumPending = pageNum;
            return;
        }
        
        pageRendering = true;
        currentPage = pageNum;
        
        try {
            const page = await pdfDoc.getPage(pageNum);
            const canvas = document.getElementById('pdfCanvas');
            const context = canvas.getContext('2d');
            
            // Calculate scale to fit mobile screen
            const viewport = contentArea.getBoundingClientRect();
            const unscaledViewport = page.getViewport({ scale: 1 });
            const optimalScale = Math.min(
                viewport.width / unscaledViewport.width,
                viewport.height / unscaledViewport.height
            ) * 0.95;
            
            const scaledViewport = page.getViewport({ scale: optimalScale * (fontSize / 100) });
            
            canvas.height = scaledViewport.height;
            canvas.width = scaledViewport.width;

            const renderContext = {
                canvasContext: context,
                viewport: scaledViewport
            };
            
            await page.render(renderContext).promise;
            
            // Update navigation
            currentPageEl.textContent = pageNum;
            updateProgress((pageNum / totalPages) * 100);
            savePosition((pageNum / totalPages) * 100);
            
            // Update button states
            prevBtn.disabled = pageNum <= 1;
            nextBtn.disabled = pageNum >= totalPages;
            
        } catch (error) {
            console.error('Error rendering page:', error);
        }
        
        pageRendering = false;
        
        if (pageNumPending !== null) {
            renderPdfPage(pageNumPending);
            pageNumPending = null;
        }
    }

    function buildPdfToc(outline) {
        const tocContainer = document.getElementById('tocContainer');
        
        function buildTocItem(item, level = 1) {
            let html = '';
            
            if (item.title) {
                html += `<div class="toc-item level-${level}" data-dest="${JSON.stringify(item.dest)}">
                    ${item.title}
                </div>`;
            }
            
            if (item.items && item.items.length > 0) {
                item.items.forEach(subItem => {
                    html += buildTocItem(subItem, level + 1);
                });
            }
            
            return html;
        }
        
        let tocHtml = '';
        outline.forEach(item => {
            tocHtml += buildTocItem(item);
        });
        
        tocContainer.innerHTML = tocHtml;
        
        // Add click handlers
        tocContainer.querySelectorAll('.toc-item').forEach(item => {
            item.addEventListener('click', async () => {
                try {
                    const dest = JSON.parse(item.dataset.dest);
                    if (dest) {
                        const pageIndex = await pdfDoc.getPageIndex(dest[0]);
                        renderPdfPage(pageIndex + 1);
                        readerMenu.classList.add('hidden');
                    }
                } catch (error) {
                    console.error('Error navigating to TOC item:', error);
                }
            });
        });
    }

    // Navigation Functions
    function previousPage() {
        if (bookData.format === 'epub' && window.epubRendition) {
            window.epubRendition.prev();
        } else if (bookData.format === 'pdf' && currentPage > 1) {
            renderPdfPage(currentPage - 1);
        }
    }

    function nextPage() {
        if (bookData.format === 'epub' && window.epubRendition) {
            window.epubRendition.next();
        } else if (bookData.format === 'pdf' && currentPage < totalPages) {
            renderPdfPage(currentPage + 1);
        }
    }

    // UI Functions
    function toggleMenu() {
        readerMenu.classList.toggle('hidden');
    }

    function changeFontSize(delta) {
        fontSize = Math.max(50, Math.min(200, fontSize + delta));
        fontSizeValue.textContent = fontSize + '%';
        
        if (bookData.format === 'epub' && window.epubRendition) {
            window.epubRendition.themes.fontSize(fontSize + '%');
        } else if (bookData.format === 'pdf') {
            renderPdfPage(currentPage);
        }
    }

    function changeTheme(theme) {
        currentTheme = theme;
        document.body.className = `theme-${theme}`;
        
        // Update active button
        themeButtons.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.theme === theme);
        });
        
        if (bookData.format === 'epub' && window.epubRendition) {
            const themes = {
                light: { body: { background: '#ffffff', color: '#333333' }},
                sepia: { body: { background: '#f4ecd8', color: '#5c4b37' }},
                dark: { body: { background: '#1a1a1a', color: '#e0e0e0' }}
            };
            window.epubRendition.themes.override('body', themes[theme].body);
        }
    }

    function updateProgress(percent) {
        progressFill.style.width = percent + '%';
        currentPageEl.textContent = currentPage;
        totalPagesEl.textContent = totalPages;
    }

    async function savePosition(percent) {
        try {
            await fetch('/api/save-position', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    bookId: bookData.id,
                    position: percent
                })
            });
        } catch (error) {
            console.error('Error saving position:', error);
        }
    }

    function showError(message) {
        const errorDiv = document.createElement('div');
        errorDiv.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: #e74c3c;
            color: white;
            padding: 20px;
            border-radius: 8px;
            z-index: 1000;
        `;
        errorDiv.textContent = message;
        document.body.appendChild(errorDiv);
        setTimeout(() => errorDiv.remove(), 3000);
    }

    // Touch handling for swipe navigation
    let touchStartX = 0;
    let touchEndX = 0;

    function handleTouchStart(e) {
        touchStartX = e.changedTouches[0].screenX;
    }

    function handleTouchEnd(e) {
        touchEndX = e.changedTouches[0].screenX;
        handleSwipe();
    }

    function handleSwipe() {
        if (touchEndX < touchStartX - 50) {
            nextPage(); // Swipe left
        }
        if (touchEndX > touchStartX + 50) {
            previousPage(); // Swipe right
        }
    }

    // Add touch zones for easier navigation on mobile
    const touchZones = `
        <div class="touch-nav-zone prev"></div>
        <div class="touch-nav-zone next"></div>
    `;
    document.querySelector('.reader-container').insertAdjacentHTML('beforeend', touchZones);
    
    document.querySelector('.touch-nav-zone.prev').addEventListener('click', previousPage);
    document.querySelector('.touch-nav-zone.next').addEventListener('click', nextPage);

    // Fullscreen support
    document.addEventListener('dblclick', () => {
        if (document.fullscreenElement) {
            document.exitFullscreen();
            document.body.classList.remove('fullscreen');
        } else {
            document.documentElement.requestFullscreen();
            document.body.classList.add('fullscreen');
        }
    });
});
