export default defineEventHandler(async (event) => {
  const url = getRequestURL(event)
  if (!url.pathname.startsWith('/api/')) return
  if (url.pathname.startsWith('/api/auth/')) return

  // Setiap request API (selain login/register/logout) wajib login dulu.
  await requireUserSession(event)
})
