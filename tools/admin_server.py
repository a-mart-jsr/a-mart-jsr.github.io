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
        return json.load(file)


def write_json(data):
    DATA_FILE.parent.mkdir(parents=True, exist_ok=True)
    if DATA_FILE.exists():
        BACKUP_FILE.write_text(DATA_FILE.read_text(encoding="utf-8"), encoding="utf-8")
    DATA_FILE.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def clean_text(value):
    return value.strip() if isinstance(value, str) else ""


def normalize_offer_data(payload):
    categories = payload.get("categories")
    products = payload.get("products")
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
    for product in products:
        if not isinstance(product, dict):
            continue
        category_id = clean_text(product.get("categoryId"))
        if category_id not in category_ids:
            raise ValueError(f"Product category does not exist: {category_id}")

        price = clean_text(product.get("price"))
        before_price = clean_text(product.get("beforePrice"))
        if not price:
            raise ValueError("Every product needs a current price.")

        normalized = {
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
        "categories": normalized_categories,
        "products": normalized_products,
    }


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
    resolved = (ROOT / relative).resolve()
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
        if not (self.path.startswith("/api/save") or self.path.startswith("/api/update") or self.path.startswith("/api/preview")):
            self.send_error(404, "Unknown API endpoint")
            return

        try:
            global PREVIEW_DATA
            length = int(self.headers.get("Content-Length", "0"))
            if length > MAX_BODY_BYTES:
                raise ValueError("Save request is too large.")
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
            data = normalize_offer_data(payload)
            if self.path.startswith("/api/preview"):
                replace_preview_image_paths(data, payload.get("images", []))
                PREVIEW_DATA = data
                self.send_json(200, {"ok": True, "data": data})
                return

            saved_paths = save_uploaded_images(payload.get("images", []))
            replace_image_paths(data, saved_paths)
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
