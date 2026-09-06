const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const crypto = require('crypto');
const XLSX = require('xlsx');
const multer = require('multer');
const { createWorker } = require('tesseract.js');

const app = express();
const PORT = process.env.PORT || 7777;

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

app.use(express.json({ limit: '10mb' }));
app.use(express.static('public', { index: false }));

const dataDir = path.join(__dirname, 'data');
if (!require('fs').existsSync(dataDir)) {
    require('fs').mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(__dirname, 'data', 'finance.db');
const db = new sqlite3.Database(dbPath);

const tokens = {};
const hashPassword = (pw) => crypto.createHash('sha256').update(pw).digest('hex');

function authMiddleware(req, res, next) {
    const token = req.headers['authorization'];
    if (!token || !tokens[token]) return res.status(401).json({ error: 'Não autorizado' });
    req.userId = tokens[token];
    next();
}

// ── Database Init ──
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        icon TEXT DEFAULT 'fa-folder',
        color TEXT DEFAULT '#6366f1',
        FOREIGN KEY (user_id) REFERENCES users(id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS payment_methods (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        icon TEXT DEFAULT 'fa-credit-card',
        color TEXT DEFAULT '#10b981',
        FOREIGN KEY (user_id) REFERENCES users(id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS statuses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        color TEXT DEFAULT '#10b981',
        FOREIGN KEY (user_id) REFERENCES users(id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        description TEXT NOT NULL,
        amount REAL NOT NULL,
        date TEXT NOT NULL,
        category_id INTEGER,
        payment_method_id INTEGER,
        status_id INTEGER,
        FOREIGN KEY (user_id) REFERENCES users(id),
        FOREIGN KEY (category_id) REFERENCES categories(id),
        FOREIGN KEY (payment_method_id) REFERENCES payment_methods(id),
        FOREIGN KEY (status_id) REFERENCES statuses(id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        user_id INTEGER NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id)
    )`);

    // Default user
    db.get("SELECT id FROM users WHERE email = 'admin@admin.com'", (err, row) => {
        if (!row) {
            db.run("INSERT INTO users (name, email, password) VALUES (?, ?, ?)",
                ['Administrador', 'admin@admin.com', hashPassword('1234')], function(err) {
                    if (!err && this.lastID) {
                        const uid = this.lastID;
                        const cats = [
                            ['Moradia', 'fa-home', '#3b82f6'],
                            ['Alimentação', 'fa-utensils', '#10b981'],
                            ['Transporte', 'fa-car', '#f59e0b'],
                            ['Saúde', 'fa-heartbeat', '#ef4444'],
                            ['Lazer', 'fa-gamepad', '#8b5cf6'],
                            ['Outros', 'fa-ellipsis-h', '#6b7280']
                        ];
                        const pays = [
                            ['Pix', 'fa-bolt', '#10b981'],
                            ['Boleto', 'fa-barcode', '#3b82f6'],
                            ['Cartão de Crédito', 'fa-credit-card', '#8b5cf6'],
                            ['Cartão de Débito', 'fa-credit-card', '#f59e0b'],
                            ['Dinheiro', 'fa-money-bill', '#059669']
                        ];
                        const sts = [
                            ['Pago', '#10b981'],
                            ['Pendente', '#f59e0b']
                        ];
                        cats.forEach(c => db.run("INSERT INTO categories (user_id, name, icon, color) VALUES (?, ?, ?, ?)", [uid, ...c]));
                        pays.forEach(p => db.run("INSERT INTO payment_methods (user_id, name, icon, color) VALUES (?, ?, ?, ?)", [uid, ...p]));
                        sts.forEach(s => db.run("INSERT INTO statuses (user_id, name, color) VALUES (?, ?, ?)", [uid, ...s]));
                    }
                });
        }
    });
});

// ════════════════════════════════════
//  AUTH
// ════════════════════════════════════
app.post('/api/auth/register', (req, res) => {
    const { name, email, password } = req.body;
    if (!name || !email || !password) return res.status(400).json({ error: 'Preencha todos os campos' });

    db.get("SELECT id FROM users WHERE email = ?", [email], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (row) return res.status(400).json({ error: 'E-mail já cadastrado' });

        db.run("INSERT INTO users (name, email, password) VALUES (?, ?, ?)",
            [name, email, hashPassword(password)], function(err) {
                if (err) return res.status(500).json({ error: err.message });
                const uid = this.lastID;
                const token = crypto.randomUUID();
                tokens[token] = uid;

                // Default configs for new user
                const cats = [['Moradia','fa-home','#3b82f6'],['Alimentação','fa-utensils','#10b981'],['Transporte','fa-car','#f59e0b'],['Saúde','fa-heartbeat','#ef4444'],['Lazer','fa-gamepad','#8b5cf6'],['Outros','fa-ellipsis-h','#6b7280']];
                const pays = [['Pix','fa-bolt','#10b981'],['Boleto','fa-barcode','#3b82f6'],['Cartão de Crédito','fa-credit-card','#8b5cf6'],['Cartão de Débito','fa-credit-card','#f59e0b'],['Dinheiro','fa-money-bill','#059669']];
                const sts = [['Pago','#10b981'],['Pendente','#f59e0b']];
                cats.forEach(c => db.run("INSERT INTO categories (user_id, name, icon, color) VALUES (?,?,?,?)", [uid,...c]));
                pays.forEach(p => db.run("INSERT INTO payment_methods (user_id, name, icon, color) VALUES (?,?,?,?)", [uid,...p]));
                sts.forEach(s => db.run("INSERT INTO statuses (user_id, name, color) VALUES (?,?,?)", [uid,...s]));

                res.json({ token, user: { id: uid, name, email } });
            });
    });
});

app.post('/api/auth/login', (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Preencha todos os campos' });

    db.get("SELECT id, name, email FROM users WHERE email = ? AND password = ?",
        [email, hashPassword(password)], (err, row) => {
            if (err) return res.status(500).json({ error: err.message });
            if (!row) return res.status(401).json({ error: 'E-mail ou senha inválidos' });
            const token = crypto.randomUUID();
            tokens[token] = row.id;
            res.json({ token, user: { id: row.id, name: row.name, email: row.email } });
        });
});

// ════════════════════════════════════
//  GENERIC CRUD FACTORY
// ════════════════════════════════════
function createCrudRoutes(tableName, endpoint, fields) {
    app.get(`/api/${endpoint}`, authMiddleware, (req, res) => {
        db.all(`SELECT * FROM ${tableName} WHERE user_id = ? ORDER BY id`, [req.userId], (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(rows);
        });
    });

    app.post(`/api/${endpoint}`, authMiddleware, (req, res) => {
        const cols = fields.map(f => f.name);
        const vals = fields.map(f => req.body[f.name]);
        const placeholders = fields.map(() => '?').join(', ');
        const sql = `INSERT INTO ${tableName} (user_id, ${cols.join(', ')}) VALUES (?, ${placeholders})`;

        db.run(sql, [req.userId, ...vals], function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ id: this.lastID, user_id: req.userId, ...req.body });
        });
    });

    app.put(`/api/${endpoint}/:id`, authMiddleware, (req, res) => {
        const cols = fields.map(f => f.name);
        const vals = fields.map(f => req.body[f.name]);
        const setClause = cols.map(c => `${c} = ?`).join(', ');
        const sql = `UPDATE ${tableName} SET ${setClause} WHERE id = ? AND user_id = ?`;

        db.run(sql, [...vals, req.params.id, req.userId], function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ updated: this.changes > 0 });
        });
    });

    app.delete(`/api/${endpoint}/:id`, authMiddleware, (req, res) => {
        db.run(`DELETE FROM ${tableName} WHERE id = ? AND user_id = ?`, [req.params.id, req.userId], function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ deleted: this.changes > 0 });
        });
    });
}

createCrudRoutes('categories', 'categories', [{ name: 'name' }, { name: 'icon' }, { name: 'color' }]);
createCrudRoutes('payment_methods', 'payment-methods', [{ name: 'name' }, { name: 'icon' }, { name: 'color' }]);
createCrudRoutes('statuses', 'statuses', [{ name: 'name' }, { name: 'color' }]);

// ════════════════════════════════════
//  TRANSACTIONS
// ════════════════════════════════════
app.get('/api/transactions', authMiddleware, (req, res) => {
    db.all(`
        SELECT t.*, c.name as category_name, c.icon as category_icon, c.color as category_color,
               pm.name as payment_name, pm.icon as payment_icon, pm.color as payment_color,
               s.name as status_name, s.color as status_color
        FROM transactions t
        LEFT JOIN categories c ON t.category_id = c.id
        LEFT JOIN payment_methods pm ON t.payment_method_id = pm.id
        LEFT JOIN statuses s ON t.status_id = s.id
        WHERE t.user_id = ?
        ORDER BY t.date DESC
    `, [req.userId], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.get('/api/transactions/:id', authMiddleware, (req, res) => {
    db.get("SELECT * FROM transactions WHERE id = ? AND user_id = ?", [req.params.id, req.userId], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!row) return res.status(404).json({ error: 'Transação não encontrada' });
        res.json(row);
    });
});

app.post('/api/transactions', authMiddleware, (req, res) => {
    const { description, amount, date, category_id, payment_method_id, status_id } = req.body;
    db.run(
        "INSERT INTO transactions (user_id, description, amount, date, category_id, payment_method_id, status_id) VALUES (?, ?, ?, ?, ?, ?, ?)",
        [req.userId, description, amount, date, category_id, payment_method_id, status_id],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ id: this.lastID });
        });
});

app.put('/api/transactions/:id', authMiddleware, (req, res) => {
    const { description, amount, date, category_id, payment_method_id, status_id } = req.body;
    db.run(
        "UPDATE transactions SET description=?, amount=?, date=?, category_id=?, payment_method_id=?, status_id=? WHERE id=? AND user_id=?",
        [description, amount, date, category_id, payment_method_id, status_id, req.params.id, req.userId],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ updated: this.changes > 0 });
        });
});

app.delete('/api/transactions/:id', authMiddleware, (req, res) => {
    db.run("DELETE FROM transactions WHERE id = ? AND user_id = ?", [req.params.id, req.userId], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ deleted: this.changes > 0 });
    });
});

// ════════════════════════════════════
//  SUMMARY / STATS
// ════════════════════════════════════
function getDateFilter(period, customStart, customEnd) {
    const now = new Date();
    let startDate, endDate;
    switch (period) {
        case 'day':
            startDate = endDate = now.toISOString().split('T')[0]; break;
        case 'week': {
            const d = new Date(now); const day = d.getDay();
            const diff = d.getDate() - day + (day === 0 ? -6 : 1);
            d.setDate(diff); startDate = d.toISOString().split('T')[0];
            d.setDate(diff + 6); endDate = d.toISOString().split('T')[0]; break;
        }
        case 'month':
            startDate = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
            endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0]; break;
        case 'year':
            startDate = new Date(now.getFullYear(), 0, 1).toISOString().split('T')[0];
            endDate = new Date(now.getFullYear(), 11, 31).toISOString().split('T')[0]; break;
        case 'all':
            startDate = '2000-01-01'; endDate = '2099-12-31'; break;
        case 'custom':
            startDate = customStart; endDate = customEnd; break;
        default:
            startDate = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
            endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
    }
    return { startDate, endDate };
}

app.get('/api/summary', authMiddleware, (req, res) => {
    const { period, startDate, endDate } = req.query;
    const { startDate: start, endDate: end } = getDateFilter(period, startDate, endDate);

    db.all(`
        SELECT 
            SUM(CASE WHEN s.name = 'Pago' THEN t.amount ELSE 0 END) as total_pago,
            SUM(CASE WHEN s.name = 'Pendente' THEN t.amount ELSE 0 END) as total_pendente,
            COUNT(*) as total_transacoes,
            AVG(CASE WHEN s.name = 'Pago' THEN t.amount END) as media_pago
        FROM transactions t
        LEFT JOIN statuses s ON t.status_id = s.id
        WHERE t.user_id = ? AND t.date BETWEEN ? AND ?
    `, [req.userId, start, end], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ ...rows[0], period, startDate: start, endDate: end });
    });
});

app.get('/api/categories-stats', authMiddleware, (req, res) => {
    const { startDate, endDate } = req.query;
    let query = `SELECT c.name, c.icon, c.color, SUM(t.amount) as total, COUNT(*) as total_transacoes
        FROM transactions t LEFT JOIN categories c ON t.category_id = c.id
        WHERE t.user_id = ?`;
    const params = [req.userId];
    if (startDate && endDate) { query += " AND t.date BETWEEN ? AND ?"; params.push(startDate, endDate); }
    query += " GROUP BY c.name ORDER BY total DESC";

    db.all(query, params, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.get('/api/payment-stats', authMiddleware, (req, res) => {
    const { startDate, endDate } = req.query;
    let query = `SELECT pm.name, pm.icon, pm.color, SUM(t.amount) as total, COUNT(*) as total_transacoes
        FROM transactions t LEFT JOIN payment_methods pm ON t.payment_method_id = pm.id
        WHERE t.user_id = ?`;
    const params = [req.userId];
    if (startDate && endDate) { query += " AND t.date BETWEEN ? AND ?"; params.push(startDate, endDate); }
    query += " GROUP BY pm.name ORDER BY total DESC";

    db.all(query, params, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.get('/api/monthly-stats', authMiddleware, (req, res) => {
    const year = req.query.year || new Date().getFullYear();
    db.all(`
        SELECT strftime('%m', t.date) as month,
            SUM(CASE WHEN s.name = 'Pago' THEN t.amount ELSE 0 END) as total_pago,
            SUM(CASE WHEN s.name = 'Pendente' THEN t.amount ELSE 0 END) as total_pendente,
            COUNT(*) as total_transacoes
        FROM transactions t LEFT JOIN statuses s ON t.status_id = s.id
        WHERE t.user_id = ? AND strftime('%Y', t.date) = ?
        GROUP BY strftime('%m', t.date) ORDER BY month
    `, [req.userId, year.toString()], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// ════════════════════════════════════
//  BALANCE
// ════════════════════════════════════
app.get('/api/balance', authMiddleware, (req, res) => {
    db.get("SELECT value FROM settings WHERE key = 'balance' AND user_id = ?", [req.userId], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        const balance = row ? parseFloat(row.value) : 0;
        db.get(`SELECT COALESCE(SUM(t.amount), 0) as total FROM transactions t
            LEFT JOIN statuses s ON t.status_id = s.id
            WHERE t.user_id = ? AND s.name = 'Pendente'`, [req.userId], (err2, row2) => {
            if (err2) return res.status(500).json({ error: err2.message });
            res.json({ balance, totalPendente: row2 ? row2.total : 0, available: balance - (row2 ? row2.total : 0) });
        });
    });
});

app.put('/api/balance', authMiddleware, (req, res) => {
    const { balance } = req.body;
    db.run("INSERT OR REPLACE INTO settings (key, value, user_id) VALUES ('balance', ?, ?)",
        [balance.toString(), req.userId], function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ balance });
        });
});

// ════════════════════════════════════
//  EXPORT (Excel, CSV)
// ════════════════════════════════════
function getExportData(userId, cb) {
    db.all(`
        SELECT t.date as 'Data', t.description as 'Descrição', c.name as 'Categoria',
               pm.name as 'Forma de Pagamento', t.amount as 'Valor (R$)', s.name as 'Status'
        FROM transactions t
        LEFT JOIN categories c ON t.category_id = c.id
        LEFT JOIN payment_methods pm ON t.payment_method_id = pm.id
        LEFT JOIN statuses s ON t.status_id = s.id
        WHERE t.user_id = ? ORDER BY t.date DESC
    `, [userId], cb);
}

app.get('/api/export/excel', authMiddleware, (req, res) => {
    getExportData(req.userId, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(rows || []);
        ws['!cols'] = [{ wch: 12 }, { wch: 30 }, { wch: 15 }, { wch: 18 }, { wch: 15 }, { wch: 10 }];
        XLSX.utils.book_append_sheet(wb, ws, 'Transações');
        const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
        res.setHeader('Content-Disposition', 'attachment; filename="transacoes.xlsx"');
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.send(buf);
    });
});

app.get('/api/export/csv', authMiddleware, (req, res) => {
    getExportData(req.userId, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!rows || !rows.length) return res.send('Sem dados');
        const headers = Object.keys(rows[0]);
        const csv = [headers.join(';'), ...rows.map(r => headers.map(h => `"${String(r[h] || '').replace(/"/g, '""')}"`).join(';'))].join('\n');
        const bom = '\uFEFF';
        res.setHeader('Content-Disposition', 'attachment; filename="transacoes.csv"');
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.send(bom + csv);
    });
});

// ════════════════════════════════════
//  OCR - Extrair dados de imagem
// ════════════════════════════════════

function parseOCRText(text) {
    const result = {
        valor: null,
        data: null,
        estabelecimento: null,
        categoria_sugerida: null,
        forma_pagamento_sugerida: null,
        confianca: 'baixa',
        texto_completo: text,
        tipo_documento: null
    };

    if (!text || text.trim().length < 3) return result;

    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    const textLower = text.toLowerCase();

    // ── Detectar TIPO de documento ──
    if (/cupom|fiscal|nf[-\s]?e|nota fiscal|danfe|sat|ecf/i.test(text)) {
        result.tipo_documento = 'cupom_fiscal';
    } else if (/preço|preco|gôndola|gondola|prateleira|etiqueta|oferta|promoção/i.test(text) || /R\$\s*\d+[.,]\d{2}/.test(text)) {
        result.tipo_documento = 'preco_gondola';
    } else {
        result.tipo_documento = 'outro';
    }

    // ── 1. Extrair VALOR TOTAL ──
    const valorPatterns = [
        // Padrões de cupom fiscal / nota
        /(?:total|valor\s*(?:a\s*)?pagar|pagamento|quanto\s*receber|sub\s*total\s*(?:desconto|acréscimo)?\s*total|R\$|BRL)\s*[:\-]?\s*R?\$?\s*(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2}))/gi,
        // Padrão R$ genérico (pega o maior valor)
        /R\$\s*(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2}))/g,
        // Padrão de preço de gôndola (ex: 12,99 ou 1.299,99)
        /(?:preço|preco|por|custa|custa|R\$)\s*[:\-]?\s*(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2}))/gi,
        // Valor isolado no final de linha (típico de gôndola)
        /(\d{1,3}[.,]\d{2})\s*$/gm,
        // Padrão: item + preço (ex: "Arroz 12,99")
        /([A-ZÁÉÍÓÚÃÕÊÔ][a-záéíóúãõêô]+\s+(?:\d+[xX]?\s+)?(?:R\$\s*)?(\d{1,3}[.,]\d{2}))/g,
    ];

    let maxValue = 0;
    let foundValue = false;

    for (const pattern of valorPatterns) {
        let match;
        while ((match = pattern.exec(text)) !== null) {
            let valStr = match[1] || match[0];
            // Limpar e converter
            valStr = valStr.replace(/[R$\s]/gi, '').replace(/\./g, '').replace(',', '.');
            const val = parseFloat(valStr);
            if (!isNaN(val) && val > maxValue && val < 1000000) {
                maxValue = val;
                foundValue = true;
            }
        }
    }

    if (foundValue && maxValue > 0) {
        result.valor = maxValue;
        result.confianca = 'alta';
    }

    // ── 2. Extrair DATA ──
    const dataPatterns = [
        /(\d{2})[\/\-.](\d{2})[\/\-.](\d{4})/g,
        /(\d{2})[\/\-.](\d{2})[\/\-.](\d{2})/g,
    ];

    for (const pattern of dataPatterns) {
        const match = pattern.exec(text);
        if (match) {
            let [, d, m, y] = match;
            if (y.length === 2) y = '20' + y;
            if (parseInt(m) <= 12 && parseInt(d) <= 31 && parseInt(y) >= 2000 && parseInt(y) <= 2099) {
                result.data = `${y}-${m}-${d}`;
                break;
            }
        }
    }

    // ── 3. Extrair ESTABELECIMENTO ──
    const estabelecimentoPatterns = [
        /(?:razão\s*social|razao\s*social|estabelecimento|loja|mercado|supermercado|farmacia|farmácia|padaria|restaurante|bar|posto)\s*[:\-]?\s*(.+)/gi,
        /(?:CNPJ|CPF)\s*[:\-]?\s*[\d./\-]+\s*(.+)/gi,
    ];

    for (const pattern of estabelecimentoPatterns) {
        const match = pattern.exec(text);
        if (match && match[1] && match[1].trim().length > 2) {
            result.estabelecimento = match[1].trim().substring(0, 60);
            break;
        }
    }

    // Se não encontrou, pega as primeiras linhas significativas
    if (!result.estabelecimento && lines.length > 0) {
        const skipWords = ['nota fiscal', 'cupom', 'fiscal', 'cnpj', 'cpf', 'endereço', 'tel', 'telefone', 'número', 'numero', 'seq', 'item', 'cód', 'codigo', 'qtde', 'unidade'];
        for (const line of lines) {
            if (line.length > 3 && line.length < 60 && !skipWords.some(w => line.toLowerCase().includes(w))) {
                result.estabelecimento = line.substring(0, 60);
                break;
            }
        }
    }

    // ── 4. Sugerir CATEGORIA ──
    const categoriaMap = [
        { keywords: ['supermercado', 'mercado', 'hiper', 'atacadista', 'comercial', 'alimentos', 'hortifruti', 'acougue', 'açougue', 'padaria', 'confeitaria', 'mercadinho', 'minimercado'], cat: 'Alimentação' },
        { keywords: ['farmacia', 'farmácia', 'drogaria', 'saude', 'saúde', 'medicamento', 'hospital', 'clinica', 'clínica', 'laboratorio', 'drogasil', 'pacheco', 'droga raia'], cat: 'Saúde' },
        { keywords: ['posto', 'combustivel', 'combustível', 'gasolina', 'etanol', 'diesel', 'frete', 'uber', '99', 'taxi', 'passagem', 'estacionamento'], cat: 'Transporte' },
        { keywords: ['restaurante', 'lanchonete', 'bar', 'pizzaria', 'hamburgueria', 'sushi', 'delivery', 'ifood', 'rappi', 'cafeteria', 'café'], cat: 'Lazer' },
        { keywords: ['aluguel', 'condominio', 'condomínio', 'iptu', 'agua', 'água', 'luz', 'energia', 'gas', 'gás', 'internet', 'telefone', 'sabesp', 'cedae', 'enel', 'cpfl'], cat: 'Moradia' },
        { keywords: ['loja', 'magazine', 'casa', 'center', '-shopping', 'riachuelo', 'renner', 'zara', 'havan', 'amazon', 'mercadolivre'], cat: 'Outros' },
    ];

    for (const { keywords, cat } of categoriaMap) {
        if (keywords.some(k => textLower.includes(k))) {
            result.categoria_sugerida = cat;
            break;
        }
    }

    // Se for preço de gôndola e não achou categoria, sugerir Alimentação
    if (result.tipo_documento === 'preco_gondola' && !result.categoria_sugerida) {
        result.categoria_sugerida = 'Alimentação';
    }

    // ── 5. Detectar FORMA DE PAGAMENTO ──
    const pagamentoPatterns = [
        { regex: /pix/i, value: 'Pix' },
        { regex: /cartão\s*de\s*crédito|credito|crédito|visa|mastercard|elo|amex/i, value: 'Cartão de Crédito' },
        { regex: /cartão\s*de\s*débitito|débito/i, value: 'Cartão de Débito' },
        { regex: /dinheiro|cash|espécie/i, value: 'Dinheiro' },
        { regex: /boleto|boleto\s*bancário/i, value: 'Boleto' },
    ];

    for (const { regex, value } of pagamentoPatterns) {
        if (regex.test(text)) {
            result.forma_pagamento_sugerida = value;
            break;
        }
    }

    // ── 6. Ajustar confiança ──
    if (result.valor && result.data) result.confianca = 'alta';
    else if (result.valor) result.confianca = 'media';

    // Se é preço de gôndola (geralmente só tem valor), confiança alta se tem valor
    if (result.tipo_documento === 'preco_gondola' && result.valor) {
        result.confianca = 'alta';
    }

    return result;
}

app.post('/api/ocr', authMiddleware, upload.single('image'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'Nenhuma imagem enviada' });
        }

        const worker = await createWorker('por');
        const { data } = await worker.recognize(req.file.buffer);
        await worker.terminate();

        const ocrResult = parseOCRText(data.text);

        res.json({
            texto_extraido: data.text,
            confianca_ocr: data.confidence,
            dados: ocrResult
        });
    } catch (err) {
        console.error('Erro OCR:', err);
        res.status(500).json({ error: 'Erro ao processar imagem' });
    }
});

// ════════════════════════════════════
//  PAGES
// ════════════════════════════════════
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'login.html')));
app.get('/app', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Sistema rodando em http://localhost:${PORT}`);
    console.log(`📊 Banco de dados: ${dbPath}`);
});

process.on('SIGINT', () => { db.close(() => process.exit()); });
