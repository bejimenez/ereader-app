// Main library JavaScript
document.addEventListener('DOMContentLoaded', function() {
    let allBooks = [];
    let filteredBooks = [];
    let currentFilters = {
        search: '',
        author: '',
        series: '',
        tag: '',
        format: ''
    };

    // Elements
    const searchInput = document.getElementById('searchInput');
    const filterBtn = document.getElementById('filterBtn');
    const filterPanel = document.getElementById('filterPanel');
    const authorFilter = document.getElementById('authorFilter');
    const seriesFilter = document.getElementById('seriesFilter');
    const tagFilter = document.getElementById('tagFilter');
    const formatFilter = document.getElementById('formatFilter');
    const clearFilters = document.getElementById('clearFilters');
    const sortSelect = document.getElementById('sortSelect');
    const booksList = document.getElementById('booksList');
    const statsEl = document.getElementById('stats');

    // Load initial data
    loadBooks();
    loadStats();

    // Event listeners
    searchInput.addEventListener('input', debounce(handleSearch, 300));
    filterBtn.addEventListener('click', toggleFilterPanel);
    authorFilter.addEventListener('input', debounce(applyFilters, 300));
    seriesFilter.addEventListener('input', debounce(applyFilters, 300));
    tagFilter.addEventListener('input', debounce(applyFilters, 300));
    formatFilter.addEventListener('change', applyFilters);
    clearFilters.addEventListener('click', resetFilters);
    sortSelect.addEventListener('change', sortBooks);

    // Functions
    async function loadBooks() {
        try {
            const response = await fetch('/api/books');
            allBooks = await response.json();
            filteredBooks = [...allBooks];
            renderBooks(filteredBooks);
        } catch (error) {
            console.error('Error loading books:', error);
            showError('Failed to load books');
        }
    }

    async function loadStats() {
        try {
            const response = await fetch('/api/stats');
            const stats = await response.json();
            statsEl.innerHTML = `
                <span class="stat-item">📚 ${stats.totalBooks} books</span>
                <span class="stat-item">✍️ ${stats.authors} authors</span>
                <span class="stat-item">📖 ${stats.series} series</span>
                <span class="stat-item">PDF: ${stats.formats.pdf}</span>
                <span class="stat-item">EPUB: ${stats.formats.epub}</span>
            `;
        } catch (error) {
            console.error('Error loading stats:', error);
        }
    }

    async function handleSearch() {
        currentFilters.search = searchInput.value.trim();
        applyFilters();
    }

    async function applyFilters() {
        currentFilters.author = authorFilter.value.trim();
        currentFilters.series = seriesFilter.value.trim();
        currentFilters.tag = tagFilter.value.trim();
        currentFilters.format = formatFilter.value;

        if (!currentFilters.search && !currentFilters.author && 
            !currentFilters.series && !currentFilters.tag && !currentFilters.format) {
            filteredBooks = [...allBooks];
            renderBooks(filteredBooks);
            return;
        }

        try {
            const params = new URLSearchParams();
            if (currentFilters.search) params.append('q', currentFilters.search);
            if (currentFilters.author) params.append('author', currentFilters.author);
            if (currentFilters.series) params.append('series', currentFilters.series);
            if (currentFilters.tag) params.append('tag', currentFilters.tag);

            const response = await fetch(`/api/search?${params}`);
            let books = await response.json();

            // Apply format filter client-side
            if (currentFilters.format) {
                books = books.filter(book => book.formats[currentFilters.format]);
            }

            filteredBooks = books;
            renderBooks(filteredBooks);
        } catch (error) {
            console.error('Search error:', error);
            showError('Search failed');
        }
    }

    function sortBooks() {
        const sortBy = sortSelect.value;
        
        switch(sortBy) {
            case 'title':
                filteredBooks.sort((a, b) => a.title.localeCompare(b.title));
                break;
            case 'author':
                filteredBooks.sort((a, b) => {
                    const authorA = a.authors[0] || '';
                    const authorB = b.authors[0] || '';
                    return authorA.localeCompare(authorB);
                });
                break;
            case 'recent':
            default:
                filteredBooks.sort((a, b) => {
                    return new Date(b.last_modified) - new Date(a.last_modified);
                });
                break;
        }
        
        renderBooks(filteredBooks);
    }

    function renderBooks(books) {
        if (books.length === 0) {
            booksList.innerHTML = `
                <div class="no-books" style="grid-column: 1/-1;">
                    <p>📚 No books found</p>
                    <p>Try adjusting your search or filters</p>
                </div>
            `;
            return;
        }

        booksList.innerHTML = books.map(book => {
            const coverHtml = book.cover ? 
                `<img src="/calibre-library/${book.cover}" 
                      alt="${escapeHtml(book.title)}" 
                      loading="lazy"
                      onerror="this.onerror=null; this.parentElement.innerHTML='<div class=\\'default-cover\\'><span class=\\'book-title-cover\\'>${escapeHtml(book.title)}</span></div>';">` :
                `<div class="default-cover">
                    <span class="book-title-cover">${escapeHtml(book.title)}</span>
                </div>`;

            const authorsHtml = book.authors.length > 0 ? 
                `<p class="book-author">${escapeHtml(book.authors.join(', '))}</p>` : '';

            const seriesHtml = book.series ? 
                `<p class="book-series">${escapeHtml(book.series)} ${book.series_index ? `#${book.series_index}` : ''}</p>` : '';

            const formatsHtml = Object.keys(book.formats).map(format => 
                `<a href="/reader/${book.id}/${format}" class="format-btn ${format}">${format.toUpperCase()}</a>`
            ).join('');

            const tagsHtml = book.tags.length > 0 ? 
                `<div class="book-tags">
                    ${book.tags.slice(0, 3).map(tag => 
                        `<span class="tag">${escapeHtml(tag)}</span>`
                    ).join('')}
                </div>` : '';

            return `
                <div class="book-card" data-book-id="${book.id}">
                    <div class="book-cover">
                        ${coverHtml}
                    </div>
                    <div class="book-info">
                        <h3 class="book-title">${escapeHtml(book.title)}</h3>
                        ${authorsHtml}
                        ${seriesHtml}
                        <div class="book-formats">
                            ${formatsHtml}
                        </div>
                        ${tagsHtml}
                    </div>
                </div>
            `;
        }).join('');
    }

    function toggleFilterPanel() {
        filterPanel.classList.toggle('hidden');
    }

    function resetFilters() {
        searchInput.value = '';
        authorFilter.value = '';
        seriesFilter.value = '';
        tagFilter.value = '';
        formatFilter.value = '';
        currentFilters = {
            search: '',
            author: '',
            series: '',
            tag: '',
            format: ''
        };
        filteredBooks = [...allBooks];
        renderBooks(filteredBooks);
    }

    function showError(message) {
        const errorDiv = document.createElement('div');
        errorDiv.className = 'error-message';
        errorDiv.style.cssText = `
            position: fixed;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: #e74c3c;
            color: white;
            padding: 12px 24px;
            border-radius: 4px;
            z-index: 1000;
        `;
        errorDiv.textContent = message;
        document.body.appendChild(errorDiv);
        setTimeout(() => errorDiv.remove(), 3000);
    }

    function debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    function escapeHtml(text) {
        const map = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        };
        return text.replace(/[&<>"']/g, m => map[m]);
    }

    // Add touch swipe support for mobile
    let touchStartX = 0;
    let touchEndX = 0;

    booksList.addEventListener('touchstart', e => {
        touchStartX = e.changedTouches[0].screenX;
    });

    booksList.addEventListener('touchend', e => {
        touchEndX = e.changedTouches[0].screenX;
        handleSwipe();
    });

    function handleSwipe() {
        if (touchEndX < touchStartX - 50) {
            // Swipe left - could implement pagination here
        }
        if (touchEndX > touchStartX + 50) {
            // Swipe right - could implement pagination here
        }
    }
});
