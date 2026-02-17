// Variável para armazenar produtos carregados da planilha
let products = [];

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

    showLoading();

    setTimeout(() => { // Simulando tempo de carregamento para demonstração
        productsToRender.forEach(product => {
            const availabilityLabel = (!product.disponible || product.stock <= 0) ? 'Indisponível' : `Em estoque: ${product.stock}`;
            const badge = product.discount ? `<div class="discount-badge">-${product.discount}%</div>` : '';
            const stockInfo = `<p class="product-stock">${availabilityLabel}</p>`;

            const action = (product.disponible && product.stock > 0) ? `
                <a href="${product.affiliateLink}" target="_blank" class="buy-button">
                    <i class="fas fa-shopping-cart"></i>
                    Comprar agora
                </a>
            ` : `
                <button class="buy-button disabled" disabled>
                    <i class="fas fa-ban"></i>
                    Indisponível
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
                        ${action}
                    </div>
                </div>
            `;
            container.innerHTML += productCard;
        });

        hideLoading();
    }, 500);
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
    // Carregar produtos da planilha online
    fetchProductsFromSheet();

    // Adicionar event listeners para filtros
    const filterInputs = document.querySelectorAll('.filter-options input');
    filterInputs.forEach(input => {
        input.addEventListener('change', filterProducts);
    });

    // Adicionar event listener para pesquisa
    const searchInput = document.getElementById('search');
    let searchTimeout;
    searchInput.addEventListener('input', () => {
        clearTimeout(searchTimeout);
        showLoading();
        searchTimeout = setTimeout(searchProducts, 300); // Debounce da pesquisa
    });

    // Adicionar event listener para ordenação
    const sortSelect = document.getElementById('sort-select');
    sortSelect.addEventListener('change', () => {
        const sortedProducts = sortProducts(
            products.filter(p => p.title.toLowerCase().includes(searchInput.value.toLowerCase())),
            sortSelect.value
        );
        renderProducts(sortedProducts);
    });

    // Controles do painel de filtros mobile
    const filterToggle = document.getElementById('filter-toggle');
    const filtersPanel = document.getElementById('filters-panel');
    const closeFilters = document.getElementById('close-filters');

    filterToggle.addEventListener('click', () => {
        filtersPanel.classList.add('active');
        document.body.style.overflow = 'hidden'; // Previne rolagem do body
    });

    closeFilters.addEventListener('click', () => {
        filtersPanel.classList.remove('active');
        document.body.style.overflow = ''; // Restaura rolagem do body
    });

    // Fecha os filtros ao clicar fora em dispositivos móveis
    document.addEventListener('click', (e) => {
        if (window.innerWidth <= 768) {
            if (!filtersPanel.contains(e.target) && !filterToggle.contains(e.target) && filtersPanel.classList.contains('active')) {
                filtersPanel.classList.remove('active');
                document.body.style.overflow = '';
            }
        }
    });
});

// Seleciona o botão e o menu
const hamburgerToggle = document.getElementById('hamburger-Toggle');
const navLinks = document.getElementById('nav-links');

// Adiciona um listener de evento de clique ao botão
hamburgerToggle.addEventListener('click', () => {
    //alterar display em none ou flex do menu hamburguer
    if (navLinks.style.display === 'none' || navLinks.style.display === '') {
        navLinks.style.display = 'flex';
    } else {
        navLinks.style.display = 'none';
    }

    // Alterna a classe 'active' no botão e no menu
    hamburgerToggle.classList.toggle('active');
    // Update accessible state
    const expanded = hamburgerToggle.classList.contains('active');
    hamburgerToggle.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    navLinks.classList.toggle('active');
});
