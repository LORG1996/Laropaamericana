const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const multer = require('multer');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 3000;

// Ensure uploads directory exists
const uploadDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Multer config for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const name = Date.now() + '-' + Math.round(Math.random() * 1e9) + ext;
    cb(null, name);
  }
});
const upload = multer({ 
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    cb(null, allowed.includes(file.mimetype));
  }
});

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: 'ropa-americana-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 24 * 60 * 60 * 1000 } // 24 hours
}));

// SQLite Database
const db = new sqlite3.Database(path.join(__dirname, 'store.db'));

// Initialize database
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    display_name TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    price REAL NOT NULL,
    size TEXT NOT NULL,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    image_url TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (category_id) REFERENCES categories(id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS admins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL
  )`);

  // Insert default categories
    const defaultCategories = ['Camisetas', 'Pantalones', 'Vestidos', 'Chaquetas', 'Accesorios'];
  defaultCategories.forEach(cat => {
    db.run('INSERT OR IGNORE INTO categories (name, display_name) VALUES (?, ?)', 
      [cat.toLowerCase(), cat]);
  });

  // Insert default admin (username: 123, password: 123)
  bcrypt.hash('123', 10).then(hash => {
    db.run('INSERT OR IGNORE INTO admins (username, password_hash) VALUES (?, ?)', ['123', hash]);
  });
});

// Auth middleware
const requireAuth = (req, res, next) => {
  if (req.session.adminId) return next();
  res.status(401).json({ error: 'Unauthorized' });
};

// ===== PUBLIC API =====

// Get all categories
app.get('/api/categories', (req, res) => {
  db.all('SELECT * FROM categories ORDER BY display_name', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// Get products (with optional category filter)
app.get('/api/products', (req, res) => {
  const { category, status } = req.query;
  let sql = `SELECT p.*, c.name as category_name, c.display_name as category_display 
             FROM products p 
             JOIN categories c ON p.category_id = c.id`;
  const params = [];
  const conditions = [];
  
  if (category) {
    conditions.push('c.name = ?');
    params.push(category);
  }
  if (status) {
    conditions.push('p.status = ?');
    params.push(status);
  } else {
    conditions.push("p.status = 'active'"); // Only show active by default
  }
  
  if (conditions.length) sql += ' WHERE ' + conditions.join(' AND ');
  sql += ' ORDER BY p.created_at DESC';
  
  db.all(sql, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// Get single product
app.get('/api/products/:id', (req, res) => {
  db.get(`SELECT p.*, c.name as category_name, c.display_name as category_display 
          FROM products p 
          JOIN categories c ON p.category_id = c.id 
          WHERE p.id = ?`, [req.params.id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json(row);
  });
});

// ===== ADMIN API =====

// Login
app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body;
  db.get('SELECT * FROM admins WHERE username = ?', [username], async (err, admin) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!admin) return res.status(401).json({ error: 'Invalid credentials' });
    
    const valid = await bcrypt.compare(password, admin.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });
    
    req.session.adminId = admin.id;
    res.json({ success: true });
  });
});

// Logout
app.post('/api/admin/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

// Check auth
app.get('/api/admin/me', requireAuth, (req, res) => {
  res.json({ authenticated: true });
});

// Get all products (admin - includes inactive)
app.get('/api/admin/products', requireAuth, (req, res) => {
  db.all(`SELECT p.*, c.name as category_name, c.display_name as category_display 
          FROM products p 
          JOIN categories c ON p.category_id = c.id 
          ORDER BY p.created_at DESC`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// Create product
app.post('/api/admin/products', requireAuth, upload.single('image'), (req, res) => {
  const { category_id, name, price, size, status } = req.body;
  const image_url = req.file ? '/uploads/' + req.file.filename : null;
  
  db.run(`INSERT INTO products (category_id, name, price, size, status, image_url) 
          VALUES (?, ?, ?, ?, ?, ?)`,
    [category_id, name, price, size, status || 'active', image_url],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id: this.lastID, image_url });
    }
  );
});

// Update product
app.put('/api/admin/products/:id', requireAuth, upload.single('image'), (req, res) => {
  const { category_id, name, price, size, status } = req.body;
  const id = req.params.id;
  
  let sql = `UPDATE products SET category_id=?, name=?, price=?, size=?, status=?, updated_at=CURRENT_TIMESTAMP`;
  const params = [category_id, name, price, size, status];
  
  if (req.file) {
    sql += ', image_url=?';
    params.push('/uploads/' + req.file.filename);
  }
  sql += ' WHERE id=?';
  params.push(id);
  
  db.run(sql, params, function(err) {
    if (err) return res.status(500).json({ error: err.message });
    if (this.changes === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true });
  });
});

// Delete product
app.delete('/api/admin/products/:id', requireAuth, (req, res) => {
  // First get image to delete file
  db.get('SELECT image_url FROM products WHERE id = ?', [req.params.id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    
    db.run('DELETE FROM products WHERE id = ?', [req.params.id], function(err) {
      if (err) return res.status(500).json({ error: err.message });
      if (this.changes === 0) return res.status(404).json({ error: 'Not found' });
      
      // Delete image file if exists
      if (row?.image_url) {
        const filePath = path.join(__dirname, 'public', row.image_url);
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      }
      res.json({ success: true });
    });
  });
});

// Categories admin
app.get('/api/admin/categories', requireAuth, (req, res) => {
  db.all('SELECT * FROM categories ORDER BY display_name', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/api/admin/categories', requireAuth, (req, res) => {
  const { name, display_name } = req.body;
  db.run('INSERT INTO categories (name, display_name) VALUES (?, ?)', 
    [name.toLowerCase(), display_name], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ id: this.lastID });
  });
});

app.delete('/api/admin/categories/:id', requireAuth, (req, res) => {
  db.run('DELETE FROM categories WHERE id = ?', [req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

// Serve frontend
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
  console.log(`Admin panel: http://localhost:${PORT}/admin`);
  console.log(`Login: 123 / 123`);
});