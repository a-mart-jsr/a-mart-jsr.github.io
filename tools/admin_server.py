#!/usr/bin/env python3
import base64
import json
import mimetypes
import re
import subprocess
from datetime import date
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse


ROOT = Path(__file__).resolve().parents[1]
DATA_FILE = ROOT / "data" / "offers.json"
BACKUP_FILE = ROOT / "data" / "offers.backup.json"
PRODUCTS_DIR = ROOT / "assets" / "products"
ALLOWED_IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".gif"}
MAX_BODY_BYTES = 15 * 1024 * 1024
PREVIEW_DATA = None


def read_json():
    with DATA_FILE.open("r", encoding="utf-8") as file:
        return normalize_offer_data(json.load(file))


def write_json(data):
    storage_data = storage_offer_data(data)
    DATA_FILE.parent.mkdir(parents=True, exist_ok=True)
    if DATA_FILE.exists():
        BACKUP_FILE.write_text(DATA_FILE.read_text(encoding="utf-8"), encoding="utf-8")
    DATA_FILE.write_text(json.dumps(storage_data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def clean_text(value):
    return value.strip() if isinstance(value, str) else ""


def slugify(value):
    slug = re.sub(r"[^a-z0-9]+", "-", clean_text(value).lower()).strip("-")
    return slug or "item"


def snake_case_file_part(value):
    part = re.sub(r"[^a-z0-9]+", "_", clean_text(value).lower()).strip("_")
    return part or "image"


def strip_currency_text(value, currency):
    output = clean_text(value)
    for candidate in [currency, "Rs", "RS", "₹"]:
        candidate = clean_text(candidate)
        if not candidate:
            continue
        output = re.sub(rf"^{re.escape(candidate)}\.?\s*", "", output, flags=re.IGNORECASE)
    return clean_text(output)


def format_price_for_storage(value, currency):
    raw = clean_text(value)
    if not raw:
        return ""
    if re.search(r"[^0-9.,\s-]", raw):
        return raw
    return " ".join(part for part in [clean_text(currency) or "Rs", raw] if part)


def product_id_seed(product):
    parts = [
        clean_text(product.get("categoryId")),
        clean_text(product.get("name")),
        Path(clean_text(product.get("image"))).stem,
    ]
    return "prod-" + slugify("-".join(part for part in parts if part))


def unique_product_id(product, used_ids):
    product_id = product_id_seed(product)
    if product_id not in used_ids:
        return product_id

    counter = 2
    while True:
        candidate = f"{product_id}-{counter}"
        if candidate not in used_ids:
            return candidate
        counter += 1


def comparable(value):
    return json.dumps(value or None, sort_keys=True, ensure_ascii=False)


def normalize_offer_data(payload):
    categories = payload.get("categories")
    products = payload.get("products")
    currency = clean_text(payload.get("currency")) or "Rs"
    if not isinstance(categories, list) or not isinstance(products, list):
        raise ValueError("Categories and products must be lists.")

    normalized_categories = []
    category_ids = set()
    for category in categories:
        if not isinstance(category, dict):
            continue
        category_id = clean_text(category.get("id"))
        name = clean_text(category.get("name"))
        if not category_id or not name:
            continue
        if category_id in category_ids:
            raise ValueError(f"Duplicate category id: {category_id}")
        category_ids.add(category_id)
        normalized_categories.append({"id": category_id, "name": name})

    normalized_products = []
    product_ids = set()
    for product in products:
        if not isinstance(product, dict):
            continue
        category_id = clean_text(product.get("categoryId"))
        if category_id not in category_ids:
            raise ValueError(f"Product category does not exist: {category_id}")

        product_id = clean_text(product.get("id"))
        if product_id:
            if product_id in product_ids:
                raise ValueError(f"Duplicate product id: {product_id}")
        else:
            product_id = unique_product_id(product, product_ids)
        product_ids.add(product_id)

        price = strip_currency_text(product.get("price"), currency)
        before_price = strip_currency_text(product.get("beforePrice"), currency)
        if not price:
            raise ValueError("Every product needs a current price.")

        normalized = {
            "id": product_id,
            "categoryId": category_id,
            "name": clean_text(product.get("name")),
            "image": clean_text(product.get("image")),
            "offer": clean_text(product.get("offer")),
            "price": price,
        }
        if before_price:
            normalized["beforePrice"] = before_price
        if not normalized["categoryId"] or not normalized["name"] or not normalized["offer"] or not normalized["price"]:
            raise ValueError("Every product needs category, name, offer text, and price.")

        free_item = product.get("freeItem")
        if isinstance(free_item, dict):
            free_name = clean_text(free_item.get("name"))
            free_image = clean_text(free_item.get("image"))
            if free_name or free_image:
                if not free_name:
                    raise ValueError("Free items need a name.")
                normalized["freeItem"] = {"name": free_name, "image": free_image}

        normalized_products.append(normalized)

    return {
        "updatedAt": clean_text(payload.get("updatedAt")) or date.today().isoformat(),
        "currency": currency,
        "categories": normalized_categories,
        "products": normalized_products,
    }


def storage_offer_data(data):
    normalized = normalize_offer_data(data)
    currency = clean_text(normalized.get("currency")) or "Rs"
    for product in normalized["products"]:
        product["price"] = format_price_for_storage(product.get("price"), currency)
        if clean_text(product.get("beforePrice")):
            product["beforePrice"] = format_price_for_storage(product.get("beforePrice"), currency)
    return normalized


def safe_site_path(raw_path):
    request_path = unquote(urlparse(raw_path).path)
    if request_path == "/":
        request_path = "/index.html"
    if request_path == "/admin":
        request_path = "/admin/"
    if request_path == "/admin/":
        request_path = "/admin/index.html"

    relative = request_path.lstrip("/")
    resolved = (ROOT / relative).resolve()
    if ROOT not in resolved.parents and resolved != ROOT:
        raise ValueError("Path is outside the site.")
    return resolved


def safe_product_image_path(relative_path):
    relative = clean_text(relative_path).replace("\\", "/").lstrip("/")
    original = Path(relative).name
    if not original:
        raise ValueError("Image path is missing.")
    original_path = Path(original)
    extension = original_path.suffix.lower()
    safe_name = f"{snake_case_file_part(original_path.stem)}{extension}"
    resolved = (PRODUCTS_DIR / safe_name).resolve()
    if PRODUCTS_DIR not in resolved.parents:
        raise ValueError("Images must be saved under assets/products.")
    if resolved.suffix.lower() not in ALLOWED_IMAGE_EXTENSIONS:
        raise ValueError("Image must use png, jpg, jpeg, webp, or gif.")
    return resolved


def available_image_path(path):
    if not path.exists():
        return path

    stem = path.stem
    suffix = path.suffix
    parent = path.parent
    counter = 2
    while True:
        candidate = parent / f"{stem}-{counter}{suffix}"
        if not candidate.exists():
            return candidate
        counter += 1


def site_relative_path(path):
    return path.resolve().relative_to(ROOT).as_posix()


def save_uploaded_images(images):
    if not isinstance(images, list):
        raise ValueError("Images must be a list.")

    saved_paths = {}
    PRODUCTS_DIR.mkdir(parents=True, exist_ok=True)
    for image in images:
        if not isinstance(image, dict):
            continue
        requested_path = clean_text(image.get("path"))
        path = available_image_path(safe_product_image_path(requested_path))
        data_url = clean_text(image.get("dataUrl"))
        match = re.match(r"^data:image/[a-zA-Z0-9.+-]+;base64,(.+)$", data_url)
        if not match:
            raise ValueError("Invalid image data.")
        path.write_bytes(base64.b64decode(match.group(1), validate=True))
        saved_paths[requested_path] = site_relative_path(path)
    return saved_paths


def replace_image_paths(data, saved_paths):
    if not saved_paths:
        return

    for product in data["products"]:
        if product.get("image") in saved_paths:
            product["image"] = saved_paths[product["image"]]
        free_item = product.get("freeItem")
        if isinstance(free_item, dict) and free_item.get("image") in saved_paths:
            free_item["image"] = saved_paths[free_item["image"]]


def replace_preview_image_paths(data, images):
    if not isinstance(images, list):
        return

    image_map = {}
    for image in images:
        if not isinstance(image, dict):
            continue
        path = clean_text(image.get("path"))
        data_url = clean_text(image.get("dataUrl"))
        if path and data_url:
            image_map[path] = data_url
    replace_image_paths(data, image_map)


def product_image_references(data):
    references = set()
    for product in data.get("products", []):
        for raw_path in [product.get("image")]:
            path = referenced_product_image_path(raw_path)
            if path:
                references.add(path)
        free_item = product.get("freeItem")
        if isinstance(free_item, dict):
            path = referenced_product_image_path(free_item.get("image"))
            if path:
                references.add(path)
    return references


def referenced_product_image_path(raw_path):
    relative = clean_text(raw_path).replace("\\", "/").lstrip("/")
    if not relative:
        return None
    resolved = (ROOT / relative).resolve()
    if resolved == PRODUCTS_DIR or PRODUCTS_DIR not in resolved.parents:
        return None
    return resolved


def cleanup_unused_images(data):
    used_paths = product_image_references(data)
    deleted = []
    if not PRODUCTS_DIR.exists():
        return deleted

    for path in PRODUCTS_DIR.rglob("*"):
        if not path.is_file() or path.suffix.lower() not in ALLOWED_IMAGE_EXTENSIONS:
            continue
        resolved = path.resolve()
        if resolved in used_paths:
            continue
        resolved.unlink()
        deleted.append(site_relative_path(resolved))
    return deleted


def map_by_id(items):
    return {clean_text(item.get("id")): item for item in items if clean_text(item.get("id"))}


def ordered_ids(*item_lists):
    ids = []
    seen = set()
    for items in item_lists:
        for item in items:
            item_id = clean_text(item.get("id"))
            if item_id and item_id not in seen:
                ids.append(item_id)
                seen.add(item_id)
    return ids


def item_changed(current, base):
    return comparable(current) != comparable(base)


def item_label(item, fallback):
    if not item:
        return fallback
    return clean_text(item.get("name")) or clean_text(item.get("id")) or fallback


def merge_items(label, base_items, draft_items, latest_items):
    base_map = map_by_id(base_items)
    draft_map = map_by_id(draft_items)
    latest_map = map_by_id(latest_items)
    merged_map = {}
    conflicts = []

    for item_id in ordered_ids(latest_items, draft_items, base_items):
        base_item = base_map.get(item_id)
        draft_item = draft_map.get(item_id)
        latest_item = latest_map.get(item_id)
        local_changed = item_changed(draft_item, base_item)
        remote_changed = item_changed(latest_item, base_item)

        if local_changed and remote_changed and comparable(draft_item) != comparable(latest_item):
            conflict_name = item_label(draft_item or latest_item or base_item, item_id)
            conflicts.append(f"{label}: {conflict_name}")
            continue

        chosen = draft_item if local_changed else latest_item
        if chosen is not None:
            merged_map[item_id] = chosen

    merged = []
    for item_id in ordered_ids(latest_items, draft_items, base_items):
        if item_id in merged_map:
            merged.append(merged_map.pop(item_id))
    merged.extend(merged_map.values())
    return merged, conflicts


def merge_scalar(field, base, draft, latest, conflicts):
    base_value = clean_text(base.get(field))
    draft_value = clean_text(draft.get(field))
    latest_value = clean_text(latest.get(field))
    local_changed = draft_value != base_value
    remote_changed = latest_value != base_value

    if local_changed and remote_changed and draft_value != latest_value:
        conflicts.append(field)
        return latest_value
    return draft_value if local_changed else latest_value


def ensure_product_categories(categories, products, *sources):
    category_map = map_by_id(categories)
    source_maps = [map_by_id(source.get("categories", [])) for source in sources]
    for product in products:
        category_id = clean_text(product.get("categoryId"))
        if not category_id or category_id in category_map:
            continue
        for source_map in source_maps:
            if category_id in source_map:
                category_map[category_id] = source_map[category_id]
                categories.append(source_map[category_id])
                break
    return categories


def merge_offer_data(base, draft, latest):
    conflicts = []
    categories, category_conflicts = merge_items(
        "Category",
        base.get("categories", []),
        draft.get("categories", []),
        latest.get("categories", []),
    )
    products, product_conflicts = merge_items(
        "Product",
        base.get("products", []),
        draft.get("products", []),
        latest.get("products", []),
    )
    conflicts.extend(category_conflicts)
    conflicts.extend(product_conflicts)

    merged = {
        "updatedAt": clean_text(draft.get("updatedAt")) or date.today().isoformat(),
        "currency": merge_scalar("currency", base, draft, latest, conflicts) or "Rs",
        "categories": ensure_product_categories(categories, products, latest, draft, base),
        "products": products,
    }

    if conflicts:
        raise ValueError("Both copies changed the same item. Reload the editor and reapply that item: " + ", ".join(conflicts))

    return normalize_offer_data(merged)


def run_git(args):
    result = subprocess.run(
        ["git", *args],
        cwd=ROOT,
        text=True,
        capture_output=True,
        check=False,
    )
    output = (result.stdout + result.stderr).strip()
    if result.returncode != 0:
        raise RuntimeError(output or "Git command failed.")
    return output


def pull_latest_offer_data():
    if not (ROOT / ".git").exists():
        return read_json()
    run_git(["pull", "--ff-only"])
    return read_json()


def has_staged_offer_changes():
    result = subprocess.run(
        ["git", "diff", "--cached", "--quiet", "--", "data/offers.json", "assets/products"],
        cwd=ROOT,
        text=True,
        capture_output=True,
        check=False,
    )
    return result.returncode == 1


def commit_and_push(updated_at):
    run_git(["add", "--", "data/offers.json", "assets/products"])
    committed = False
    commit_message = f"Update offers for {updated_at}"
    if has_staged_offer_changes():
        run_git(["commit", "-m", commit_message, "--", "data/offers.json", "assets/products"])
        committed = True
    push_output = run_git(["push"])
    if committed:
        return f"Updated, committed, and pushed to GitHub: {commit_message}"
    return "No offer file changes to commit. GitHub push completed."


class AdminHandler(BaseHTTPRequestHandler):
    server_version = "AMartAdmin/1.0"

    def log_message(self, fmt, *args):
        print("%s - %s" % (self.address_string(), fmt % args))

    def send_json(self, status, payload):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path.startswith("/api/offers"):
            try:
                self.send_json(200, read_json())
            except Exception as error:
                self.send_json(500, {"error": str(error)})
            return

        if self.path.startswith("/api/preview"):
            if PREVIEW_DATA is None:
                self.send_json(404, {"error": "No admin preview is available yet."})
            else:
                self.send_json(200, PREVIEW_DATA)
            return

        try:
            path = safe_site_path(self.path)
            if not path.exists() or not path.is_file():
                self.send_error(404, "File not found")
                return
            body = path.read_bytes()
            content_type = mimetypes.guess_type(str(path))[0] or "application/octet-stream"
            self.send_response(200)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(body)
        except ValueError as error:
            self.send_error(403, str(error))

    def do_POST(self):
        if not (
            self.path.startswith("/api/save")
            or self.path.startswith("/api/update")
            or self.path.startswith("/api/preview")
            or self.path.startswith("/api/cleanup-images")
        ):
            self.send_error(404, "Unknown API endpoint")
            return

        try:
            global PREVIEW_DATA
            length = int(self.headers.get("Content-Length", "0"))
            if length > MAX_BODY_BYTES:
                raise ValueError("Save request is too large.")
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
            data = normalize_offer_data(payload)
            if self.path.startswith("/api/cleanup-images"):
                deleted = cleanup_unused_images(data)
                self.send_json(200, {"ok": True, "deleted": deleted, "deletedCount": len(deleted)})
                return

            if self.path.startswith("/api/preview"):
                replace_preview_image_paths(data, payload.get("images", []))
                PREVIEW_DATA = data
                self.send_json(200, {"ok": True, "data": data})
                return

            saved_paths = save_uploaded_images(payload.get("images", []))
            replace_image_paths(data, saved_paths)
            if self.path.startswith("/api/update"):
                base_payload = payload.get("baseData")
                base_data = normalize_offer_data(base_payload) if isinstance(base_payload, dict) else read_json()
                latest_data = pull_latest_offer_data()
                data = merge_offer_data(base_data, data, latest_data)
            write_json(data)
            message = "Saved data/offers.json successfully."
            if self.path.startswith("/api/update"):
                message = commit_and_push(data["updatedAt"])
            self.send_json(200, {"ok": True, "data": data, "message": message})
        except Exception as error:
            self.send_json(400, {"error": str(error)})


def main():
    host = "127.0.0.1"
    port = 9000
    server = ThreadingHTTPServer((host, port), AdminHandler)
    print(f"A-Mart local editor: http://{host}:{port}/admin/")
    print("Press Ctrl+C to stop.")
    server.serve_forever()


if __name__ == "__main__":
    main()
