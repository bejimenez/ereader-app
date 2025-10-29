const express = require('express');
const path = require('path');
const fs = require('fs').promises;
const sqlite3 = require('sqlite3').verbose();
const Fuse = require('fuse.js');
const session = require('express-session');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.static('public'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
    secret: 'secret-smut-collection',
    resave: false,
    saveUninitialized: true
}));

// Set view engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Serve static files from calibre library with proper MIME types
app.use('/calibre-library', express.static(path.join(__dirname, 'calibre-library'), {
    setHeaders: (res, filePath) => {
        if (filePath.endsWith('.epub')) {
            res.setHeader('Content-Type', 'application/epub+zip');
        } else if (filePath.endsWith('.pdf')) {
            res.setHeader('Content-Type', 'application/pdf');
        }
        // Enable CORS for ebook files
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    }
}));

// Database connection
let db;
const calibreDbPath = path.join(__dirname, 'calibre-library', 'metadata.db');

// Initialize database connection
async function initDatabase() {
    return new Promise((resolve, reject) => {
        // Check if Calibre database exists
        fs.access(calibreDbPath)
            .then(() => {
                db = new sqlite3.Database(calibreDbPath, sqlite3.OPEN_READONLY, (err) => {
                    if (err) {
                        console.error('Error opening database:', err);
                        reject(err);
                    } else {
                        console.log('Connected to Calibre database');
                        resolve();
                    }
                });
            })
            .catch(() => {
                console.log('Calibre database not found. Books will be loaded from directory.');
                resolve();
            });
    });
}

// Get books from Calibre database
async function getBooksFromDatabase() {
    return new Promise((resolve, reject) => {
        if (!db) {
            resolve([]);
            return;
        }

        const query = `
            SELECT 
                b.id,
                b.title,
                b.sort as title_sort,
                b.author_sort,
                b.pubdate,
                b.series_index,
                b.path,
                GROUP_CONCAT(DISTINCT a.name) as authors,
                GROUP_CONCAT(DISTINCT t.name) as tags,
                s.name as series,
                GROUP_CONCAT(DISTINCT d.format || ':' || d.name) as formats,
                c.text as comments,
                b.last_modified
            FROM books b
            LEFT JOIN books_authors_link bal ON b.id = bal.book
            LEFT JOIN authors a ON bal.author = a.id
            LEFT JOIN books_tags_link btl ON b.id = btl.book
            LEFT JOIN tags t ON btl.tag = t.id
            LEFT JOIN books_series_link bsl ON b.id = bsl.book
            LEFT JOIN series s ON bsl.series = s.id
            LEFT JOIN data d ON b.id = d.book
            LEFT JOIN comments c ON b.id = c.book
            WHERE d.format IN ('PDF', 'EPUB')
            GROUP BY b.id
            ORDER BY b.last_modified DESC
        `;

        db.all(query, [], (err, rows) => {
            if (err) {
                console.error('Database query error:', err);
                resolve([]);
            } else {
                const books = rows.map(row => {
                    const formats = {};
                    if (row.formats) {
                        row.formats.split(',').forEach(f => {
                            const [format, filename] = f.split(':');
                            // Construct the full file path with extension
                            const formatLower = format.toLowerCase();
                            formats[formatLower] = path.join(row.path, `${filename}.${formatLower}`);
                        });
                    }
                    
                    return {
                        id: row.id,
                        title: row.title,
                        authors: row.authors ? row.authors.split(',') : [],
                        tags: row.tags ? row.tags.split(',') : [],
                        series: row.series,
                        series_index: row.series_index,
                        formats: formats,
                        path: row.path,
                        comments: row.comments,
                        last_modified: row.last_modified,
                        cover: path.join(row.path, 'cover.jpg')
                    };
                });
                
                // Debug logging
                if (books.length > 0 && books[0].formats.epub) {
                    console.log('Sample EPUB path:', books[0].formats.epub);
                }
                
                resolve(books);
            }
        });
    });
}

// Routes
app.get('/', async (req, res) => {
    try {
        const books = await getBooksFromDatabase();
        res.render('index', { books });
    } catch (error) {
        console.error('Error loading books:', error);
        res.render('index', { books: [] });
    }
});

app.get('/api/books', async (req, res) => {
    try {
        const books = await getBooksFromDatabase();
        res.json(books);
    } catch (error) {
        console.error('Error fetching books:', error);
        res.status(500).json({ error: 'Failed to fetch books' });
    }
});

app.get('/api/search', async (req, res) => {
    const { q, author, tag, series } = req.query;
    
    try {
        let books = await getBooksFromDatabase();
        
        // Apply filters
        if (author) {
            books = books.filter(book => 
                book.authors.some(a => a.toLowerCase().includes(author.toLowerCase()))
            );
        }
        if (tag) {
            books = books.filter(book => 
                book.tags.some(t => t.toLowerCase().includes(tag.toLowerCase()))
            );
        }
        if (series) {
            books = books.filter(book => 
                book.series && book.series.toLowerCase().includes(series.toLowerCase())
            );
        }
        
        // Apply fuzzy search if query provided
        if (q) {
            const fuse = new Fuse(books, {
                keys: ['title', 'authors', 'tags', 'series'],
                threshold: 0.3
            });
            books = fuse.search(q).map(result => result.item);
        }
        
        res.json(books);
    } catch (error) {
        console.error('Search error:', error);
        res.status(500).json({ error: 'Search failed' });
    }
});

app.get('/reader/:bookId/:format', async (req, res) => {
    const { bookId, format } = req.params;
    
    try {
        const books = await getBooksFromDatabase();
        const book = books.find(b => b.id == bookId);
        
        if (!book || !book.formats[format]) {
            return res.status(404).send('Book not found');
        }
        
        const bookPath = path.join(__dirname, 'calibre-library', book.formats[format]);
        
        // Store current reading position in session
        if (!req.session.readingPositions) {
            req.session.readingPositions = {};
        }
        
        res.render('reader', { 
            book, 
            format, 
            bookPath: `/calibre-library/${book.formats[format]}`,
            position: req.session.readingPositions[bookId] || 0
        });
    } catch (error) {
        console.error('Reader error:', error);
        res.status(500).send('Error loading book');
    }
});

// Dedicated EPUB file serving endpoint
app.get('/epub/:bookId', async (req, res) => {
    const { bookId } = req.params;
    
    try {
        const books = await getBooksFromDatabase();
        const book = books.find(b => b.id == bookId);
        
        if (!book || !book.formats.epub) {
            return res.status(404).send('EPUB not found');
        }
        
        const epubPath = path.join(__dirname, 'calibre-library', book.formats.epub);
        
        // Check if file exists
        await fs.access(epubPath);
        
        // Set proper headers
        res.setHeader('Content-Type', 'application/epub+zip');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Cache-Control', 'public, max-age=3600');
        
        // Stream the file
        const fileStream = require('fs').createReadStream(epubPath);
        fileStream.pipe(res);
    } catch (error) {
        console.error('EPUB serving error:', error);
        res.status(500).send('Error serving EPUB file');
    }
});

app.post('/api/save-position', (req, res) => {
    const { bookId, position } = req.body;
    
    if (!req.session.readingPositions) {
        req.session.readingPositions = {};
    }
    
    req.session.readingPositions[bookId] = position;
    res.json({ success: true });
});

app.get('/api/stats', async (req, res) => {
    try {
        const books = await getBooksFromDatabase();
        const stats = {
            totalBooks: books.length,
            authors: [...new Set(books.flatMap(b => b.authors))].length,
            series: [...new Set(books.filter(b => b.series).map(b => b.series))].length,
            formats: {
                pdf: books.filter(b => b.formats.pdf).length,
                epub: books.filter(b => b.formats.epub).length
            }
        };
        res.json(stats);
    } catch (error) {
        console.error('Stats error:', error);
        res.status(500).json({ error: 'Failed to get stats' });
    }
});

// Diagnostic endpoint for EPUB files
app.get('/api/check-epub/:bookId', async (req, res) => {
    const { bookId } = req.params;
    
    try {
        const books = await getBooksFromDatabase();
        const book = books.find(b => b.id == bookId);
        
        if (!book) {
            return res.json({ error: 'Book not found' });
        }
        
        const result = {
            bookId: book.id,
            title: book.title,
            hasEpub: !!book.formats.epub,
            epubPath: book.formats.epub || null,
            fullPath: null,
            fileExists: false,
            fileSize: 0,
            error: null
        };
        
        if (book.formats.epub) {
            result.fullPath = path.join(__dirname, 'calibre-library', book.formats.epub);
            try {
                const stats = await fs.stat(result.fullPath);
                result.fileExists = true;
                result.fileSize = stats.size;
            } catch (error) {
                result.error = error.message;
            }
        }
        
        res.json(result);
    } catch (error) {
        console.error('Check EPUB error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Start server
async function startServer() {
    try {
        await initDatabase();
        app.listen(PORT, '0.0.0.0', () => {
            console.log(`E-Reader app running on http://0.0.0.0:${PORT}`);
            console.log(`Access from your phone at http://72.60.31.136:${PORT}`);
        });
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}

startServer();
