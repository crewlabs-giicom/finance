
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

echo "-> sync hasil .output ke folder serve" >> "$LOG_FILE"
rm -rf "$SERVE_DIR/server" "$SERVE_DIR/public" "$SERVE_DIR/nitro.json" >> "$LOG_FILE" 2>&1
cp -a "$SRC_DIR/.output/." "$SERVE_DIR/" >> "$LOG_FILE" 2>&1

echo "-> stop & start app via cloudlinux-selector (full restart)" >> "$LOG_FILE"
/usr/sbin/cloudlinux-selector restart --json --interpreter nodejs --app-root "$APP_ROOT_RELATIVE" >> "$LOG_FILE" 2>&1
 
echo "-> memancing restart langsung lewat curl" >> "$LOG_FILE"
curl -s -o /dev/null "$APP_URL" || true

echo "===== Deploy finished: $(date) =====" >> "$LOG_FILE"
echo "" >> "$LOG_FILE"