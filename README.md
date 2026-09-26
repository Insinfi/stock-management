# Stockroom

Stockroom is a mobile-first, installable stock manager. It stores articles and an ordered movement queue in IndexedDB, so scanning and stock changes continue to work offline. When configured and online, it syncs the queue to a Google Sheet through a bound Google Apps Script web app.
The interface is available in English and French; the language can be changed from the top bar and is remembered on the device. Translation strings live in `src/locales/en.json` and `src/locales/fr.json`; `src/i18n.ts` provides the typed lookup helper. Screen templates are separated into `src/views/stock/` and `src/views/scan/`, with the scan article form in its own component. Feature behavior lives in `src/features/`: camera and flashlight behavior, article management and stock movements, and cloud synchronization each have a dedicated module.

## Run the app

```sh
npm install
npm run dev
```

Camera access and PWA installation require HTTPS (or `localhost` during development). The PWA service worker is enabled for the Vite development server so you can test installation through an HTTPS tunnel. Point ngrok at Vite's port (`ngrok http 5173`) and open the HTTPS URL in Brave. Use the barcode entry field if camera access is unavailable. For production, run `npm run build` and serve the generated `dist/` directory over HTTPS.
For handmade items without a manufacturer barcode, choose **Create a handmade article** in the scan screen, generate an internal Code 128 barcode, and print a label. These `SM-` barcodes are for your stockroom only; they are not registered GS1 retail barcodes.

## Deploy on GitHub Pages

The GitHub Actions workflow publishes the production PWA to `https://insinfi.github.io/stock-management/` whenever changes are pushed to `main`, or when run manually. In the repository settings, set **Pages → Build and deployment → Source** to **GitHub Actions**. Once the first deployment succeeds, install the app from that Pages URL; unlike the development tunnel, it stays available when your PC is off.

## Connect a Google Sheet

1. Create a Google Sheet and open **Extensions → Apps Script**.
2. Replace the editor contents with `apps-script/Code.gs`, then save. The script creates the `Articles` and `Movements` tabs and their headers during setup. If updating an existing deployment, choose **Deploy → Manage deployments**, edit it, select **New version**, and deploy so edits and deletions are supported by the server.
3. In the Apps Script editor, select and run `setupStockroom` once, then approve the requested Sheets permission. This saves the spreadsheet ID so web-app requests can reopen it reliably.
4. Select **Deploy → New deployment → Web app**. Choose an execution identity and restrict access to your account or organization whenever possible. Deploy and copy the URL ending in `/exec`.
5. In Stockroom, open the gear icon, paste the deployment URL, and save. The app will sync when online; use **Sync** on the stock screen to retry or refresh.

The `Articles` tab keeps the current quantity and last applied command ID. `Movements` is the append-only audit history, including opening quantities, edits, and deletions. Commands have stable IDs and the script serializes writes with a lock, so retrying a queued request does not apply it twice.
The PWA talks to Apps Script through a hidden iframe/form bridge, avoiding cross-origin `fetch` limitations on Apps Script responses.

### Access and data notes

Google Apps Script web apps do not provide a private API automatically. If the deployment is accessible to anyone, anyone who obtains its URL may be able to read or change the sheet. Prefer access restricted to your Google account or Workspace organization, and do not treat the URL as a password. The sheet is the shared source of truth; a device's offline changes remain local until sync succeeds. The app intentionally sends queued movements in order and stops at the first failure.

Offline data is stored in the current browser/device's IndexedDB. It is not automatically shared between devices, and clearing browser data removes unsynced changes. Keep the Sheet as the durable record and sync after reconnecting.

## Stack

- Vite + TypeScript (no UI framework)
- `@zxing/browser` camera barcode decoding
- IndexedDB local cache and movement queue
- `vite-plugin-pwa` app-shell caching and install manifest
- Google Apps Script as the zero-cost Sheets bridge
