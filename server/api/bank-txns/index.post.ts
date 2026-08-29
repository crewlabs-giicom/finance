import { bankTxns, bankAccounts } from '../../database/schema'
import { eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const accountId = String(body?.accountId || '')
  const tanggal = String(body?.tanggal || '')
  if (!accountId) throw createError({ statusCode: 400, statusMessage: 'accountId wajib diisi.' })
  if (!tanggal) throw createError({ statusCode: 400, statusMessage: 'Isi tanggal transaksi dulu.' })
  await assertNotLocked(tanggal)

  const [acc] = await db.select().from(bankAccounts).where(eq(bankAccounts.id, accountId)).limit(1)
  if (!acc) throw createError({ statusCode: 404, statusMessage: 'Rekening gak ketemu.' })

  const id = genId('bt')
  const debet = Number(body?.debet) || 0
  const kredit = Number(body?.kredit) || 0
  const side = noBankSide(debet, kredit)
  const autoNoBank = side ? await generateNoBank(accountId, side, tanggal) : null
  const urutan = await nextUrutan()

  const row = {
    id,
    accountId,
    tanggal,
    transaksi: String(body?.transaksi || ''),
    cabang: String(body?.cabang || ''),
    debet,
    kredit,
    saldo: 0,
    bankType: acc.bankType,
    noBankManual: autoNoBank || '',
    ketTransaksiManual: '',
    tag: '',
    noteManual: '',
    checked: false,
    manual: true,
    urutan
  }
  await db.insert(bankTxns).values(row)
  const saldo = await recomputeAccountSaldo(accountId)
  return { ...row, saldo: saldo ?? row.saldo }
})
