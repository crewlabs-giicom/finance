// Entry point untuk cPanel "Setup Node.js App" (Phusion Passenger).
// Passenger menjalankan file ini; isinya cuma memuat hasil build Nitro.
// Jalankan `npm run build` dulu supaya folder .output/ ada.
import('./.output/server/index.mjs')
