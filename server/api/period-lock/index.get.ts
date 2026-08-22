export default defineEventHandler(async () => {
  return { lockYm: await getPeriodLockYm() }
})
