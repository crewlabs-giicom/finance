export default defineNuxtRouteMiddleware(async (to) => {
  const publicPages = ['/login', '/register']
  const { loggedIn, fetch } = useUserSession()

  if (!loggedIn.value) {
    await fetch()
  }

  if (!loggedIn.value && !publicPages.includes(to.path)) {
    return navigateTo('/login')
  }
  if (loggedIn.value && publicPages.includes(to.path)) {
    return navigateTo('/rekap-saldo')
  }
})
