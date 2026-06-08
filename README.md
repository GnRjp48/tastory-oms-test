# Tastory OMS v1.1.1

A mobile-first, single-page order management system for Tastory, a small home-based granola business.

## Features

- Dashboard with active orders, revenue, upcoming deliveries, and payment reminders
- New order form for all Tastory flavors and pack sizes
- Automatic item count and order total calculation
- Payment status: Unpaid, Deposit Paid, and Paid
- Amount paid and automatic outstanding amount calculation
- Customer notes for preferences like less sweet, no raisins, call before delivery, or leave at guard house
- WhatsApp button on every order card
- One-tap production workflow progression
- Dashboard order overview for today's total, pending, in-progress, completed, and cancelled orders
- Simplified daily order summary page
- Export today's orders to an Excel `.xlsx` file
- Optional auto-export folder using supported browser folder permissions
- Pricing management for editing products, packaging sizes, and prices without changing code
- Searchable and filterable order list
- Order details, editing, deletion, and quick production status updates
- Production summary by product, pack size, and workflow stage
- Local browser storage with sample data on first launch
- Responsive bottom navigation designed for Android phones

## v1.1.1 Scope

- Local storage only
- No Google Sheets integration
- No backend
- No Hermes integration
- No login system

## Install on Android

After deployment to GitHub Pages, open the site in Chrome on Android and choose:

```text
Menu > Add to Home screen > Install
```

The PWA manifest and service worker are included, so Chrome can install Tastory OMS as a standalone app.

## Export Notes

`Export to Excel` creates `DailyOrders_YYYY-MM-DD.xlsx` for orders created today.

`Auto Export` uses the browser File System Access API when available. If the browser does not support default folder permissions, Tastory OMS falls back to a normal file download.

## Run Locally

No build step or backend is required.

### Option 1: Open the file

Open `index.html` in a browser. An internet connection is needed for the Tailwind CSS CDN.

### Option 2: Use a local server

From this directory, run either:

```powershell
python -m http.server 8000
```

or:

```powershell
npx serve .
```

Then visit `http://localhost:8000` (Python) or the URL shown by `serve`.

## Data Storage

Orders are stored in the browser under the local storage key:

```text
tastory-oms-orders-v1
```

Sample orders are added only when no saved data exists. To restore the sample data, clear the site's local storage and reload the page.

## Product Prices

Prices are currently configured near the top of `app.js` in the `PRODUCTS` array. Update those values to match Tastory's current pricing.

## Project Files

```text
.
|-- index.html
|-- styles.css
|-- app.js
`-- README.md
```
