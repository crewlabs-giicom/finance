# Finance System — Nuxt + SQLite

Versi web (server-backed) dari aplikasi Rekap Saldo & Finance yang sebelumnya jalan sebagai 1 file HTML. Sekarang datanya disimpan di database SQLite di server, jadi bisa diakses online oleh banyak orang sekaligus, masing-masing pakai akun sendiri.

## Isi Phase 1 (yang sudah jadi & bisa dipakai)

- Login/register per-user (user pertama yang daftar otomatis jadi admin, sisanya staff)
- Master Data: kelola Grup PT/Rekening, Rekening Bank (buat Rincian Bank), dan Tag
- Rekap Saldo: Saldo Rekening Bank (per grup + total), Deposito, Hutang, Bayar
- Rincian Bank: tambah/edit transaksi manual, kasih Tag/No Bank/Ket/Catatan, warnain baris & duplicate baris lewat klik kanan, filter per bulan

Menu lain (List Pajak, Entertainment, Aktiva-Pasiva, Tagihan Ekspedisi, Aset, Daftar Norminatif, Kunci Periode) menyusul di fase berikutnya — tapi skema database & datanya sudah disiapkan dan di-migrate dari aplikasi lama, jadi tinggal dibikinin tampilannya.

## Jalanin di komputer sendiri (development)

```bash
npm install
cp .env.example .env   # lalu isi NUXT_SESSION_PASSWORD dengan random string minimal 32 karakter
npx drizzle-kit migrate
npm run dev
```

Buka http://localhost:3000, daftar akun pertama (otomatis jadi admin).

## Pindahin data dari aplikasi HTML lama

1. Di aplikasi HTML lama, klik tombol **Export Backup** — nanti kedownload file `backup-rekap-saldo-....json`.
2. Pastikan database masih kosong (baru aja `npx drizzle-kit migrate`, belum ada data lain).
3. Jalankan:
   ```bash
   DATABASE_PATH=./data/finance.db node scripts/migrate-from-backup.mjs /path/ke/backup-rekap-saldo-....json
   ```
4. Cek hasilnya di aplikasi — semua data (Saldo Bank, Deposito, Hutang, Bayar, Rincian Bank, dan data menu-menu yang belum ada tampilannya) sudah pindah.

**Catatan penting**: warna baris (hasil klik kanan → kasih warna) di aplikasi lama TIDAK ikut ke-backup (memang dari dulu gak pernah tersimpan di file export), jadi otomatis juga gak ikut pindah. Ini bukan bug di proses migrasinya — itu keterbatasan yang udah ada dari aplikasi lama.

Jalankan script migrasi ini **cuma sekali** ke database yang masih kosong. Kalau perlu diulang, hapus dulu file `data/finance.db` lalu `npx drizzle-kit migrate` ulang sebelum jalanin migrasinya lagi.

## Deploy ke server (production)

1. Siapkan server dengan Node.js 20+.
2. Upload/clone project ini ke server, lalu:
   ```bash
   npm install
   ```
3. Bikin file `.env` (jangan pakai punya development, generate password baru yang beneran acak untuk `NUXT_SESSION_PASSWORD`):
   ```
   NUXT_SESSION_PASSWORD=<random string minimal 32 karakter>
   DATABASE_PATH=/path/absolut/ke/data/finance.db
   ```
4. Jalankan migrasi skema database:
   ```bash
   npx drizzle-kit migrate
   ```
5. (Opsional, sekali saja) Migrasi data dari aplikasi HTML lama — lihat bagian di atas.
6. Build:
   ```bash
   npm run build
   ```
7. Jalankan servernya:
   ```bash
   PORT=3000 node .output/server/index.mjs
   ```
   Supaya tetap jalan terus (auto-restart kalau crash/server reboot), pakai process manager seperti **pm2**:
   ```bash
   npm install -g pm2
   pm2 start .output/server/index.mjs --name finance-app
   pm2 save
   pm2 startup
   ```
8. Pasang reverse proxy (nginx/Caddy) di depan port 3000 supaya bisa diakses lewat domain + HTTPS. Contoh nginx:
   ```nginx
   server {
     listen 80;
     server_name finance.perusahaanmu.com;
     location / {
       proxy_pass http://127.0.0.1:3000;
       proxy_http_version 1.1;
       proxy_set_header Upgrade $http_upgrade;
       proxy_set_header Connection 'upgrade';
       proxy_set_header Host $host;
     }
   }
   ```
   Lalu pasang SSL gratis pakai Certbot (`certbot --nginx`).

## Backup database

File database-nya cuma 1 file: `data/finance.db` (plus `data/finance.db-wal` & `-shm` kalau ada, itu file sementara SQLite). Backup rutin cukup copy file `finance.db` itu ke tempat aman (misal cron job harian yang nyalin ke Google Drive/S3).

## Struktur teknis (buat referensi)

- **Framework**: Nuxt 4 (Vue 3 + Nitro server, full-stack dalam 1 project)
- **Database**: SQLite lewat Drizzle ORM (`server/database/schema.ts`)
- **Auth**: nuxt-auth-utils (session cookie, password di-hash pakai scrypt)
- **API**: `server/api/**` (tiap file = 1 endpoint REST)
- **Halaman**: `app/pages/**`
