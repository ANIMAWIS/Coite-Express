const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const XLSX = require('xlsx');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'coite-express-secret';
const dataDir = path.join(__dirname, 'data');
const usersFile = path.join(dataDir, 'users.xlsx');
const favoritesFile = path.join(dataDir, 'favorites.xlsx');

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

function ensureWorkbook(filePath, headers, sheetName) {
  if (!fs.existsSync(filePath)) {
    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.json_to_sheet([], { header: headers });
    workbook.SheetNames.push(sheetName);
    workbook.Sheets[sheetName] = sheet;
    XLSX.writeFile(workbook, filePath);
  }
}

function readRows(filePath, sheetName) {
  if (!fs.existsSync(filePath)) return [];
  const workbook = XLSX.readFile(filePath, { cellDates: true });
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) return [];
  return XLSX.utils.sheet_to_json(sheet, { defval: '' });
}

function writeRows(filePath, headers, data, sheetName) {
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.json_to_sheet(data, { header: headers });
  workbook.SheetNames.push(sheetName);
  workbook.Sheets[sheetName] = sheet;
  XLSX.writeFile(workbook, filePath);
}

function initDataFiles() {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  ensureWorkbook(usersFile, ['id', 'username', 'passwordHash', 'createdAt'], 'Users');
  ensureWorkbook(favoritesFile, ['id', 'userId', 'productId', 'title', 'store', 'price', 'affiliateLink', 'addedAt'], 'Favorites');
}

function generateId() {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function authenticateToken(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ message: 'Token não informado.' });
  }

  const token = authHeader.split(' ')[1];
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(401).json({ message: 'Token inválido.' });
    }
    req.user = user;
    next();
  });
}

app.get('/api/ping', (req, res) => {
  res.json({ status: 'ok' });
});

app.post('/api/register', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ message: 'Nome de usuário e senha são obrigatórios.' });
  }

  const users = readRows(usersFile, 'Users');
  const normalized = String(username).trim().toLowerCase();
  if (users.some(u => String(u.username).trim().toLowerCase() === normalized)) {
    return res.status(409).json({ message: 'Usuário já existe.' });
  }

  const passwordHash = await bcrypt.hash(String(password), 10);
  const newUser = {
    id: generateId(),
    username: String(username).trim(),
    passwordHash,
    createdAt: new Date().toISOString()
  };

  users.push(newUser);
  writeRows(usersFile, ['id', 'username', 'passwordHash', 'createdAt'], users, 'Users');

  res.json({ message: 'Cadastro realizado com sucesso.' });
});

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ message: 'Nome de usuário e senha são obrigatórios.' });
  }

  const users = readRows(usersFile, 'Users');
  const user = users.find(u => String(u.username).trim().toLowerCase() === String(username).trim().toLowerCase());
  if (!user) {
    return res.status(401).json({ message: 'Usuário ou senha inválidos.' });
  }

  const validPassword = await bcrypt.compare(String(password), String(user.passwordHash));
  if (!validPassword) {
    return res.status(401).json({ message: 'Usuário ou senha inválidos.' });
  }

  const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token, user: { id: user.id, username: user.username } });
});

app.get('/api/profile', authenticateToken, (req, res) => {
  res.json({ id: req.user.id, username: req.user.username });
});

app.get('/api/favorites', authenticateToken, (req, res) => {
  const favorites = readRows(favoritesFile, 'Favorites');
  const userFavorites = favorites.filter(item => String(item.userId) === String(req.user.id));
  res.json(userFavorites);
});

app.post('/api/favorites', authenticateToken, (req, res) => {
  const { productId, title, store, price, affiliateLink } = req.body;
  if (!productId || !title) {
    return res.status(400).json({ message: 'Produto inválido.' });
  }

  const favorites = readRows(favoritesFile, 'Favorites');
  const already = favorites.find(item => String(item.userId) === String(req.user.id) && String(item.productId) === String(productId));
  if (already) {
    return res.status(409).json({ message: 'Produto já está nos favoritos.' });
  }

  const favoriteItem = {
    id: generateId(),
    userId: req.user.id,
    productId: String(productId),
    title: String(title),
    store: String(store || ''),
    price: String(price || ''),
    affiliateLink: String(affiliateLink || ''),
    addedAt: new Date().toISOString()
  };

  favorites.push(favoriteItem);
  writeRows(favoritesFile, ['id', 'userId', 'productId', 'title', 'store', 'price', 'affiliateLink', 'addedAt'], favorites, 'Favorites');
  res.json({ message: 'Favorito adicionado.', favorite: favoriteItem });
});

app.delete('/api/favorites', authenticateToken, (req, res) => {
  const { productId } = req.body;
  if (!productId) {
    return res.status(400).json({ message: 'ID do produto é obrigatório.' });
  }

  const favorites = readRows(favoritesFile, 'Favorites');
  const filtered = favorites.filter(item => !(String(item.userId) === String(req.user.id) && String(item.productId) === String(productId)));

  writeRows(favoritesFile, ['id', 'userId', 'productId', 'title', 'store', 'price', 'affiliateLink', 'addedAt'], filtered, 'Favorites');
  res.json({ message: 'Favorito removido.' });
});

initDataFiles();
app.listen(PORT, () => {
  console.log(`Servidor iniciado em http://localhost:${PORT}`);
});
