(function () {
  const params = new URLSearchParams(window.location.search);
  const isAdminPreview = params.get("preview") === "admin";
  const DATA_URL = isAdminPreview ? "api/preview" : "data/offers.json";
  const page = document.body.dataset.page;
  const statusMessage = document.getElementById("status-message");
  const updatedAt = document.getElementById("updated-at");

  function setStatus(message) {
    if (statusMessage) {
      statusMessage.textContent = message || "";
    }
  }

  function text(value, fallback) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
    return fallback;
  }

  function formatUpdatedAt(value) {
    const raw = text(value, "");
    if (!raw) {
      return "Offers update daily";
    }

    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) {
      return "Updated: " + raw;
    }

    return "Updated: " + date.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric"
    });
  }

  function categoryHref(categoryId) {
    const targetParams = new URLSearchParams({ c: categoryId });
    if (isAdminPreview) {
      targetParams.set("preview", "admin");
    }
    return "category.html?" + targetParams.toString();
  }

  function getCategories(data) {
    const categories = Array.isArray(data.categories) ? data.categories : [];
    const regularCategories = categories.filter((category) => text(category.id, "") !== "all");
    return [{ id: "all", name: "All Offers" }].concat(regularCategories);
  }

  function createEmptyState(message) {
    const node = document.createElement("div");
    node.className = "empty-state";
    node.textContent = message;
    return node;
  }

  async function loadOffers() {
    const response = await fetch(DATA_URL, { cache: "no-store" });
    if (!response.ok) {
      throw new Error("Could not load offer data.");
    }
    return response.json();
  }

  function renderHome(data) {
    const list = document.getElementById("category-list");
    const categories = getCategories(data);

    updatedAt.textContent = formatUpdatedAt(data.updatedAt);
    list.textContent = "";

    if (!categories.length) {
      list.appendChild(createEmptyState("No offer categories are available right now."));
      return;
    }

    categories.forEach((category) => {
      const id = text(category.id, "");
      const name = text(category.name, id);
      if (!id || !name) {
        return;
      }

      const link = document.createElement("a");
      link.className = "category-button";
      link.href = categoryHref(id);
      link.textContent = name;
      list.appendChild(link);
    });
  }

  function createPriceNode(product) {
    const beforePrice = text(product.beforePrice, "");
    const currentPrice = text(product.price, "");

    if (beforePrice && currentPrice) {
      const block = document.createElement("p");
      block.className = "price-block";

      const before = document.createElement("span");
      before.className = "before-price";
      before.textContent = beforePrice;
      block.appendChild(before);

      const after = document.createElement("span");
      after.className = "current-price";
      after.textContent = currentPrice;
      block.appendChild(after);

      return block;
    }

    const price = document.createElement("p");
    price.className = "price";
    price.textContent = text(product.price, "Price not listed");
    return price;
  }

  function createImageNode(src, alt, className) {
    const imagePath = text(src, "");
    if (!imagePath) {
      const noImage = document.createElement("div");
      noImage.className = className + " no-image";
      noImage.textContent = "No image";
      return noImage;
    }

    const node = document.createElement("img");
    node.className = className;
    node.src = imagePath;
    node.alt = alt;
    node.loading = "lazy";
    return node;
  }

  function createProductCard(product) {
    const card = document.createElement("article");
    card.className = "product-card";

    card.appendChild(createImageNode(product.image, text(product.name, "Product image"), "product-image"));

    const body = document.createElement("div");
    body.className = "product-body";

    const name = document.createElement("h3");
    name.className = "product-name";
    name.textContent = text(product.name, "Unnamed product");
    body.appendChild(name);

    body.appendChild(createPriceNode(product));

    const offer = document.createElement("p");
    offer.className = "offer";
    offer.textContent = text(product.offer, "Offer details available in store");
    body.appendChild(offer);

    if (product.freeItem && (product.freeItem.name || product.freeItem.image)) {
      const freeItem = document.createElement("div");
      freeItem.className = "free-item";

      freeItem.appendChild(createImageNode(product.freeItem.image, text(product.freeItem.name, "Free item image"), "free-image"));

      const freeCopy = document.createElement("div");
      const freeLabel = document.createElement("p");
      freeLabel.className = "free-label";
      freeLabel.textContent = "Free item";
      freeCopy.appendChild(freeLabel);

      const freeName = document.createElement("p");
      freeName.className = "free-name";
      freeName.textContent = text(product.freeItem.name, "Free item");
      freeCopy.appendChild(freeName);

      freeItem.appendChild(freeCopy);
      body.appendChild(freeItem);
    }

    card.appendChild(body);
    return card;
  }

  function renderCategory(data) {
    const categoryId = params.get("c") || "";
    const title = document.getElementById("category-title");
    const list = document.getElementById("product-list");
    const categories = getCategories(data);
    const products = Array.isArray(data.products) ? data.products : [];
    const category = categories.find((item) => item.id === categoryId);
    const categoryName = category ? text(category.name, categoryId) : "Category not found";
    const visibleProducts = categoryId === "all" ? products : products.filter((item) => item.categoryId === categoryId);

    document.title = categoryName + " Offers | A-Mart";
    title.textContent = categoryName;
    updatedAt.textContent = formatUpdatedAt(data.updatedAt);
    list.textContent = "";

    if (!categoryId || !category) {
      list.appendChild(createEmptyState("This category link does not match the current offer data."));
      return;
    }

    if (!visibleProducts.length) {
      list.appendChild(createEmptyState("No products are on offer in this category right now."));
      return;
    }

    visibleProducts.forEach((product) => {
      list.appendChild(createProductCard(product));
    });
  }

  loadOffers()
    .then((data) => {
      setStatus("");
      if (page === "home") {
        renderHome(data);
      } else if (page === "category") {
        renderCategory(data);
      }
    })
    .catch(() => {
      setStatus("Could not load offers. If you opened this file directly, run it through a local web server or GitHub Pages.");
    });
})();
