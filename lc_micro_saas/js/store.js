const money = value => new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL"
}).format(Number(value || 0));

let store = null;
let products = [];
let cart = [];
let currentCategory = "Todos";
let searchTerm = "";
let selectedProduct = null;

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

function showToast(message) {
  const el = document.getElementById("publicToast");
  el.textContent = message;
  el.hidden = false;
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => el.hidden = true, 2200);
}

function setCheckoutMessage(message, type="error") {
  const el = document.getElementById("checkoutMessage");
  el.textContent = message;
  el.className = `form-message ${type}`;
  el.hidden = false;
}

function cartKey() {
  return store ? `lc_cart_${store.id}` : "lc_cart";
}

function saveCart() {
  localStorage.setItem(cartKey(), JSON.stringify(cart));
  renderCart();
}

function loadCart() {
  cart = JSON.parse(localStorage.getItem(cartKey()) || "[]");
  // remove stale products
  cart = cart.filter(item => products.some(p => p.id === item.id));
  renderCart();
}

function getProduct(id) {
  return products.find(p => p.id === id);
}

function addToCart(id, quantity=1) {
  const product = getProduct(id);
  if (!product) return;

  const existing = cart.find(item => item.id === id);
  if (existing) existing.qty += quantity;
  else cart.push({ id, qty: quantity });

  if (product.stock > 0) {
    const item = cart.find(item => item.id === id);
    item.qty = Math.min(item.qty, product.stock);
  }

  saveCart();
  showToast("Produto adicionado.");
}

function changeQty(id, delta) {
  const item = cart.find(item => item.id === id);
  const product = getProduct(id);
  if (!item || !product) return;

  item.qty += delta;
  if (product.stock > 0) item.qty = Math.min(item.qty, product.stock);
  if (item.qty <= 0) cart = cart.filter(i => i.id !== id);

  saveCart();
}

function removeFromCart(id) {
  cart = cart.filter(item => item.id !== id);
  saveCart();
}

function cartTotal() {
  return cart.reduce((sum, item) => {
    const product = getProduct(item.id);
    return sum + (product ? Number(product.price) * item.qty : 0);
  }, 0);
}

function renderStore() {
  document.title = `${store.name} | LC Commerce`;
  document.getElementById("publicStoreName").textContent = store.name;

  const wrap = document.getElementById("storeLogoWrap");
  if (store.logo_url) {
    wrap.innerHTML = `<img src="${store.logo_url}" alt="${escapeHtml(store.name)}">`;
  } else {
    const initials = store.name.split(/\s+/).slice(0,2).map(x => x[0]).join("").toUpperCase();
    wrap.innerHTML = `<span>${escapeHtml(initials || "LC")}</span>`;
  }
}

function renderFilters() {
  const categories = ["Todos", ...new Set(products.map(p => p.category).filter(Boolean))];
  const container = document.getElementById("publicFilters");
  container.innerHTML = categories.map(category => `
    <button class="public-filter ${category === currentCategory ? "active" : ""}" data-category="${escapeHtml(category)}">
      ${escapeHtml(category)}
    </button>
  `).join("");

  container.querySelectorAll(".public-filter").forEach(button => {
    button.addEventListener("click", () => {
      currentCategory = button.dataset.category;
      renderFilters();
      renderProducts();
    });
  });
}

function renderProducts() {
  const grid = document.getElementById("publicProductsGrid");
  const filtered = products.filter(product => {
    const catOk = currentCategory === "Todos" || product.category === currentCategory;
    const searchOk = !searchTerm || `${product.name} ${product.category || ""} ${product.description || ""}`
      .toLowerCase().includes(searchTerm);
    return catOk && searchOk;
  });

  if (!filtered.length) {
    grid.innerHTML = `<div class="empty-state">Nenhum produto encontrado.</div>`;
    return;
  }

  grid.innerHTML = filtered.map(product => `
    <article class="public-product-card">
      <div class="public-product-image" data-detail="${product.id}">
        ${product.image_url
          ? `<img src="${product.image_url}" alt="${escapeHtml(product.name)}">`
          : `<div class="image-placeholder">Sem imagem</div>`}
      </div>
      <div class="public-product-body">
        <small>${escapeHtml(product.category || "Produto")}</small>
        <h3>${escapeHtml(product.name)}</h3>
        <p>${escapeHtml(product.description || "")}</p>
        <div class="public-product-bottom">
          <strong>${money(product.price)}</strong>
          <button class="public-add-btn" data-add="${product.id}" ${product.stock === 0 ? "" : ""}>Adicionar</button>
        </div>
      </div>
    </article>
  `).join("");

  grid.querySelectorAll("[data-add]").forEach(button => {
    button.addEventListener("click", () => addToCart(button.dataset.add));
  });

  grid.querySelectorAll("[data-detail]").forEach(el => {
    el.addEventListener("click", () => openProductDetail(el.dataset.detail));
  });
}

function renderCart() {
  const container = document.getElementById("publicCartItems");
  const badge = document.getElementById("cartBadge");
  const totalItems = cart.reduce((sum,item) => sum + item.qty, 0);
  badge.textContent = totalItems;
  document.getElementById("publicCartTotal").textContent = money(cartTotal());

  if (!cart.length) {
    container.innerHTML = `<div class="empty-state">Seu carrinho está vazio.</div>`;
    return;
  }

  container.innerHTML = cart.map(item => {
    const product = getProduct(item.id);
    if (!product) return "";
    return `
      <div class="public-cart-item">
        ${product.image_url
          ? `<img src="${product.image_url}" alt="${escapeHtml(product.name)}">`
          : `<div class="image-placeholder">IMG</div>`}
        <div>
          <h4>${escapeHtml(product.name)}</h4>
          <small>${money(product.price)}</small>
          <div class="qty-line">
            <button data-minus="${product.id}">−</button>
            <strong>${item.qty}</strong>
            <button data-plus="${product.id}">+</button>
          </div>
        </div>
        <button class="cart-remove" data-remove="${product.id}">Excluir</button>
      </div>
    `;
  }).join("");

  container.querySelectorAll("[data-minus]").forEach(b => b.onclick = () => changeQty(b.dataset.minus,-1));
  container.querySelectorAll("[data-plus]").forEach(b => b.onclick = () => changeQty(b.dataset.plus,1));
  container.querySelectorAll("[data-remove]").forEach(b => b.onclick = () => removeFromCart(b.dataset.remove));
}

function openCart() {
  document.getElementById("publicBackdrop").hidden = false;
  document.getElementById("cartDrawer").classList.add("open");
  document.getElementById("cartDrawer").setAttribute("aria-hidden","false");
}

function closeCart() {
  document.getElementById("cartDrawer").classList.remove("open");
  document.getElementById("cartDrawer").setAttribute("aria-hidden","true");
  if (document.getElementById("productDetailModal").hidden) {
    document.getElementById("publicBackdrop").hidden = true;
  }
}

function openProductDetail(id) {
  selectedProduct = getProduct(id);
  if (!selectedProduct) return;

  document.getElementById("publicProductDetail").innerHTML = `
    <div class="detail-layout">
      <div class="detail-image">
        ${selectedProduct.image_url
          ? `<img src="${selectedProduct.image_url}" alt="${escapeHtml(selectedProduct.name)}">`
          : `<div class="image-placeholder">Sem imagem</div>`}
      </div>
      <div class="detail-copy">
        <p class="overline">${escapeHtml(selectedProduct.category || "Produto")}</p>
        <h2>${escapeHtml(selectedProduct.name)}</h2>
        <strong style="font-size:1.25rem">${money(selectedProduct.price)}</strong>
        <p>${escapeHtml(selectedProduct.description || "Sem descrição.")}</p>
        <p><strong>Estoque:</strong> ${selectedProduct.stock}</p>
        <div class="detail-actions">
          <input id="detailQty" type="number" min="1" max="${Math.max(selectedProduct.stock,1)}" value="1">
          <button id="detailAddBtn" class="btn btn-primary">Adicionar ao carrinho</button>
        </div>
      </div>
    </div>
  `;

  document.getElementById("detailAddBtn").onclick = () => {
    const qty = Math.max(1, Number(document.getElementById("detailQty").value || 1));
    addToCart(selectedProduct.id, qty);
    closeDetail();
  };

  document.getElementById("publicBackdrop").hidden = false;
  document.getElementById("productDetailModal").hidden = false;
}

function closeDetail() {
  document.getElementById("productDetailModal").hidden = true;
  if (!document.getElementById("cartDrawer").classList.contains("open")) {
    document.getElementById("publicBackdrop").hidden = true;
  }
}

async function checkout(event) {
  event.preventDefault();

  if (!cart.length) {
    setCheckoutMessage("Adicione pelo menos um produto ao carrinho.");
    return;
  }

  const customerName = document.getElementById("checkoutName").value.trim();
  const customerPhone = document.getElementById("checkoutPhone").value.trim();
  const cep = document.getElementById("checkoutCep").value.trim();
  const address = document.getElementById("checkoutAddress").value.trim();

  if (!customerName || customerPhone.replace(/\D/g,"").length < 10 || cep.replace(/\D/g,"").length !== 8 || !address) {
    setCheckoutMessage("Revise seus dados de entrega.");
    return;
  }

  if (!window.LC_SUPABASE_CONFIGURED || !window.lcSupabase) {
    setCheckoutMessage("A loja ainda não foi conectada ao banco de dados.");
    return;
  }

  const button = document.querySelector('#checkoutForm button[type="submit"]');
  button.disabled = true;
  button.textContent = "Registrando pedido...";

  const items = cart.map(item => ({
    product_id: item.id,
    quantity: item.qty
  }));

  const { data, error } = await lcSupabase.rpc("create_public_order", {
    p_store_id: store.id,
    p_customer_name: customerName,
    p_customer_phone: customerPhone,
    p_cep: cep,
    p_address: address,
    p_items: items
  });

  button.disabled = false;
  button.textContent = "Finalizar pelo WhatsApp";

  if (error) {
    console.error(error);
    setCheckoutMessage(error.message || "Não foi possível registrar o pedido.");
    return;
  }

  const result = Array.isArray(data) ? data[0] : data;
  const orderId = result?.order_id;
  const officialTotal = Number(result?.total ?? cartTotal());

  const lines = cart.map((item,index) => {
    const product = getProduct(item.id);
    return `${index+1}. ${product.name}\nQtd: ${item.qty}\nSubtotal: ${money(Number(product.price)*item.qty)}`;
  }).join("\n\n");

  const message =
`Olá! Acabei de fazer um pedido pela loja ${store.name}.

*PEDIDO #${String(orderId || "").slice(0,8)}*

${lines}

*TOTAL: ${money(officialTotal)}*

*ENTREGA*
Nome: ${customerName}
WhatsApp: ${customerPhone}
CEP: ${cep}
Endereço: ${address}

Gostaria de confirmar meu pedido.`;

  cart = [];
  saveCart();

  const whatsapp = String(store.whatsapp || "").replace(/\D/g,"");
  if (!whatsapp) {
    setCheckoutMessage("Pedido registrado! A loja ainda não configurou um WhatsApp.", "success");
    return;
  }

  window.location.href = `https://wa.me/${whatsapp.startsWith("55") ? whatsapp : "55"+whatsapp}?text=${encodeURIComponent(message)}`;
}

async function init() {
  if (!window.LC_SUPABASE_CONFIGURED || !window.lcSupabase) {
    document.getElementById("publicProductsGrid").innerHTML =
      `<div class="empty-state">Esta instalação da LC Commerce ainda não foi conectada ao Supabase.</div>`;
    return;
  }

  const slug = new URLSearchParams(window.location.search).get("slug");
  if (!slug) {
    document.getElementById("publicProductsGrid").innerHTML =
      `<div class="empty-state">Informe uma loja válida no endereço.</div>`;
    return;
  }

  const { data: storeData, error: storeError } = await lcSupabase
    .from("stores")
    .select("id,name,slug,whatsapp,logo_url")
    .eq("slug", slug)
    .single();

  if (storeError || !storeData) {
    document.getElementById("publicProductsGrid").innerHTML =
      `<div class="empty-state">Loja não encontrada.</div>`;
    return;
  }

  store = storeData;
  renderStore();

  const { data: productData, error: productError } = await lcSupabase
    .from("products")
    .select("id,name,description,category,price,stock,image_url")
    .eq("store_id", store.id)
    .eq("active", true)
    .order("created_at", { ascending: false });

  if (productError) {
    document.getElementById("publicProductsGrid").innerHTML =
      `<div class="empty-state">Não foi possível carregar os produtos.</div>`;
    return;
  }

  products = productData || [];
  loadCart();
  renderFilters();
  renderProducts();
}

document.getElementById("publicSearch").addEventListener("input", event => {
  searchTerm = event.target.value.trim().toLowerCase();
  renderProducts();
});
document.getElementById("cartBtn").addEventListener("click", openCart);
document.getElementById("closeCartBtn").addEventListener("click", closeCart);
document.getElementById("heroShopBtn").addEventListener("click", () => {
  document.getElementById("productsSection").scrollIntoView({ behavior:"smooth" });
});
document.getElementById("checkoutForm").addEventListener("submit", checkout);
document.getElementById("closeDetailModal").addEventListener("click", closeDetail);
document.getElementById("publicBackdrop").addEventListener("click", () => {
  closeCart();
  closeDetail();
});

init();