# Tutorial Git & Deploy — Finance App

Panduan lengkap dari setup repo sampai rutinitas push harian.

## Peta alurnya

```
       LOKAL                    GITHUB                      SERVER (cPanel)
  c:\laragon\www\             crewlabs-giicom
     finance-app        →        /finance         →    ~/js_app/finance      (SRC_DIR)
                                  branch: main          ├─ git pull
   ngoding, commit                                      ├─ npm install
                                                        ├─ npm run build
                                                        ├─ db:migrate
                                                        └─ copy .output/  ──┐
                                                                            ↓
                                                     ~/public_html/finance  (SERVE_DIR)
                                                     └─ isinya cuma .output
                                                        ini yang di-serve Passenger

   Database TIDAK lewat git → ~/finance-data/finance.db (di luar public_html)
```

Dua folder terpisah di server itu disengaja: source & `node_modules` tidak boleh
bisa diakses publik, sedangkan yang didaftarkan di cPanel Setup Node.js App cuma
folder berisi hasil build.

---

# Bagian 1 — Setup awal (sekali seumur hidup)

## 1.1 Benerin branch di GitHub

**Kondisi awal yang perlu dibereskan:** repo punya dua branch dengan sejarah yang
sama sekali tidak nyambung — `main` cuma berisi `LICENSE` (commit otomatis waktu
repo dibuat), sedangkan kode aslinya ada di `master`.

Kalau dibiarkan, cPanel akan meng-clone `main` dan yang ke-deploy cuma file LICENSE.

Kita satukan tanpa force push, supaya LICENSE dan seluruh sejarah kode sama-sama selamat:

```bash
# 1. pastikan semua kerjaan lokal sudah ter-commit dulu
git status

# 2. ambil kondisi terbaru dari GitHub
git fetch origin

# 3. gabungkan LICENSE dari main ke branch kerja kita
git merge origin/main --allow-unrelated-histories -m "Gabungkan LICENSE dari main"

# 4. ganti nama branch lokal master -> main
git branch -m master main

# 5. push, sekalian set upstream
git push -u origin main
```

Lalu di GitHub → **Settings → General → Default branch** → pastikan `main`.

Terakhir, hapus `master` yang sudah tidak dipakai (opsional):

```bash
git push origin --delete master
```

> Setelah ini `BRANCH="main"` di [scripts/deploy.sh](../scripts/deploy.sh) sudah benar,
> tidak perlu diubah.

## 1.2 Deploy key: biar server bisa menarik dari GitHub

Repo private tidak bisa di-clone tanpa kredensial. Pakai SSH key, bukan password.

**Di cPanel** → SSH Access → Manage SSH Keys → Generate a New Key (kosongkan
passphrase, supaya deploy otomatis tidak minta ketikan). Lalu klik **View/Download**
pada public key-nya dan salin isinya.

**Di GitHub** → repo → Settings → Deploy keys → Add deploy key:
- Title: `cpanel-giicom`
- Key: tempel public key tadi
- **Allow write access: JANGAN dicentang** — server cuma perlu membaca

Uji dari Terminal cPanel:

```bash
ssh -T git@github.com
```

Muncul `Hi crewlabs-giicom/finance! You've successfully authenticated` = berhasil.

## 1.3 Clone di server

```bash
mkdir -p ~/js_app
cd ~/js_app
git clone git@github.com:crewlabs-giicom/finance.git finance
```

Wajib pakai URL bentuk SSH (`git@github.com:...`), bukan HTTPS — kalau HTTPS,
deploy key-nya tidak terpakai dan `git pull` akan minta password.

## 1.4 Bikin aplikasi Node.js di cPanel

cPanel → **Setup Node.js App** → Create Application:

| Field | Isi |
|---|---|
| Node.js version | 22 |
| Application mode | Production |
| Application root | `public_html/finance` |
| Application URL | `giicom.id/finance` |
| Application startup file | `server/index.mjs` |

> Startup file-nya `server/index.mjs`, **bukan** `app.js` — karena yang disalin ke
> `SERVE_DIR` cuma isi folder `.output/`, jadi entry point-nya ada di
> `SERVE_DIR/server/index.mjs`. File `app.js` di root repo hanya dipakai kalau
> kamu menjalankan aplikasi langsung dari folder source.

Lalu isi **Environment variables** di panel yang sama:

| Variable | Nilai |
|---|---|
| `DATABASE_PATH` | `/home/giicom/finance-data/finance.db` |
| `NUXT_SESSION_PASSWORD` | string acak ≥32 karakter |
| `NODE_ENV` | `production` |

Bikin nilai `NUXT_SESSION_PASSWORD` langsung di Terminal cPanel:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

⚠️ Jangan pernah menaruh nilai ini di file yang ter-commit. `.env` sudah masuk
`.gitignore`, dan di server nilainya memang hanya hidup di panel cPanel.

## 1.5 Siapkan folder database

```bash
mkdir -p ~/finance-data
```

Harus di luar `public_html`. Kalau file `.db` berada di dalam document root,
seluruh data keuangan berpotensi bisa diunduh siapa saja lewat URL.

## 1.6 Pindahkan data yang sudah ada

Isi database **tidak ikut git** (`data/*.db` dan `legacy/*.json` di-ignore).
Kalau server harus membawa data yang sudah ada di lokal:

**Di lokal** — bikin salinan bersih (jangan copy `finance.db` mentah, karena
perubahan terbaru masih menumpuk di file `-wal`):

```bash
node -e "new (require('better-sqlite3'))('./data/finance.db').backup('./finance-deploy.db').then(()=>console.log('ok'))"
```

Upload `finance-deploy.db` lewat cPanel File Manager ke `~/finance-data/`,
lalu rename jadi `finance.db`.

**Alternatif** — import ulang dari backup JSON aplikasi lama:

```bash
cd ~/js_app/finance
export DATABASE_PATH=/home/giicom/finance-data/finance.db
npm run db:import -- legacy/backup-xxx.json
```

## 1.7 Deploy pertama

```bash
bash ~/js_app/finance/scripts/deploy.sh
```

Deploy pertama paling lama karena `npm install` mengunduh semua dependency dari nol.
Pantau prosesnya:

```bash
tail -f ~/js_app/finance/deploy.log
```

Kalau belum ada user sama sekali, buka `https://giicom.id/finance/register` —
user pertama yang mendaftar otomatis jadi admin.

---

# Bagian 2 — Rutinitas: ngoding → push → deploy

Ini yang dipakai sehari-hari.

## 2.1 Ngoding di lokal

⚠️ **Pakai Node 22, bukan Node 23.** Node 23 itu rilis ganjil dan ditolak Nuxt 4.5
(`EBADENGINE`). Di Laragon sudah tersedia:

```bash
export PATH="/c/laragon/bin/nodejs/node-v22:$PATH"
npm run dev
```

## 2.2 Commit & push

```bash
git status                     # lihat apa saja yang berubah
git add -A
git commit -m "Perbaiki perhitungan saldo berjalan"
git push origin main
```

**Yang tidak boleh ikut ter-commit** (sudah dijaga `.gitignore`, tapi tetap dicek
waktu `git status`):

| File | Alasan |
|---|---|
| `.env` | berisi session password |
| `data/*.db` | database, bisa besar & bikin konflik |
| `legacy/*.json` | data keuangan asli |
| `node_modules/`, `.output/`, `.nuxt/` | hasil generate, dibangun ulang di server |

## 2.3 Deploy ke server

Dari Terminal cPanel:

```bash
bash ~/js_app/finance/scripts/deploy.sh
```

Script itu otomatis: `git reset --hard origin/main` → `npm install` → `npm run build`
→ **backup database** → `npm run db:migrate` → salin `.output/` ke `SERVE_DIR`
→ restart aplikasi.

Karena pakai `git reset --hard`, perubahan apa pun yang diedit langsung di server
akan **hilang**. Itu memang disengaja — GitHub adalah satu-satunya sumber kebenaran.

Mau tanpa buka Terminal? Pasang **cPanel → Cron Jobs** yang menjalankan script itu,
atau pakai **Git Version Control** dengan [.cpanel.yml](../.cpanel.yml) yang sudah ada
supaya cukup klik tombol *Deploy HEAD Commit*.

---

# Bagian 3 — Kalau mengubah struktur database

Mengubah [server/database/schema.ts](../server/database/schema.ts) **belum** mengubah
database. File migrasi harus di-generate dan ikut di-commit.

```bash
# 1. edit server/database/schema.ts

# 2. generate file migrasi SQL
npm run db:generate

# 3. terapkan ke database lokal, lalu tes aplikasinya
npm run db:migrate
npm run dev

# 4. commit SCHEMA + hasil generate-nya sekaligus
git add server/database/
git commit -m "Tambah kolom catatan di tabel aset"
git push origin main
```

Di server, `deploy.sh` menjalankan `db:migrate` otomatis. Drizzle mencatat migrasi
yang sudah pernah jalan, jadi aman dipanggil berkali-kali.

> **Jangan pernah mengedit file migrasi yang sudah ter-push.** Kalau sudah terlanjur
> jalan di server, file itu dianggap selesai dan tidak akan diulang. Perubahan
> berikutnya harus jadi file migrasi baru.

---

# Bagian 4 — Kalau ada masalah

## Deploy gagal

Selalu mulai dari log:

```bash
tail -50 ~/js_app/finance/deploy.log
```

| Gejala | Penyebab & solusi |
|---|---|
| `npm: command not found` | PATH Node salah. Cek baris `export PATH=...alt-nodejs22...` di `deploy.sh` cocok dengan versi Node yang terpasang |
| Build berhenti tanpa error jelas | Kehabisan memori. Turunkan `NODE_OPTIONS=--max-old-space-size=1024`, atau build di lokal lalu upload `.output/` |
| `Permission denied (publickey)` | Deploy key belum terpasang, atau URL clone masih HTTPS. Uji `ssh -T git@github.com` |
| Halaman 503 setelah deploy | Startup file salah. Harus `server/index.mjs`, bukan `app.js` |
| Login selalu gagal | `NUXT_SESSION_PASSWORD` kosong / kurang dari 32 karakter. Isi lalu Restart |
| Data kosong padahal sudah diisi | `DATABASE_PATH` di panel cPanel beda dengan yang di `deploy.sh` → jadi dua database terpisah. Samakan |

## Mengembalikan database

`deploy.sh` selalu membuat backup sebelum migrasi, disimpan 10 yang terbaru:

```bash
ls -lt ~/finance-data/finance.db.bak-*

# matikan dulu aplikasinya lewat Setup Node.js App -> Stop, lalu:
cp ~/finance-data/finance.db.bak-20260823-120000 ~/finance-data/finance.db
rm -f ~/finance-data/finance.db-wal ~/finance-data/finance.db-shm
```

File `-wal` dan `-shm` wajib ikut dihapus — kalau tertinggal, isinya bisa
menimpa kembali database yang baru saja kamu pulihkan.

## Kembali ke versi kode sebelumnya

```bash
git log --oneline -10          # cari commit yang masih sehat
git revert <commit-yang-rusak>
git push origin main
```

Lalu deploy ulang. Pakai `git revert`, bukan `reset`, supaya sejarah di GitHub
tetap utuh dan mesin lain tidak ikut kacau.

---

# Bagian 5 — Contekan cepat

```bash
# --- LOKAL ---
export PATH="/c/laragon/bin/nodejs/node-v22:$PATH"   # wajib, Node 23 tidak didukung
npm run dev                                          # jalankan dev server
npm run db:generate                                  # setelah mengubah schema.ts
npm run db:migrate                                   # terapkan ke DB lokal
git add -A && git commit -m "pesan" && git push origin main

# --- SERVER (Terminal cPanel) ---
bash ~/js_app/finance/scripts/deploy.sh              # deploy
tail -f ~/js_app/finance/deploy.log                  # pantau
ls -lt ~/finance-data/finance.db.bak-*               # daftar backup
```

| Perintah npm | Fungsi |
|---|---|
| `npm run dev` | Dev server dengan hot reload |
| `npm run build` | Build produksi ke `.output/` |
| `npm run db:generate` | Bikin file migrasi dari perubahan `schema.ts` |
| `npm run db:migrate` | Terapkan migrasi ke database |
| `npm run db:import` | Import dari backup JSON aplikasi HTML lama |
| `npm run db:from-mysql` | Pindahkan data dari MySQL lama ke SQLite (sekali pakai) |
