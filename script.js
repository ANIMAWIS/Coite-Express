// Variável para armazenar produtos carregados da planilha
let products = [];
let lastRenderedProducts = [];
let currentUser = null;
let userFavorites = [];

const API_BASE = '/api';

// Cole aqui a URL pública da sua planilha.
// Aceita: 1) URL CSV de "Publicar na web" (export?format=csv) ou
// 2) endpoint gviz JSON: https://docs.google.com/spreadsheets/d/<ID>/gviz/tq?tqx=out:json&gid=0
const SHEET_URL = 'https://docs.google.com/spreadsheets/d/1UQKdwVzx5FQDiNB60wq0Pasj0oZUHeSzdOb0m1CaSWE/gviz/tq?tqx=out:json&gid=0';

// Parse simples de CSV (assume separador "," e sem vírgulas embutidas)
function parseCSV(text) {
    const lines = text.split(/\r?\n/).filter(l => l.trim());
    if (lines.length === 0) return [];
    const headers = lines.shift().split(',').map(h => h.trim().toLowerCase());
    return lines.map(line => {
        const cols = line.split(',');
        const obj = {};
        headers.forEach((h, i) => obj[h] = cols[i] ? cols[i].trim() : '');
        return obj;
    });
}

// Parse do formato gviz (Google Visualization) retornando array de objetos
function parseGviz(text) {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start === -1 || end === -1) return [];
    const json = JSON.parse(text.slice(start, end + 1));
    const cols = json.table.cols.map(c => (c.label || c.id || '').toLowerCase());
    return json.table.rows.map(r => {
        const obj = {};
        r.c.forEach((cell, i) => obj[cols[i] || `col${i}`] = cell && cell.v != null ? cell.v : '');
        return obj;
    });
}

// Normaliza e mapeia campos conhecidos para o formato usado pela UI
function mapSheetItem(item, index) {
    const get = (...keys) => {
        for (const k of keys) {
            if (k in item && item[k] !== '') return item[k];
        }
        return '';
    };

    const rawPrice = get('price', 'preço', 'preco', 'valor');
    const rawOriginal = get('originalprice', 'preço_original', 'preco_original', 'precooriginal');
    const discountRaw = get('discount', 'desconto');
    const availableRaw = get('disponible', 'disponivel', 'available', 'disponibilidade');
    const stockRaw = get('stock', 'estoque', 'quantidade');

    const normalizeBool = (v) => {
        if (v === null || v === undefined) return true;
        const s = String(v).trim().toLowerCase();
        if (s === '') return true;
        return ['1','true','yes','sim','y','available','disponible'].includes(s);
    };

    return {
        id: get('id') || index + 1,
        title: get('title', 'produto', 'nome') || '',
        price: parseFloat(String(rawPrice).replace(',', '.')) || 0,
        originalPrice: parseFloat(String(rawOriginal).replace(',', '.')) || null,
        store: get('store', 'loja') || 'Loja',
        category: (get('category', 'categoria') || 'geral').toLowerCase(),
        image: get('image', 'imagem') || 'https://via.placeholder.com/300',
        affiliateLink: get('affiliateLink', 'link', 'url') || '#',
        discount: parseInt(discountRaw) || 0,
        disponible: normalizeBool(availableRaw),
        stock: parseInt(stockRaw) || 0
    };
}

// Função para carregar produtos da planilha online (CSV ou gviz JSON)
async function fetchProductsFromSheet() {
    try {
        showLoading();
        if (!SHEET_URL) {
            console.error('SHEET_URL não está definida');
            hideLoading();
            return;
        }

        const res = await fetch(SHEET_URL);
        const contentType = res.headers.get('content-type') || '';
        const text = await res.text();

        let rows = [];
        if (contentType.includes('json') || SHEET_URL.includes('gviz') || SHEET_URL.includes('tqx=out:json')) {
            rows = parseGviz(text);
        } else {
            // assume CSV
            rows = parseCSV(text);
        }

        products = rows.map((item, index) => mapSheetItem(item, index));

        renderProducts();
        hideLoading();
    } catch (error) {
        console.error('Erro ao carregar produtos:', error);
        hideLoading();
    }
}

// Função para renderizar os produtos
function renderProducts(productsToRender = products) {
    const container = document.getElementById('products-container');
    container.innerHTML = '';
    lastRenderedProducts = productsToRender;

    showLoading();

    const visibleProducts = productsToRender.filter(product => product.disponible && product.stock > 0);
    const favoriteIds = new Set(userFavorites.map(favorite => String(favorite.productId)));

    setTimeout(() => { // Simulando tempo de carregamento para demonstração
        if (visibleProducts.length === 0) {
            container.innerHTML = '<div class="no-products">Nenhum produto disponível no momento. Ajuste os filtros ou verifique novamente mais tarde.</div>';
            hideLoading();
            return;
        }

        visibleProducts.forEach(product => {
            const badge = product.discount ? `<div class="discount-badge">-${product.discount}%</div>` : '';
            const stockInfo = `<p class="product-stock">Em estoque: ${product.stock}</p>`;
            const isFavorite = currentUser && favoriteIds.has(String(product.id));
            const favoriteButton = currentUser ? `
                <button class="favorite-button ${isFavorite ? 'active' : ''}" data-product-id="${product.id}" aria-pressed="${isFavorite}">
                    <i class="fas fa-heart"></i>
                    ${isFavorite ? 'Remover favorito' : 'Favoritar'}
                </button>
            ` : `
                <button class="favorite-button disabled" disabled>
                    <i class="fas fa-heart"></i>
                    Entre para favoritar
                </button>
            `;

            const productCard = `
                <div class="product-card">
                    ${badge}
                    <img src="${product.image}" alt="${product.title}" class="product-image">
                    <div class="product-info">
                        <h3 class="product-title">${product.title}</h3>
                        <div class="price-container">
                            <p class="product-price">R$ ${product.price.toFixed(2)}</p>
                            ${product.originalPrice ? `<p class="original-price">R$ ${product.originalPrice.toFixed(2)}</p>` : ''}
                        </div>
                        <p class="product-store">
                            <i class="fas fa-store"></i>
                            ${product.store}
                        </p>
                        ${stockInfo}
                        ${favoriteButton}
                        <a href="${product.affiliateLink}" target="_blank" class="buy-button">
                            <i class="fas fa-shopping-cart"></i>
                            Comprar agora
                        </a>
                    </div>
                </div>
            `;
            container.innerHTML += productCard;
        });

        hideLoading();
    }, 500);
}

function getAuthHeaders() {
    const token = localStorage.getItem('coiteAuthToken');
    return token ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' };
}

async function loadUserSession() {
    const token = localStorage.getItem('coiteAuthToken');
    if (!token) {
        currentUser = null;
        userFavorites = [];
        updateAuthUI();
        return;
    }

    try {
        const res = await fetch(`${API_BASE}/profile`, { headers: getAuthHeaders() });
        if (!res.ok) throw new Error('Sessão inválida');
        currentUser = await res.json();
        updateAuthUI();
        await loadFavorites();
    } catch (err) {
        localStorage.removeItem('coiteAuthToken');
        currentUser = null;
        userFavorites = [];
        updateAuthUI();
    }
}

function showAuthModal(mode) {
    const authModal = document.getElementById('auth-modal');
    const authTitle = document.getElementById('auth-title');
    const authSubmit = document.getElementById('auth-submit');
    const authSwitchText = document.getElementById('auth-switch-text');
    const authMessage = document.getElementById('auth-message');

    authModal.classList.remove('hidden');
    authMessage.textContent = '';
    authModal.dataset.mode = mode;

    if (mode === 'register') {
        authTitle.textContent = 'Criar nova conta';
        authSubmit.textContent = 'Cadastrar';
        authSwitchText.innerHTML = 'Já tem conta? <button type="button" class="link-button" id="switch-to-login">Entrar</button>';
    } else {
        authTitle.textContent = 'Entrar na sua conta';
        authSubmit.textContent = 'Entrar';
        authSwitchText.innerHTML = 'Não tem conta? <button type="button" class="link-button" id="switch-to-register">Cadastre-se</button>';
    }
}

function closeAuthModal() {
    document.getElementById('auth-modal').classList.add('hidden');
}

async function registerUser(username, password) {
    const res = await fetch(`${API_BASE}/register`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ username, password })
    });

    const data = await res.json();
    if (!res.ok) {
        throw new Error(data.message || 'Falha no cadastro.');
    }
    return data;
}

async function loginUser(username, password) {
    const res = await fetch(`${API_BASE}/login`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ username, password })
    });

    const data = await res.json();
    if (!res.ok) {
        throw new Error(data.message || 'Falha no login.');
    }
    localStorage.setItem('coiteAuthToken', data.token);
    currentUser = data.user;
    updateAuthUI();
    await loadFavorites();
    renderProducts(lastRenderedProducts.length ? lastRenderedProducts : products);
}

async function loadFavorites() {
    if (!currentUser) {
        userFavorites = [];
        updateFavoritesUI();
        return;
    }

    const res = await fetch(`${API_BASE}/favorites`, {
        method: 'GET',
        headers: getAuthHeaders()
    });
    if (!res.ok) {
        userFavorites = [];
        updateFavoritesUI();
        return;
    }

    userFavorites = await res.json();
    updateFavoritesUI();
}

async function addFavorite(product) {
    if (!currentUser) return;
    const res = await fetch(`${API_BASE}/favorites`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
            productId: product.id,
            title: product.title,
            store: product.store,
            price: product.price,
            affiliateLink: product.affiliateLink
        })
    });
    const data = await res.json();
    if (!res.ok) {
        throw new Error(data.message || 'Não foi possível salvar o favorito.');
    }
    await loadFavorites();
    renderProducts(lastRenderedProducts.length ? lastRenderedProducts : products);
}

async function removeFavorite(productId) {
    if (!currentUser) return;
    const res = await fetch(`${API_BASE}/favorites`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
        body: JSON.stringify({ productId })
    });
    const data = await res.json();
    if (!res.ok) {
        throw new Error(data.message || 'Não foi possível remover o favorito.');
    }
    await loadFavorites();
    renderProducts(lastRenderedProducts.length ? lastRenderedProducts : products);
}

function updateAuthUI() {
    const loginButton = document.getElementById('login-button');
    const registerButton = document.getElementById('register-button');
    const profileMenu = document.getElementById('profile-menu');
    const userName = document.getElementById('user-name');
    const favoriteCount = document.getElementById('favorite-count');
    const userDashboard = document.getElementById('user-dashboard');

    if (currentUser) {
        loginButton.classList.add('hidden');
        registerButton.classList.add('hidden');
        profileMenu.classList.remove('hidden');
        userName.textContent = `Olá, ${currentUser.username}`;
        favoriteCount.textContent = String(userFavorites.length);
        userDashboard.classList.remove('hidden');
    } else {
        loginButton.classList.remove('hidden');
        registerButton.classList.remove('hidden');
        profileMenu.classList.add('hidden');
        userDashboard.classList.add('hidden');
    }
}

function updateFavoritesUI() {
    const favoritesList = document.getElementById('favorites-list');
    const favoriteCount = document.getElementById('favorite-count');
    favoritesList.innerHTML = '';
    favoriteCount.textContent = String(userFavorites.length);

    if (!userFavorites.length) {
        favoritesList.innerHTML = '<p class="favorites-empty">Seus favoritos aparecerão aqui quando você salvar algum item.</p>';
        return;
    }

    userFavorites.forEach(item => {
        favoritesList.innerHTML += `
            <div class="favorite-item">
                <div>
                    <strong>${item.title}</strong>
                    <p>${item.store} · R$ ${Number(item.price).toFixed(2)}</p>
                </div>
                <button class="favorite-remove-button" data-product-id="${item.productId}">Remover</button>
            </div>
        `;
    });
}

function setAuthMessage(message, isError = true) {
    const authMessage = document.getElementById('auth-message');
    authMessage.textContent = message;
    authMessage.classList.toggle('error', isError);
}

// Função para filtrar produtos
function filterProducts() {
    // Seleciona checkboxes da seção "Lojas" (primeira .filter-section)
    const storeCheckboxes = Array.from(document.querySelectorAll('.filters .filter-section:nth-of-type(1) .filter-options input[type="checkbox"]'));
    const selectedStores = storeCheckboxes.filter(cb => cb.checked).map(cb => cb.value.toLowerCase());

    // Seleciona checkboxes da seção "Categoria" (segunda .filter-section)
    const categoryCheckboxes = Array.from(document.querySelectorAll('.filters .filter-section:nth-of-type(2) .filter-options input[type="checkbox"]'));
    const selectedCategories = categoryCheckboxes.filter(cb => cb.checked).map(cb => cb.value.toLowerCase());

    const selectedPrice = document.querySelector('input[name="price"]:checked')?.value;

    let filteredProducts = products;

    // Filtrar por loja
    if (selectedStores.length > 0 && !selectedStores.includes('todas')) {
        filteredProducts = filteredProducts.filter(product => 
            selectedStores.includes(product.store.toLowerCase()));
    }

    // Filtrar por categoria
    if (selectedCategories.length > 0) {
        filteredProducts = filteredProducts.filter(product => 
            selectedCategories.includes(product.category));
    }

    // Filtrar por preço
    if (selectedPrice) {
        const [min, max] = selectedPrice.split('-').map(Number);
        filteredProducts = filteredProducts.filter(product => {
            if (max) {
                return product.price >= min && product.price <= max;
            } else {
                return product.price >= min;
            }
        });
    }

    renderProducts(filteredProducts);
}

// Função para pesquisar produtos
function searchProducts() {
    const searchTerm = document.getElementById('search').value.toLowerCase();
    const filteredProducts = products.filter(product =>
        product.title.toLowerCase().includes(searchTerm) ||
        product.store.toLowerCase().includes(searchTerm)
    );
    renderProducts(filteredProducts);
}

// Funções de loading
function showLoading() {
    const loading = document.getElementById('loading-overlay');
    loading.classList.add('active');
}

function hideLoading() {
    const loading = document.getElementById('loading-overlay');
    loading.classList.remove('active');
}

// Função para ordenar produtos
function sortProducts(products, sortType) {
    switch (sortType) {
        case 'price-asc':
            return [...products].sort((a, b) => a.price - b.price);
        case 'price-desc':
            return [...products].sort((a, b) => b.price - a.price);
        case 'discount':
            return [...products].sort((a, b) => (b.discount || 0) - (a.discount || 0));
        default: // relevance - mantém a ordem original
            return products;
    }
}

// Event listeners
document.addEventListener('DOMContentLoaded', () => {
    loadUserSession();
    fetchProductsFromSheet();

    const filterInputs = document.querySelectorAll('.filter-options input');
    filterInputs.forEach(input => {
        input.addEventListener('change', filterProducts);
    });

    const searchInput = document.getElementById('search');
    let searchTimeout;
    searchInput.addEventListener('input', () => {
        clearTimeout(searchTimeout);
        showLoading();
        searchTimeout = setTimeout(searchProducts, 300);
    });

    const sortSelect = document.getElementById('sort-select');
    sortSelect.addEventListener('change', () => {
        const filteredProducts = products.filter(p => p.title.toLowerCase().includes(searchInput.value.toLowerCase()));
        const sortedProducts = sortProducts(filteredProducts, sortSelect.value);
        renderProducts(sortedProducts);
    });

    const filterToggle = document.getElementById('filter-toggle');
    const filtersPanel = document.getElementById('filters-panel');
    const closeFilters = document.getElementById('close-filters');
    filterToggle.addEventListener('click', () => {
        filtersPanel.classList.add('active');
        document.body.style.overflow = 'hidden';
    });

    closeFilters.addEventListener('click', () => {
        filtersPanel.classList.remove('active');
        document.body.style.overflow = '';
    });

    document.addEventListener('click', (e) => {
        if (window.innerWidth <= 768) {
            if (!filtersPanel.contains(e.target) && !filterToggle.contains(e.target) && filtersPanel.classList.contains('active')) {
                filtersPanel.classList.remove('active');
                document.body.style.overflow = '';
            }
        }
    });

    const loginButton = document.getElementById('login-button');
    const registerButton = document.getElementById('register-button');
    const logoutButton = document.getElementById('logout-button');
    const favoritesButton = document.getElementById('favorites-button');
    const refreshFavorites = document.getElementById('refresh-favorites');
    const authModal = document.getElementById('auth-modal');
    const authClose = document.getElementById('auth-close');
    const authForm = document.getElementById('auth-form');

    loginButton.addEventListener('click', () => showAuthModal('login'));
    registerButton.addEventListener('click', () => showAuthModal('register'));
    authClose.addEventListener('click', closeAuthModal);
    authModal.addEventListener('click', (event) => {
        if (event.target === authModal) {
            closeAuthModal();
        }
    });

    authForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const mode = authModal.dataset.mode || 'login';
        const username = document.getElementById('auth-username').value.trim();
        const password = document.getElementById('auth-password').value;
        setAuthMessage('');

        try {
            if (mode === 'register') {
                await registerUser(username, password);
                setAuthMessage('Cadastro realizado com sucesso! Faça login para continuar.', false);
                showAuthModal('login');
            } else {
                await loginUser(username, password);
                setAuthMessage('Login realizado com sucesso!', false);
                closeAuthModal();
            }
        } catch (error) {
            setAuthMessage(error.message || 'Erro ao processar formulário.');
        }
    });

    authModal.addEventListener('click', (event) => {
        if (event.target.matches('#switch-to-register')) {
            showAuthModal('register');
        }
        if (event.target.matches('#switch-to-login')) {
            showAuthModal('login');
        }
    });

    logoutButton.addEventListener('click', () => {
        localStorage.removeItem('coiteAuthToken');
        currentUser = null;
        userFavorites = [];
        updateAuthUI();
        renderProducts(lastRenderedProducts.length ? lastRenderedProducts : products);
    });

    favoritesButton.addEventListener('click', () => {
        document.getElementById('user-dashboard').scrollIntoView({ behavior: 'smooth' });
    });

    refreshFavorites.addEventListener('click', async () => {
        await loadFavorites();
    });

    const productsContainer = document.getElementById('products-container');
    productsContainer.addEventListener('click', async (event) => {
        const button = event.target.closest('.favorite-button');
        if (!button) return;
        const productId = button.dataset.productId;
        const product = products.find(item => String(item.id) === String(productId));
        if (!product) return;

        try {
            if (button.classList.contains('active')) {
                await removeFavorite(productId);
            } else {
                await addFavorite(product);
            }
        } catch (error) {
            console.error(error);
            alert(error.message || 'Erro ao atualizar favorito.');
        }
    });

    const favoritesList = document.getElementById('favorites-list');
    favoritesList.addEventListener('click', async (event) => {
        const removeButton = event.target.closest('.favorite-remove-button');
        if (!removeButton) return;
        const productId = removeButton.dataset.productId;
        try {
            await removeFavorite(productId);
        } catch (error) {
            console.error(error);
            alert(error.message || 'Erro ao remover favorito.');
        }
    });
});

// Menu responsivo
const hamburgerToggle = document.getElementById('hamburger-toggle');
const navLinks = document.getElementById('nav-links');

hamburgerToggle.addEventListener('click', () => {
    const isExpanded = hamburgerToggle.classList.toggle('active');
    navLinks.classList.toggle('active');
    hamburgerToggle.setAttribute('aria-expanded', isExpanded ? 'true' : 'false');
});

// Fecha o menu mobile ao clicar em um link
navLinks.addEventListener('click', (event) => {
    if (event.target.tagName === 'A' && navLinks.classList.contains('active')) {
        hamburgerToggle.classList.remove('active');
        navLinks.classList.remove('active');
        hamburgerToggle.setAttribute('aria-expanded', 'false');
    }
});
