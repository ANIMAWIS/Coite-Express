// Variável para armazenar produtos carregados da planilha
let products = [];

// Função para carregar produtos da planilha online
async function fetchProductsFromSheet() {
    try {
        showLoading();
        const response = await fetch('https://sheetdb.io/api/v1/i0izzxhea9kft');
        const data = await response.json();
        
        // Mapear os dados da planilha para o formato esperado
        products = data.map((item, index) => ({
            id: item.id || index + 1,
            title: item.title || item.produto || '',
            price: parseFloat(item.price || item.preço || 0),
            originalPrice: parseFloat(item.originalPrice || item.preço_original || item.price),
            store: item.store || item.loja || 'Loja',
            category: (item.category || item.categoria || 'geral').toLowerCase(),
            image: item.image || item.imagem || 'https://via.placeholder.com/300',
            affiliateLink: item.affiliateLink || item.link || '#',
            discount: parseInt(item.discount || item.desconto || 0)
        }));
        
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
            const productCard = `
                <div class="product-card">
                    ${product.discount ? `<div class="discount-badge">-${product.discount}%</div>` : ''}
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

// Função para filtrar produtos
function filterProducts() {
    const selectedStores = Array.from(document.querySelectorAll('input[type="checkbox"]:checked'))
        .filter(checkbox => ['amazon', 'americanas', 'magazineluiza', 'aliexpress'].includes(checkbox.value))
        .map(checkbox => checkbox.value);

    const selectedCategories = Array.from(document.querySelectorAll('input[type="checkbox"]:checked'))
        .filter(checkbox => ['eletronicos', 'casa', 'moda', 'beleza'].includes(checkbox.value))
        .map(checkbox => checkbox.value);

    const selectedPrice = document.querySelector('input[name="price"]:checked')?.value;

    let filteredProducts = products;

    // Filtrar por loja
    if (selectedStores.length > 0) {
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