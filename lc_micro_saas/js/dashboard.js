const money = value => new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL"
}).format(Number(value || 0));

let currentUser = null;
let currentStore = null;
let products = [];
let orders = [];
let editingProduct = null;

const configWarning = document.getElementById("configWarning");
if (!window.LC_SUPABASE_CONFIGURED) configWarning.hidden = false;

function toast(message) {
  const el = document.getElementById("toast");
  el.textContent = message;
  el.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.hidden = true, 2300);
}

function setFormMessage(id, message, type = "error") {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = message;
  el.className = `form-message ${type}`;
  el.hidden = false;
}

function clearFormMessage(id) {
  const el = document.getElementById(id);
  if (el) el.hidden = true;
}

function slugify(text) {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function publicStoreUrl() {
  if (!currentStore) return "";
  const base = `${window.location.origin}${window.location.pathname.replace(/dashboard\.html$/, "")}`;
  return `${base}loja.html?slug=${encodeURIComponent(currentStore.slug)}`;
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast("Link copiado.");
  } catch {
    prompt("Copie o link:", text);
  }
}

async function requireAuth() {
  if (!window.LC_SUPABASE_CONFIGURED || !window.lcSupabase) return false;

  const { data: { session } } = await lcSupabase.auth.getSession();
  if (!session) {
    window.location.href = "index.html";
    return false;
  }

  currentUser = session.user;
  document.getElementById("userEmail").textContent = currentUser.email || "";
  return true;
}

async function loadProfileAndStore() {
  const { data: profile } = await lcSupabase
    .from("profiles")
    .select("*")
    .eq("id", currentUser.id)
    .single();

  const { data: store, error } = await lcSupabase
    .from("stores")
    .select("*")
    .eq("owner_id", currentUser.id)
    .single();

  if (error || !store) {
    toast("Não foi possível carregar a loja.");
    return;
  }

  currentStore = store;
  const name = profile?.full_name || currentUser.user_metadata?.full_name || "Lojista";
  document.getElementById("userName").textContent = name;
  document.getElementById("welcomeName").textContent = name.split(" ")[0];
  document.getElementById("userAvatar").textContent = name.split(/\s+/).slice(0,2).map(x => x[0]).join("").toUpperCase();
  document.getElementById("previewStoreName").textContent = currentStore.name;

  fillSettings();
  updatePublicLinks();
}

async function loadProducts() {
  if (!currentStore) return;
  const { data, error } = await lcSupabase
    .from("products")
    .select("*")
    .eq("store_id", currentStore.id)
    .order("created_at", { ascending: false });

  if (error) {
    toast("Erro ao carregar produtos.");
    return;
  }

  products = data || [];
  renderProductsAdmin();
  updateStats();
}

async function loadOrders() {
  if (!currentStore) return;
  const { data, error } = await lcSupabase
    .from("orders")
    .select("*, order_items(*)")
    .eq("store_id", currentStore.id)
    .order("created_at", { ascending: false });

  if (error) {
    toast("Erro ao carregar pedidos.");
    return;
  }

  orders = data || [];
  renderOrders();
  renderRecentOrders();
  updateStats();
}

function updateStats() {
  document.getElementById("statProducts").textContent = products.length;
  document.getElementById("statOrders").textContent = orders.length;
  document.getElementById("statPending").textContent = orders.filter(o => o.status === "pending").length;

  const revenue = orders
    .filter(o => o.status !== "cancelled")
    .reduce((sum, o) => sum + Number(o.total || 0), 0);

  document.getElementById("statRevenue").textContent = money(revenue);
}

function renderRecentOrders() {
  const container = document.getElementById("recentOrders");
  if (!orders.length) {
    container.innerHTML = `<div class="empty-state">Nenhum pedido ainda.</div>`;
    return;
  }

  container.innerHTML = orders.slice(0,5).map(order => `
    <div class="recent-order">
      <div>
        <strong>${escapeHtml(order.customer_name)}</strong>
        <small>#${order.id.slice(0,8)} • ${new Date(order.created_at).toLocaleDateString("pt-BR")}</small>
      </div>
      <div style="text-align:right">
        <strong>${money(order.total)}</strong>
        <span class="status-badge status-${order.status}">${statusLabel(order.status)}</span>
      </div>
    </div>
  `).join("");
}

function renderProductsAdmin() {
  const grid = document.getElementById("productsAdminGrid");
  const term = document.getElementById("productSearch").value.trim().toLowerCase();
  const filtered = products.filter(p =>
    !term || `${p.name} ${p.category || ""}`.toLowerCase().includes(term)
  );

  document.getElementById("productCountLabel").textContent =
    `${products.length} ${products.length === 1 ? "produto" : "produtos"}`;

  if (!filtered.length) {
    grid.innerHTML = `<div class="empty-state">Nenhum produto encontrado.</div>`;
    return;
  }

  grid.innerHTML = filtered.map(product => `
    <article class="admin-product-card">
      <div class="admin-product-image">
        ${product.image_url
          ? `<img src="${product.image_url}" alt="${escapeHtml(product.name)}">`
          : `<div class="image-placeholder">Sem imagem</div>`}
      </div>
      <div class="admin-product-body">
        <small class="overline">${escapeHtml(product.category || "Sem categoria")}</small>
        <h3>${escapeHtml(product.name)}</h3>
        <div class="admin-product-meta">
          <strong>${money(product.price)}</strong>
          <span>Estoque: ${product.stock}</span>
        </div>
        <div class="admin-card-actions">
          <button class="btn btn-outline" onclick="editProduct('${product.id}')">Editar</button>
          <button class="btn btn-outline" onclick="deleteProduct('${product.id}')">Excluir</button>
        </div>
      </div>
    </article>
  `).join("");
}

function renderOrders() {
  const list = document.getElementById("ordersList");
  const filter = document.getElementById("orderStatusFilter").value;
  const filtered = orders.filter(o => filter === "all" || o.status === filter);

  if (!filtered.length) {
    list.innerHTML = `<div class="empty-state">Nenhum pedido encontrado.</div>`;
    return;
  }

  list.innerHTML = filtered.map(order => `
    <article class="order-card">
      <div class="order-card-head">
        <div>
          <h3>Pedido #${order.id.slice(0,8)}</h3>
          <p>${new Date(order.created_at).toLocaleString("pt-BR")}</p>
        </div>
        <span class="status-badge status-${order.status}">${statusLabel(order.status)}</span>
      </div>

      <div class="order-details-grid">
        <div class="order-detail">
          <small>Cliente</small>
          <strong>${escapeHtml(order.customer_name)}</strong>
          <div>${escapeHtml(order.customer_phone)}</div>
        </div>
        <div class="order-detail">
          <small>Entrega</small>
          <strong>${escapeHtml(order.cep || "")}</strong>
          <div>${escapeHtml(order.address)}</div>
        </div>
        <div class="order-detail">
          <small>Total</small>
          <strong>${money(order.total)}</strong>
        </div>
      </div>

      <div class="order-items">
        ${(order.order_items || []).map(item => `
          <div class="order-item-line">
            <span>${item.quantity}x ${escapeHtml(item.product_name)}</span>
            <strong>${money(item.subtotal)}</strong>
          </div>
        `).join("")}
      </div>

      <div class="order-actions">
        <select class="select-input" onchange="updateOrderStatus('${order.id}', this.value)">
          ${["pending","confirmed","shipped","completed","cancelled"].map(status =>
            `<option value="${status}" ${order.status === status ? "selected" : ""}>${statusLabel(status)}</option>`
          ).join("")}
        </select>
      </div>
    </article>
  `).join("");
}

function statusLabel(status) {
  return ({
    pending: "Pendente",
    confirmed: "Confirmado",
    shipped: "Enviado",
    completed: "Concluído",
    cancelled: "Cancelado"
  })[status] || status;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

function openProductModal(product = null) {
  editingProduct = product;
  clearFormMessage("productFormMessage");

  document.getElementById("productModalTitle").textContent = product ? "Editar produto" : "Novo produto";
  document.getElementById("productId").value = product?.id || "";
  document.getElementById("productName").value = product?.name || "";
  document.getElementById("productCategory").value = product?.category || "";
  document.getElementById("productDescription").value = product?.description || "";
  document.getElementById("productPrice").value = product?.price ?? "";
  document.getElementById("productStock").value = product?.stock ?? 0;
  document.getElementById("productImage").value = "";
  document.getElementById("productActive").checked = product?.active ?? true;

  document.getElementById("modalBackdrop").hidden = false;
  document.getElementById("productModal").hidden = false;
}

function closeProductModal() {
  document.getElementById("modalBackdrop").hidden = true;
  document.getElementById("productModal").hidden = true;
}

window.editProduct = function(id) {
  const product = products.find(p => p.id === id);
  if (product) openProductModal(product);
};

window.deleteProduct = async function(id) {
  const product = products.find(p => p.id === id);
  if (!product || !confirm(`Excluir "${product.name}"?`)) return;

  const { error } = await lcSupabase.from("products").delete().eq("id", id);
  if (error) {
    toast("Não foi possível excluir o produto.");
    return;
  }

  toast("Produto excluído.");
  await loadProducts();
};

async function uploadImage(file, folder = currentUser.id) {
  if (!file) return null;
  const extension = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const path = `${folder}/${crypto.randomUUID()}.${extension}`;

  const { error } = await lcSupabase.storage
    .from("product-images")
    .upload(path, file, { cacheControl: "3600", upsert: false });

  if (error) throw error;

  const { data } = lcSupabase.storage.from("product-images").getPublicUrl(path);
  return { url: data.publicUrl, path };
}

document.getElementById("productForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  clearFormMessage("productFormMessage");

  try {
    const name = document.getElementById("productName").value.trim();
    const category = document.getElementById("productCategory").value.trim();
    const description = document.getElementById("productDescription").value.trim();
    const price = Number(document.getElementById("productPrice").value);
    const stock = Number(document.getElementById("productStock").value);
    const active = document.getElementById("productActive").checked;
    const file = document.getElementById("productImage").files[0];

    if (!name || !category || Number.isNaN(price) || price < 0) {
      setFormMessage("productFormMessage", "Revise os dados do produto.");
      return;
    }

    let imageUrl = editingProduct?.image_url || null;
    let imagePath = editingProduct?.image_path || null;

    if (file) {
      const uploaded = await uploadImage(file);
      imageUrl = uploaded.url;
      imagePath = uploaded.path;
    }

    const payload = {
      store_id: currentStore.id,
      name,
      category,
      description,
      price,
      stock,
      active,
      image_url: imageUrl,
      image_path: imagePath
    };

    let response;
    if (editingProduct) {
      response = await lcSupabase.from("products").update(payload).eq("id", editingProduct.id);
    } else {
      response = await lcSupabase.from("products").insert(payload);
    }

    if (response.error) throw response.error;

    closeProductModal();
    toast(editingProduct ? "Produto atualizado." : "Produto cadastrado.");
    await loadProducts();
  } catch (error) {
    console.error(error);
    setFormMessage("productFormMessage", error.message || "Não foi possível salvar o produto.");
  }
});

window.updateOrderStatus = async function(orderId, status) {
  const { error } = await lcSupabase
    .from("orders")
    .update({ status })
    .eq("id", orderId);

  if (error) {
    toast("Não foi possível atualizar o pedido.");
    return;
  }

  toast("Status atualizado.");
  await loadOrders();
};

function fillSettings() {
  document.getElementById("settingsStoreName").value = currentStore.name || "";
  document.getElementById("settingsSlug").value = currentStore.slug || "";
  document.getElementById("settingsWhatsapp").value = currentStore.whatsapp || "";

  const preview = document.getElementById("storeLogoPreview");
  preview.innerHTML = currentStore.logo_url
    ? `<img src="${currentStore.logo_url}" alt="Logo da loja">`
    : `<span class="muted">Nenhuma logo enviada.</span>`;
}

function updatePublicLinks() {
  const url = publicStoreUrl();
  ["publicStoreUrl","settingsPublicUrl"].forEach(id => {
    document.getElementById(id).textContent = url;
  });
}

document.getElementById("storeSettingsForm").addEventListener("submit", async (event) => {
  event.preventDefault();

  try {
    const name = document.getElementById("settingsStoreName").value.trim();
    const slug = slugify(document.getElementById("settingsSlug").value);
    const whatsapp = document.getElementById("settingsWhatsapp").value.trim();
    const logoFile = document.getElementById("storeLogoInput").files[0];

    if (!name || !slug || whatsapp.replace(/\D/g,"").length < 10) {
      toast("Revise os dados da loja.");
      return;
    }

    let logoUrl = currentStore.logo_url;
    if (logoFile) {
      const uploaded = await uploadImage(logoFile, `${currentUser.id}/store`);
      logoUrl = uploaded.url;
    }

    const { data, error } = await lcSupabase
      .from("stores")
      .update({ name, slug, whatsapp, logo_url: logoUrl })
      .eq("id", currentStore.id)
      .select()
      .single();

    if (error) throw error;

    currentStore = data;
    fillSettings();
    updatePublicLinks();
    document.getElementById("previewStoreName").textContent = currentStore.name;
    toast("Loja atualizada.");
  } catch (error) {
    console.error(error);
    toast(error.code === "23505" ? "Esse endereço de loja já está em uso." : "Não foi possível salvar.");
  }
});

function switchSection(section) {
  document.querySelectorAll(".app-section").forEach(el => el.classList.remove("active"));
  document.querySelectorAll(".nav-item").forEach(el => el.classList.toggle("active", el.dataset.section === section));
  document.getElementById(`section-${section}`).classList.add("active");

  const titles = {
    overview: "Visão geral",
    products: "Produtos",
    orders: "Pedidos",
    settings: "Minha loja"
  };
  document.getElementById("topbarTitle").textContent = titles[section] || "LC Commerce";
  document.getElementById("sidebar").classList.remove("open");
}

document.querySelectorAll(".nav-item").forEach(btn => {
  btn.addEventListener("click", () => switchSection(btn.dataset.section));
});
document.querySelectorAll("[data-go]").forEach(btn => {
  btn.addEventListener("click", () => switchSection(btn.dataset.go));
});

document.getElementById("productSearch").addEventListener("input", renderProductsAdmin);
document.getElementById("orderStatusFilter").addEventListener("change", renderOrders);
document.getElementById("addProductBtn").addEventListener("click", () => openProductModal());
document.getElementById("quickAddProduct").addEventListener("click", () => {
  switchSection("products");
  openProductModal();
});
document.getElementById("closeProductModal").addEventListener("click", closeProductModal);
document.getElementById("cancelProductBtn").addEventListener("click", closeProductModal);
document.getElementById("modalBackdrop").addEventListener("click", closeProductModal);
document.getElementById("menuBtn").addEventListener("click", () => document.getElementById("sidebar").classList.toggle("open"));

["openStoreBtn","previewStoreBtn","settingsOpenStore"].forEach(id => {
  document.getElementById(id).addEventListener("click", () => {
    if (currentStore) window.open(publicStoreUrl(), "_blank");
  });
});
["copyStoreLink","settingsCopyLink"].forEach(id => {
  document.getElementById(id).addEventListener("click", () => currentStore && copyText(publicStoreUrl()));
});

document.getElementById("logoutBtn").addEventListener("click", async () => {
  if (window.lcSupabase) await lcSupabase.auth.signOut();
  window.location.href = "index.html";
});

(async function init(){
  if (!window.LC_SUPABASE_CONFIGURED) return;
  if (!(await requireAuth())) return;
  await loadProfileAndStore();
  await Promise.all([loadProducts(), loadOrders()]);
})();