#!/bin/bash
# ==========================================================
# Deploy script untuk Finance App (Nuxt 3)
# Arsitektur: source folder terpisah dari folder yang di-serve
#   SRC_DIR   -> tempat git pull + build (gak diakses publik)
#   SERVE_DIR -> isi cuma hasil .output, ini yang didaftarkan
#                di cPanel "Setup Node.js App"
# Build pakai node/npm SISTEM langsung (bypass CloudLinux
# Selector venv) biar gak kena aturan symlink node_modules.
# ==========================================================

set -e  # stop kalau ada command yang gagal

SRC_DIR="/home/giicom/js_app/finance"
SERVE_DIR="/home/giicom/public_html/finance"
APP_ROOT_RELATIVE="public_html/finance"
BRANCH="main"                               # <-- ganti kalau branch deploy bukan main
LOG_FILE="$SRC_DIR/deploy.log"

# Path file database SQLite.
# HARUS absolute: script ini jalan dari SRC_DIR sedangkan Passenger jalan dari
# SERVE_DIR, jadi path relatif hehe akan menghasilkan DUA database yang berbeda.
# HARUS sama persis dengan DATABASE_PATH di cPanel -> Setup Node.js App ->
# Environment variables (env panel itu tidak terbaca dari script ini).
# Ditaruh di luar public_html supaya file DB tidak bisa diunduh lewat URL.
export DATABASE_PATH="/home/giicom/finance-data/finance.db"

# Jumlah backup database yang disimpan (yang lebih lama dibuang otomatis)
KEEP_BACKUPS=10

# URL publik app, dipakai buat trigger restart langsung
# (karena restart.txt itu "lazy restart" — baru jalan pas ada
# request masuk, jadi kita pancing sendiri pakai curl)
APP_URL="https://giicom.id/finance"

# Sesuaikan kalau versi Node sistemnya beda dari 22
export PATH="/opt/alt/alt-nodejs22/root/usr/bin:$PATH"

echo "===== Deploy started: $(date) =====" >> "$LOG_FILE"

cd "$SRC_DIR"

echo "-> git fetch & reset ke origin/$BRANCH" >> "$LOG_FILE"
git fetch origin "$BRANCH" >> "$LOG_FILE" 2>&1
git reset --hard "origin/$BRANCH" >> "$LOG_FILE" 2>&1

echo "-> npm install (--include=dev)" >> "$LOG_FILE"
npm install --include=dev >> "$LOG_FILE" 2>&1

echo "-> npm run build" >> "$LOG_FILE"
npm run build >> "$LOG_FILE" 2>&1

echo "-> backup database" >> "$LOG_FILE"
# Migrasi skema tidak bisa di-undo, jadi selalu ambil salinan dulu.
# Pakai online-backup API SQLite (bukan `cp`) supaya aman walau app sedang
# melayani request dan masih ada isi di file -wal.
mkdir -p "$(dirname "$DATABASE_PATH")" >> "$LOG_FILE" 2>&1
if [ -f "$DATABASE_PATH" ]; then
  BACKUP="$DATABASE_PATH.bak-$(date +%Y%m%d-%H%M%S)"
  node -e 'const D=require("better-sqlite3");new D(process.argv[1]).backup(process.argv[2]).then(()=>console.log("backup -> "+process.argv[2]),e=>{console.error(String(e));process.exit(1)})' \
    "$DATABASE_PATH" "$BACKUP" >> "$LOG_FILE" 2>&1
  # Buang backup lama, sisakan $KEEP_BACKUPS yang terbaru.
  ls -t "$DATABASE_PATH".bak-* 2>/dev/null | tail -n "+$((KEEP_BACKUPS + 1))" | xargs -r rm -f
else
  echo "   (database belum ada, ini deploy pertama)" >> "$LOG_FILE"
fi

echo "-> migrasi database" >> "$LOG_FILE"
# Dijalankan dari SRC_DIR, bukan SERVE_DIR: drizzle-kit butuh drizzle.config.ts,
# folder server/database/migrations/, dan node_modules — dan SERVE_DIR cuma
# berisi hasil .output. Idempoten, migrasi yang sudah jalan dilewati.
npm run db:migrate >> "$LOG_FILE" 2>&1

echo "-> sync hasil .output ke folder serve" >> "$LOG_FILE"
rm -rf "$SERVE_DIR/server" "$SERVE_DIR/public" "$SERVE_DIR/nitro.json" >> "$LOG_FILE" 2>&1
cp -a "$SRC_DIR/.output/." "$SERVE_DIR/" >> "$LOG_FILE" 2>&1

echo "-> stop & start app via cloudlinux-selector (full restart)" >> "$LOG_FILE"
/usr/sbin/cloudlinux-selector restart --json --interpreter nodejs --app-root "$APP_ROOT_RELATIVE" >> "$LOG_FILE" 2>&1
 
echo "-> memancing restart langsung lewat curl" >> "$LOG_FILE"
curl -s -o /dev/null "$APP_URL" || true

echo "===== Deploy finished: $(date) =====" >> "$LOG_FILE"
echo "" >> "$LOG_FILE"