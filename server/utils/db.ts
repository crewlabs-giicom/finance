import mysql from 'mysql2/promise'
import { drizzle } from 'drizzle-orm/mysql2'
import * as schema from '../database/schema'

const url = process.env.DATABASE_URL
if (!url) throw new Error('DATABASE_URL belum diset. Contoh: mysql://root:@127.0.0.1:3306/finance_app')

export const pool = mysql.createPool({
  uri: url,
  connectionLimit: 10,
  // Kolom double dikembalikan sebagai number (default mysql2), bukan string —
  // aritmetika di aplikasi tetap sama seperti waktu masih pakai SQLite `real`.
  decimalNumbers: true
})

export const db = drizzle(pool, { schema, mode: 'default' })
