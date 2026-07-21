# A-Mart Static Grocery Offers Template

This is a plain static site for GitHub Pages. It has no build step and no backend.

## Update Daily Offers

Update `data/offers.json` and add product images under `assets/products/`.

Each product belongs to a category by `categoryId`. The optional `freeItem` object shows another product image and name when the offer includes a free item.

The site automatically adds an `All Offers` category on the landing page, so the updater only needs to write the real product categories.

```json
{
  "categoryId": "fruits",
  "name": "Apples 1 kg",
  "price": "Rs 120",
  "image": "assets/products/apples.png",
  "offer": "10% off today",
  "freeItem": {
    "name": "Lemon 250 g",
    "image": "assets/products/lemons.png"
  }
}
```

For a discount display, keep `price` as the current price and add `beforePrice`:

```json
{
  "categoryId": "fruits",
  "name": "Apples 1 kg",
  "price": "Rs 120",
  "beforePrice": "Rs 150",
  "image": "assets/products/apples.png",
  "offer": "Save Rs 30 today"
}
```

`image` can be an empty string when no image is available. The site will show `No image` in its place.

The future C++ updater can write `data/offers.json`, copy the latest local images into `assets/products/`, then commit and push.

## Run Locally

Use a local web server so the browser can load `data/offers.json`.

```powershell
python -m http.server 8000
```

Then open `http://localhost:8000/`.

## Local Offer Editor

The local editor is a private tool for updating `data/offers.json` from a browser. It is not needed on GitHub Pages and should be run only on your computer.

On Windows, run:

```powershell
.\scripts\setup-admin.ps1
.\scripts\start-admin.ps1
```

Then open `http://127.0.0.1:9000/admin/`.

Or double-click `start-admin.bat` from the project root to start the local server and open the editor/site.

The editor uses only Python's standard library. If Python is missing and `winget` is available, the setup script will install Python first. The start script also checks for Python before launching. The editor can add categories, add/edit/remove products, choose local images, preview unsaved changes, and update the JSON. Images can be selected from anywhere on the computer; when you update, the server copies them into `assets/products/`. Removed products do not delete image files from `assets/products/`.

The `Update` button saves `data/offers.json`, commits offer data/image changes with a message like `Update offers for 2026-07-19`, and runs `git push`. GitHub push requires that the repository already has a working `origin` remote and GitHub authentication on the computer.

## Request Form and Contact Details

On the landing page, replace `https://forms.gle/REPLACE_WITH_YOUR_FORM_ID` in `index.html` with your Google Form share link.

Also edit the address, email, and phone placeholders in `index.html`. For email and phone, update both the visible text and the `mailto:` / `tel:` links.

## GitHub Pages

1. Push this folder to a GitHub repository.
2. In GitHub, open repository settings.
3. Go to Pages.
4. Set the source to deploy from the `main` branch and root folder.
5. Push future JSON/image updates to publish the latest offers.
