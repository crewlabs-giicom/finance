import { and, eq, gte, lte } from 'drizzle-orm'
import type { SQLiteTable } from 'drizzle-orm/sqlite-core'

/**
 * Pabrik handler CRUD.
 *
 * Sepuluh modul di app ini bentuk endpoint-nya sama persis (list / create /
 * patch / delete satu tabel, dengan guard kunci periode). Daripada menulis
 * ~40 file yang isinya nyaris identik, tiap entitas cukup dideklarasikan sekali
 * di server/utils/tables.ts lalu file route-nya tinggal mengekspor handlernya.
 */

export type FieldKind =
  | 'str'      // selalu string
  | 'text'     // string, boleh panjang
  | 'num'      // number, kosong -> 0
  | 'numOrNull'// number, kosong/null -> null
  | 'bool'     // boolean
  | 'date'     // 'YYYY-MM-DD', kosong -> null
  | 'ref'      // FK, kosong -> null (biar tidak melanggar foreign key)

export type FieldSpec = Record<string, FieldKind>

function coerce(kind: FieldKind, v: unknown): unknown {
  switch (kind) {
    case 'str':
    case 'text':
      return v === null || v === undefined ? '' : String(v)
    case 'num':
      return Number(v) || 0
    case 'numOrNull':
      return v === '' || v === null || v === undefined ? null : (Number(v) || 0)
    case 'bool':
      return v === true || v === 1 || v === '1' || v === 'true'
    case 'date':
    case 'ref':
      return v === '' || v === null || v === undefined ? null : String(v)
  }
}

export type CrudOptions = {
  table: SQLiteTable & { id: any }
  idPrefix: string
  fields: FieldSpec
  /** Field yang wajib ada isinya waktu create. */
  required?: string[]
  /** Kolom tanggal yang dipakai buat cek kunci periode. Kosong = tabel master, tidak dikunci. */
  dateField?: string
  /** Nilai default tambahan waktu create, di luar apa yang dikirim client. */
  defaults?: Record<string, unknown>
}

export function defineCrud(opts: CrudOptions) {
  const { table, idPrefix, fields, required = [], dateField, defaults = {} } = opts
  const cols = table as unknown as Record<string, any>

  async function rowById(id: string) {
    const [row] = await db.select().from(table).where(eq(cols.id, id)).limit(1)
    return row as Record<string, any> | undefined
  }

  /** Kunci periode dicek pada tanggal LAMA dan tanggal BARU — memindahkan baris keluar/masuk periode terkunci sama-sama dilarang. */
  async function assertEditable(oldDate?: unknown, newDate?: unknown) {
    if (!dateField) return
    if (oldDate) await assertNotLocked(String(oldDate))
    if (newDate) await assertNotLocked(String(newDate))
  }

  return {
    /**
     * Query param opsional: `from`/`to` (filter dateField, kalau tabelnya punya)
     * dan nama field 'ref' apa pun di `fields` (mis. `groupId`, `coaId`) buat
     * exact-match. Gak ada satupun query param dikirim -> behavior sama persis
     * kayak dulu (balikin seluruh tabel), jadi non-breaking buat pemanggil lama.
     */
    list: defineEventHandler(async (event) => {
      const q = getQuery(event)
      const conditions = []
      if (dateField) {
        if (q.from) conditions.push(gte(cols[dateField], String(q.from)))
        if (q.to) conditions.push(lte(cols[dateField], String(q.to)))
      }
      for (const [name, kind] of Object.entries(fields)) {
        if (kind === 'ref' && q[name] !== undefined && q[name] !== '') {
          conditions.push(eq(cols[name], String(q[name])))
        }
      }
      if (!conditions.length) return await db.select().from(table)
      return await db.select().from(table).where(and(...conditions))
    }),

    create: defineEventHandler(async (event) => {
      const body = await readBody(event) || {}
      for (const f of required) {
        if (body[f] === undefined || body[f] === null || body[f] === '') {
          throw createError({ statusCode: 400, statusMessage: `Field "${f}" wajib diisi.` })
        }
      }
      await assertEditable(undefined, dateField ? body[dateField] : undefined)

      const row: Record<string, unknown> = { id: genId(idPrefix), ...defaults }
      for (const [name, kind] of Object.entries(fields)) {
        if (body[name] !== undefined) row[name] = coerce(kind, body[name])
      }
      await db.insert(table).values(row as any)
      return await rowById(row.id as string)
    }),

    patch: defineEventHandler(async (event) => {
      const id = getRouterParam(event, 'id')!
      const body = await readBody(event) || {}
      const existing = await rowById(id)
      if (!existing) throw createError({ statusCode: 404, statusMessage: 'Baris gak ketemu.' })

      await assertEditable(dateField ? existing[dateField] : undefined, dateField ? body[dateField] : undefined)

      const patch: Record<string, unknown> = {}
      for (const [name, kind] of Object.entries(fields)) {
        if (body[name] !== undefined) patch[name] = coerce(kind, body[name])
      }
      if (!Object.keys(patch).length) throw createError({ statusCode: 400, statusMessage: 'Gak ada field yang diupdate.' })

      await db.update(table).set(patch).where(eq(cols.id, id))
      return { ok: true }
    }),

    /** Insert banyak baris sekaligus — dipakai importer XLSX/CSV. Body: { rows: [...] }. */
    bulkCreate: defineEventHandler(async (event) => {
      const body = await readBody(event) || {}
      const input = Array.isArray(body.rows) ? body.rows : null
      if (!input) throw createError({ statusCode: 400, statusMessage: 'Body harus berbentuk { rows: [...] }.' })
      if (!input.length) return { inserted: 0, skipped: 0 }

      const values: Record<string, unknown>[] = []
      let skipped = 0
      for (const item of input) {
        if (required.some(f => item?.[f] === undefined || item[f] === null || item[f] === '')) { skipped++; continue }
        if (dateField && item[dateField]) {
          // Baris di periode terkunci dilewati, bukan bikin seluruh import gagal.
          const lockYm = await getPeriodLockYm()
          if (lockYm && String(item[dateField]).slice(0, 7) <= lockYm) { skipped++; continue }
        }
        const row: Record<string, unknown> = { id: genId(idPrefix), ...defaults }
        for (const [name, kind] of Object.entries(fields)) {
          if (item[name] !== undefined) row[name] = coerce(kind, item[name])
        }
        values.push(row)
      }

      // Dipotong per 500 baris supaya jumlah bound parameter tetap jauh di bawah
      // SQLITE_MAX_VARIABLE_NUMBER (32766 di build better-sqlite3).
      for (let i = 0; i < values.length; i += 500) {
        await db.insert(table).values(values.slice(i, i + 500) as any)
      }
      return { inserted: values.length, skipped }
    }),

    /** Kosongkan seluruh tabel — tombol "Hapus Semua" di modul importer. */
    removeAll: defineEventHandler(async () => {
      await db.delete(table)
      return { ok: true }
    }),

    remove: defineEventHandler(async (event) => {
      const id = getRouterParam(event, 'id')!
      const existing = await rowById(id)
      if (!existing) return { ok: true } // sudah hilang, anggap sukses
      await assertEditable(dateField ? existing[dateField] : undefined)
      await db.delete(table).where(eq(cols.id, id))
      return { ok: true }
    })
  }
}
