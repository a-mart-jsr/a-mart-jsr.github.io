(function () {
  const state = {
    data: { updatedAt: "", currency: "Rs", categories: [], products: [] },
    baseData: { updatedAt: "", currency: "Rs", categories: [], products: [] },
    selectedIndex: -1,
    uploads: {}
  };

  const elements = {
    status: document.getElementById("status-message"),
    save: document.getElementById("save-data"),
    viewSite: document.getElementById("view-site"),
    cleanupImages: document.getElementById("cleanup-images"),
    updatedAt: document.getElementById("updated-at"),
    currencyText: document.getElementById("currency-text"),
    categoryList: document.getElementById("category-list"),
    categoryForm: document.getElementById("category-form"),
    newCategoryName: document.getElementById("new-category-name"),
    productFilter: document.getElementById("product-filter"),
    productList: document.getElementById("product-list"),
    addProduct: document.getElementById("add-product"),
    deleteProduct: document.getElementById("delete-product"),
    editorTitle: document.getElementById("editor-title"),
    productForm: document.getElementById("product-form"),
    productCategory: document.getElementById("product-category"),
    productName: document.getElementById("product-name"),
    productPrice: document.getElementById("product-price"),
    beforePrice: document.getElementById("before-price"),
    discountPercent: document.getElementById("discount-percent"),
    calculateCurrentPrice: document.getElementById("calculate-current-price"),
    calculateBeforePrice: document.getElementById("calculate-before-price"),
    productOffer: document.getElementById("product-offer"),
    productImage: document.getElementById("product-image"),
    productImageFile: document.getElementById("product-image-file"),
    productImagePreview: document.getElementById("product-image-preview"),
    productNoImage: document.getElementById("product-no-image"),
    hasFreeItem: document.getElementById("has-free-item"),
    freeItemFields: document.getElementById("free-item-fields"),
    freeName: document.getElementById("free-name"),
    freeImage: document.getElementById("free-image"),
    freeImageFile: document.getElementById("free-image-file"),
    freeImagePreview: document.getElementById("free-image-preview"),
    freeNoImage: document.getElementById("free-no-image")
  };

  function setStatus(message, type) {
    elements.status.textContent = message || "";
    elements.status.className = "status" + (type ? " " + type : "");
  }

  function clean(value) {
    return String(value || "").trim();
  }

  function currencyText() {
    return clean(elements.currencyText.value || state.data.currency) || "Rs";
  }

  function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function stripCurrency(value) {
    return stripCurrencyWithCurrency(value, currencyText());
  }

  function stripCurrencyWithCurrency(value, currency) {
    let output = clean(value);
    const candidates = [currency, "Rs", "RS", "₹"].filter(Boolean);
    candidates.forEach((candidate) => {
      output = output.replace(new RegExp("^" + escapeRegExp(candidate) + "\\.?\\s*", "i"), "");
    });
    return clean(output);
  }

  function formatMoney(value) {
    const raw = clean(value);
    if (!raw) {
      return "";
    }

    if (/[^0-9.,\s-]/.test(raw)) {
      return raw;
    }

    return [currencyText(), raw].filter(Boolean).join(" ");
  }

  function numericPrice(value) {
    const parsed = Number.parseFloat(stripCurrency(value).replace(/,/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
  }

  function formatNumber(value) {
    if (!Number.isFinite(value)) {
      return "";
    }
    return String(Number(value.toFixed(2))).replace(/\.0+$/, "");
  }

  function slugify(value) {
    const slug = clean(value)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    return slug || "item";
  }

  function snakeCaseFilePart(value) {
    const part = clean(value)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");
    return part || "image";
  }

  function cleanExtension(value) {
    return clean(value).toLowerCase().replace(/[^a-z0-9]/g, "") || "png";
  }

  function cloneData(data) {
    return JSON.parse(JSON.stringify(data));
  }

  function newProductId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return "prod-" + window.crypto.randomUUID();
    }
    return "prod-" + Date.now() + "-" + Math.random().toString(36).slice(2, 10);
  }

  function today() {
    return new Date().toISOString().slice(0, 10);
  }

  function splitFileName(fileName) {
    const value = clean(fileName);
    const dot = value.lastIndexOf(".");
    if (dot <= 0) {
      return { base: value || "image", extension: "png" };
    }
    return {
      base: value.slice(0, dot),
      extension: value.slice(dot + 1).toLowerCase() || "png"
    };
  }

  function nextImagePath(fileName) {
    const parts = splitFileName(fileName);
    return "assets/products/" + snakeCaseFilePart(parts.base) + "_" + Date.now() + "." + cleanExtension(parts.extension);
  }

  function imageUrl(path) {
    const value = clean(path);
    if (!value) {
      return "";
    }
    if (state.uploads[value]) {
      return state.uploads[value];
    }
    return "/" + value.replace(/^\/+/, "");
  }

  function selectedProduct() {
    if (state.selectedIndex < 0) {
      return null;
    }
    return state.data.products[state.selectedIndex] || null;
  }

  function normalizeData(data) {
    const currency = clean(data.currency) || "Rs";
    const normalized = {
      updatedAt: today(),
      currency,
      categories: Array.isArray(data.categories) ? data.categories : [],
      products: Array.isArray(data.products) ? data.products : []
    };
    normalized.products.forEach((product) => {
      if (!clean(product.id)) {
        product.id = newProductId();
      }
      product.price = stripCurrencyWithCurrency(product.price, currency);
      if (clean(product.beforePrice)) {
        product.beforePrice = stripCurrencyWithCurrency(product.beforePrice, currency);
      }
    });
    return normalized;
  }

  function setPreview(preview, noImage, path) {
    const url = imageUrl(path);
    preview.src = url;
    preview.classList.toggle("hidden", !url);
    noImage.classList.toggle("hidden", Boolean(url));
  }

  function createCardImage(src, alt, className) {
    const path = clean(src);
    if (!path) {
      const noImage = document.createElement("span");
      noImage.className = className + " no-image";
      noImage.textContent = "No image";
      return noImage;
    }

    const image = document.createElement("img");
    image.className = className;
    image.src = imageUrl(path);
    image.alt = alt;
    return image;
  }

  function createCardPrice(product) {
    const beforePrice = clean(product.beforePrice);
    const currentPrice = clean(product.price);
    if (beforePrice && currentPrice) {
      const block = document.createElement("span");
      block.className = "card-price-block";

      const before = document.createElement("span");
      before.className = "card-before-price";
      before.textContent = formatMoney(beforePrice);
      block.appendChild(before);

      const current = document.createElement("span");
      current.className = "card-current-price";
      current.textContent = formatMoney(currentPrice);
      block.appendChild(current);

      return block;
    }

    const price = document.createElement("span");
    price.className = "card-price";
    price.textContent = formatMoney(currentPrice) || "Price not listed";
    return price;
  }

  function createCardFreeItem(freeItem) {
    const block = document.createElement("span");
    block.className = "card-free-item";
    block.appendChild(createCardImage(freeItem.image, freeItem.name || "Free item image", "card-free-image"));

    const copy = document.createElement("span");
    const label = document.createElement("span");
    label.className = "card-free-label";
    label.textContent = "Free item";
    copy.appendChild(label);

    const name = document.createElement("span");
    name.className = "card-free-name";
    name.textContent = clean(freeItem.name) || "Free item";
    copy.appendChild(name);

    block.appendChild(copy);
    return block;
  }

  function getRoundingMode() {
    const selected = document.querySelector('input[name="discount-rounding"]:checked');
    return selected ? selected.value : "down";
  }

  function setRoundingMode(mode) {
    const target = document.querySelector('input[name="discount-rounding"][value="' + mode + '"]');
    if (target) {
      target.checked = true;
    }
  }

  function inferDiscountPercent(offerText) {
    const match = clean(offerText).match(/^(\d+(?:\.\d+)?)%\s*off\b/i);
    return match ? match[1] : "";
  }

  function discountMessage(percent) {
    const value = Number.parseFloat(clean(percent));
    if (!Number.isFinite(value)) {
      return "";
    }
    return formatNumber(value) + "% Off";
  }

  function removeLeadingDiscountMessage(value) {
    return clean(value).replace(/^\d+(?:\.\d+)?%\s*off\.?\s*/i, "").replace(/^\.\s*/, "");
  }

  function updateDiscountOfferText() {
    const message = discountMessage(elements.discountPercent.value);
    if (!message) {
      return;
    }

    const existing = removeLeadingDiscountMessage(elements.productOffer.value);
    elements.productOffer.value = existing ? message + ". " + existing : message;
  }

  function validDiscountPercent() {
    const percent = Number.parseFloat(clean(elements.discountPercent.value));
    if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
      setStatus("Enter a discount percentage between 0 and 100.", "error");
      return null;
    }
    return percent;
  }

  function applyRounding(value) {
    const mode = getRoundingMode();
    if (mode === "down") {
      return Math.floor(value);
    }
    if (mode === "up") {
      return Math.ceil(value);
    }
    return value;
  }

  function calculateCurrentPrice() {
    const beforePrice = numericPrice(elements.beforePrice.value);
    const percent = validDiscountPercent();
    if (!Number.isFinite(beforePrice) || beforePrice <= 0) {
      setStatus("Enter a before price before calculating the current price.", "error");
      return;
    }
    if (percent === null) {
      return;
    }

    const calculated = applyRounding(beforePrice * (1 - percent / 100));
    elements.productPrice.value = formatNumber(calculated);
    updateDiscountOfferText();
    setStatus("Current price calculated from before price and discount.", "success");
  }

  function calculateBeforePrice() {
    const currentPrice = numericPrice(elements.productPrice.value);
    const percent = validDiscountPercent();
    if (!Number.isFinite(currentPrice) || currentPrice < 0) {
      setStatus("Enter a current price before calculating the before price.", "error");
      return;
    }
    if (percent === null) {
      return;
    }
    if (percent >= 100) {
      setStatus("Before price cannot be calculated from a 100% discount.", "error");
      return;
    }

    const calculated = applyRounding(currentPrice / (1 - percent / 100));
    elements.beforePrice.value = formatNumber(calculated);
    updateDiscountOfferText();
    setStatus("Before price calculated from current price and discount.", "success");
  }

  function renderCategories() {
    elements.categoryList.textContent = "";
    state.data.categories.forEach((category) => {
      const row = document.createElement("div");
      row.className = "category-row";

      const copy = document.createElement("div");
      const title = document.createElement("p");
      title.className = "row-title";
      title.textContent = category.name || category.id;
      copy.appendChild(title);

      const meta = document.createElement("p");
      meta.className = "row-meta";
      meta.textContent = category.id;
      copy.appendChild(meta);
      row.appendChild(copy);

      const actions = document.createElement("div");
      actions.className = "row-actions";

      const remove = document.createElement("button");
      remove.className = "button danger";
      remove.type = "button";
      remove.textContent = "Remove";
      remove.addEventListener("click", () => removeCategory(category.id));
      actions.appendChild(remove);

      row.appendChild(actions);
      elements.categoryList.appendChild(row);
    });
  }

  function renderSelects() {
    const filterValue = elements.productFilter.value || "all";
    elements.productFilter.textContent = "";
    const allOption = new Option("All categories", "all");
    elements.productFilter.appendChild(allOption);

    elements.productCategory.textContent = "";
    state.data.categories.forEach((category) => {
      elements.productFilter.appendChild(new Option(category.name, category.id));
      elements.productCategory.appendChild(new Option(category.name, category.id));
    });
    elements.productFilter.value = filterValue;
  }

  function renderProducts() {
    const filter = elements.productFilter.value || "all";
    elements.productList.textContent = "";
    state.data.products.forEach((product, index) => {
      if (filter !== "all" && product.categoryId !== filter) {
        return;
      }

      const row = document.createElement("div");
      row.className = "product-row" + (index === state.selectedIndex ? " is-selected" : "");

      const card = document.createElement("button");
      card.className = "product-card-button";
      card.type = "button";
      card.addEventListener("click", () => editProduct(index));

      card.appendChild(createCardImage(product.image, product.name || "Product image", "product-thumb"));

      const copy = document.createElement("span");
      copy.className = "product-card-copy";

      const title = document.createElement("span");
      title.className = "row-title";
      title.textContent = product.name || "Unnamed product";
      copy.appendChild(title);

      const category = state.data.categories.find((item) => item.id === product.categoryId);
      const meta = document.createElement("span");
      meta.className = "row-meta";
      meta.textContent = category ? category.name : product.categoryId;
      copy.appendChild(meta);

      copy.appendChild(createCardPrice(product));

      const offer = document.createElement("span");
      offer.className = "card-offer";
      offer.textContent = clean(product.offer) || "Offer details available in store";
      copy.appendChild(offer);

      if (product.freeItem && (product.freeItem.name || product.freeItem.image)) {
        copy.appendChild(createCardFreeItem(product.freeItem));
      }

      card.appendChild(copy);
      row.appendChild(card);

      const actions = document.createElement("div");
      actions.className = "row-actions";

      const edit = document.createElement("button");
      edit.className = "button secondary";
      edit.type = "button";
      edit.textContent = index === state.selectedIndex ? "Editing" : "Edit";
      edit.addEventListener("click", () => editProduct(index));
      actions.appendChild(edit);

      row.appendChild(actions);
      elements.productList.appendChild(row);
    });
  }

  function renderEditor() {
    const product = selectedProduct();
    const hasCategories = state.data.categories.length > 0;
    elements.productForm.querySelectorAll("input, select, textarea, button").forEach((input) => {
      input.disabled = !product || !hasCategories;
    });
    elements.deleteProduct.disabled = !product;

    if (!product) {
      elements.editorTitle.textContent = "Product Editor";
      elements.productForm.reset();
      setRoundingMode("down");
      setPreview(elements.productImagePreview, elements.productNoImage, "");
      setPreview(elements.freeImagePreview, elements.freeNoImage, "");
      elements.freeItemFields.classList.remove("active");
      return;
    }

    elements.editorTitle.textContent = "Editing: " + (product.name || "Unnamed product");
    elements.productCategory.value = product.categoryId || state.data.categories[0].id;
    elements.productName.value = product.name || "";
    elements.productPrice.value = stripCurrency(product.price);
    elements.beforePrice.value = stripCurrency(product.beforePrice);
    elements.discountPercent.value = inferDiscountPercent(product.offer || "");
    setRoundingMode("down");
    elements.productOffer.value = product.offer || "";
    elements.productImage.value = product.image || "";
    setPreview(elements.productImagePreview, elements.productNoImage, product.image);

    const hasFreeItem = Boolean(product.freeItem);
    elements.hasFreeItem.checked = hasFreeItem;
    elements.freeItemFields.classList.toggle("active", hasFreeItem);
    elements.freeName.value = hasFreeItem ? product.freeItem.name || "" : "";
    elements.freeImage.value = hasFreeItem ? product.freeItem.image || "" : "";
    setPreview(elements.freeImagePreview, elements.freeNoImage, hasFreeItem ? product.freeItem.image : "");
  }

  function render() {
    elements.updatedAt.value = today();
    elements.currencyText.value = state.data.currency || "Rs";
    renderCategories();
    renderSelects();
    renderProducts();
    renderEditor();
  }

  function addCategory(name) {
    const categoryName = clean(name);
    if (!categoryName) {
      setStatus("Enter a category name.", "error");
      return;
    }

    let id = slugify(categoryName);
    let suffix = 2;
    while (state.data.categories.some((category) => category.id === id)) {
      id = slugify(categoryName) + "-" + suffix;
      suffix += 1;
    }

    state.data.categories.push({ id, name: categoryName });
    elements.newCategoryName.value = "";
    setStatus("Category added. Use Update when you are done.", "success");
    render();
  }

  function removeCategory(categoryId) {
    const used = state.data.products.some((product) => product.categoryId === categoryId);
    if (used) {
      setStatus("Remove or move products in this category before deleting it.", "error");
      return;
    }
    state.data.categories = state.data.categories.filter((category) => category.id !== categoryId);
    setStatus("Category removed. Use Update when you are done.", "success");
    render();
  }

  function addProduct() {
    if (!state.data.categories.length) {
      setStatus("Add a category before adding products.", "error");
      return;
    }
    state.data.currency = currencyText();

    state.data.products.push({
      id: newProductId(),
      categoryId: state.data.categories[0].id,
      name: "",
      price: "",
      beforePrice: "",
      image: "",
      offer: ""
    });
    state.selectedIndex = state.data.products.length - 1;
    setStatus("New product created. Fill it in, then apply product changes.", "success");
    render();
  }

  function editProduct(index) {
    state.selectedIndex = index;
    render();
    document.getElementById("editor-title").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function applyProductForm() {
    const product = selectedProduct();
    if (!product) {
      return;
    }

    state.data.currency = currencyText();
    product.id = clean(product.id) || newProductId();
    product.categoryId = elements.productCategory.value;
    product.name = clean(elements.productName.value);
    product.price = stripCurrency(elements.productPrice.value);
    product.beforePrice = stripCurrency(elements.beforePrice.value);
    product.offer = clean(elements.productOffer.value);
    product.image = clean(elements.productImage.value);

    if (!product.beforePrice) {
      delete product.beforePrice;
    }

    if (elements.hasFreeItem.checked) {
      product.freeItem = {
        name: clean(elements.freeName.value),
        image: clean(elements.freeImage.value)
      };
    } else {
      delete product.freeItem;
    }

    setStatus("Product changes applied. Use Update when you are done.", "success");
    render();
  }

  function deleteProduct() {
    if (state.selectedIndex < 0) {
      return;
    }
    const product = selectedProduct();
    if (!window.confirm("Remove " + (product.name || "this product") + " from offers.json? Image files will stay in assets/products.")) {
      return;
    }
    state.data.products.splice(state.selectedIndex, 1);
    state.selectedIndex = Math.min(state.selectedIndex, state.data.products.length - 1);
    setStatus("Product removed. Use Update when you are done.", "success");
    render();
  }

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.addEventListener("load", () => resolve(reader.result));
      reader.addEventListener("error", () => reject(reader.error));
      reader.readAsDataURL(file);
    });
  }

  async function chooseImage(input, pathInput, preview) {
    const file = input.files && input.files[0];
    if (!file) {
      return;
    }

    const previousPath = clean(pathInput.value);
    if (previousPath && state.uploads[previousPath]) {
      delete state.uploads[previousPath];
    }

    const path = nextImagePath(file.name);
    const dataUrl = await readFileAsDataUrl(file);
    state.uploads[path] = dataUrl;
    pathInput.value = path;
    preview.src = dataUrl;
    preview.classList.remove("hidden");
    const noImage = preview === elements.productImagePreview ? elements.productNoImage : elements.freeNoImage;
    noImage.classList.add("hidden");
    input.value = "";
    setStatus("Image selected from your computer. It will be copied into assets/products when you update.", "success");
  }

  function buildPayload() {
    applyProductForm();
    state.data.updatedAt = today();
    state.data.currency = currencyText();
    elements.updatedAt.value = state.data.updatedAt;
    return {
      updatedAt: state.data.updatedAt,
      currency: state.data.currency,
      categories: state.data.categories,
      products: state.data.products,
      baseData: state.baseData,
      images: Object.entries(state.uploads).map(([path, dataUrl]) => ({ path, dataUrl }))
    };
  }

  async function viewDraftSite() {
    const payload = buildPayload();
    const previewWindow = window.open("about:blank", "_blank");
    elements.viewSite.disabled = true;
    setStatus("Preparing site preview...", "");
    try {
      const response = await fetch("/api/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "Preview failed.");
      }
      setStatus("Preview ready in a new tab.", "success");
      if (previewWindow) {
        previewWindow.location = "/?preview=admin";
      } else {
        window.location.href = "/?preview=admin";
      }
    } catch (error) {
      if (previewWindow) {
        previewWindow.close();
      }
      setStatus(error.message, "error");
    } finally {
      elements.viewSite.disabled = false;
    }
  }

  async function saveData() {
    const payload = buildPayload();
    elements.save.disabled = true;
    setStatus("Updating and pushing to GitHub...", "");
    try {
      const response = await fetch("/api/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "Save failed.");
      }
      state.uploads = {};
      state.data = normalizeData(result.data);
      state.baseData = cloneData(state.data);
      setStatus(result.message || "Updated and pushed successfully.", "success");
      render();
    } catch (error) {
      setStatus(error.message, "error");
    } finally {
      elements.save.disabled = false;
    }
  }

  async function cleanupImages() {
    if (!window.confirm("Remove image files from assets/products that are not used by the current offers? Use Update afterwards to push the deletions to GitHub.")) {
      return;
    }

    const payload = buildPayload();
    elements.cleanupImages.disabled = true;
    setStatus("Checking unused images...", "");
    try {
      const response = await fetch("/api/cleanup-images", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "Image cleanup failed.");
      }

      const count = Number(result.deletedCount || 0);
      if (count) {
        setStatus("Removed " + count + " unused image" + (count === 1 ? "" : "s") + ". Use Update to push the deletion to GitHub.", "success");
      } else {
        setStatus("No unused images found.", "success");
      }
    } catch (error) {
      setStatus(error.message, "error");
    } finally {
      elements.cleanupImages.disabled = false;
    }
  }

  async function loadData() {
    setStatus("Loading offers...", "");
    const response = await fetch("/api/offers", { cache: "no-store" });
    if (!response.ok) {
      throw new Error("Could not load offers from the local server.");
    }
    state.data = normalizeData(await response.json());
    state.baseData = cloneData(state.data);
    state.selectedIndex = state.data.products.length ? 0 : -1;
    setStatus("");
    render();
  }

  elements.categoryForm.addEventListener("submit", (event) => {
    event.preventDefault();
    addCategory(elements.newCategoryName.value);
  });

  elements.productFilter.addEventListener("change", renderProducts);
  elements.currencyText.addEventListener("input", () => {
    state.data.currency = currencyText();
    renderProducts();
  });
  elements.addProduct.addEventListener("click", addProduct);
  elements.deleteProduct.addEventListener("click", deleteProduct);
  elements.productForm.addEventListener("submit", (event) => {
    event.preventDefault();
    applyProductForm();
  });
  elements.save.addEventListener("click", saveData);
  elements.viewSite.addEventListener("click", viewDraftSite);
  elements.cleanupImages.addEventListener("click", cleanupImages);
  elements.discountPercent.addEventListener("input", updateDiscountOfferText);
  elements.calculateCurrentPrice.addEventListener("click", calculateCurrentPrice);
  elements.calculateBeforePrice.addEventListener("click", calculateBeforePrice);
  elements.hasFreeItem.addEventListener("change", () => {
    elements.freeItemFields.classList.toggle("active", elements.hasFreeItem.checked);
  });
  elements.productImageFile.addEventListener("change", () => {
    chooseImage(elements.productImageFile, elements.productImage, elements.productImagePreview);
  });
  elements.freeImageFile.addEventListener("change", () => {
    chooseImage(elements.freeImageFile, elements.freeImage, elements.freeImagePreview);
  });
  elements.productImage.addEventListener("input", () => {
    setPreview(elements.productImagePreview, elements.productNoImage, elements.productImage.value);
  });
  elements.freeImage.addEventListener("input", () => {
    setPreview(elements.freeImagePreview, elements.freeNoImage, elements.freeImage.value);
  });

  loadData().catch((error) => {
    setStatus(error.message, "error");
  });
})();
