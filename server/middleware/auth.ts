export default defineEventHandler(async (event) => {
  const url = getRequestURL(event)
  if (!url.pathname.startsWith('/api/')) return
  if (url.pathname.startsWith('/api/auth/')) return
  // Endpoint bawaan nuxt-auth-utils. Dipakai useUserSession().fetch() buat cek
  // status login, jadi harus boleh diakses tanpa sesi — kalau diblok di sini,
  // kondisi "belum login" yang normal jadi lempar 401 dan halaman login rusak.
  if (url.pathname.startsWith('/api/_auth/')) return

  // Setiap request API (selain login/register/logout) wajib login dulu.
  await requireUserSession(event)
})
