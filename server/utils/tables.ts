import {
  asetRows, avpRows, coaMaster, dnRows, entRows, mpStores,
  npwpMaster, ppnRows, teFinanceRows, teGudangRows
} from '../database/schema'
import { defineCrud } from './crud'

/**
 * Deklarasi CRUD tiap entitas. File route di server/api/* cuma mengekspor
 * salah satu handler dari sini, jadi aturan field & guard kunci periode
 * hanya ditulis di satu tempat.
 */

export const crud = {
  // ---------- List Pajak ----------
  ppn: defineCrud({
    table: ppnRows,
    idPrefix: 'ppn',
    dateField: 'tanggal',
    required: ['tanggal'],
    fields: {
      sourceTxnId: 'ref', groupId: 'ref', tanggal: 'date', code: 'str', store: 'str',
      description: 'text', tags: 'str', debet: 'num', kredit: 'num', note: 'text',
      npwpId: 'ref', noInvoice: 'str', netDibayarkan: 'numOrNull', ppn: 'numOrNull',
      dpp: 'numOrNull', pph23: 'numOrNull', pph23_4a2: 'numOrNull', pph21bp: 'numOrNull',
      lampiranFakturPajak: 'str', masaKredit: 'str', bentukJenisBiaya: 'str'
    }
  }),

  npwp: defineCrud({
    table: npwpMaster,
    idPrefix: 'npwp',
    required: ['noNpwp', 'namaNpwp'],
    fields: { noNpwp: 'str', namaNpwp: 'str', nik: 'str', alamat: 'str' }
  }),

  // ---------- Entertainment ----------
  ent: defineCrud({
    table: entRows,
    idPrefix: 'ent',
    dateField: 'tanggal',
    required: ['tanggal'],
    fields: {
      sourceTxnId: 'ref', groupId: 'ref', tanggal: 'date', place: 'str', alamat: 'str',
      description: 'text', jenis: 'str', amount: 'num', clientName: 'str', posisi: 'str',
      company: 'str', jenisUsaha: 'str', note: 'text'
    }
  }),

  // ---------- Aktiva - Pasiva ----------
  avp: defineCrud({
    table: avpRows,
    idPrefix: 'avp',
    dateField: 'tanggal',
    required: ['tanggal'],
    fields: {
      coaId: 'ref', groupId: 'ref', tanggal: 'date', code: 'str', store: 'str',
      description: 'text', tags: 'str', debet: 'num', kredit: 'num'
    }
  }),

  coa: defineCrud({
    table: coaMaster,
    idPrefix: 'coa',
    required: ['noCoa', 'namaCoa'],
    fields: { noCoa: 'str', namaCoa: 'str' }
  }),

  // ---------- Daftar Norminatif ----------
  dn: defineCrud({
    table: dnRows,
    idPrefix: 'dn',
    dateField: 'tanggal',
    fields: { tanggal: 'date', description: 'text', amount: 'num', npwpId: 'ref' }
  }),

  // ---------- Tagihan Ekspedisi ----------
  teGudang: defineCrud({
    table: teGudangRows,
    idPrefix: 'teg',
    dateField: 'tanggal',
    required: ['noWaybill'],
    fields: {
      tanggal: 'date', namaPengirim: 'str', namaPenerima: 'str', invGii: 'str',
      noWaybill: 'str', biaya: 'num', keperluan: 'str'
    }
  }),

  teFinance: defineCrud({
    table: teFinanceRows,
    idPrefix: 'tef',
    dateField: 'tanggal',
    required: ['noWaybill'],
    fields: { tanggal: 'date', noWaybill: 'str', biaya: 'num', namaPenerima: 'str', keterangan: 'str' }
  }),

  // ---------- Aset ----------
  aset: defineCrud({
    table: asetRows,
    idPrefix: 'ast',
    required: ['nama'],
    fields: {
      tipe: 'str', kategori: 'str', grupId: 'ref', div: 'str', nama: 'str', deposit: 'num',
      bankAccountId: 'ref', tglMulai: 'date', noAset: 'str', keterangan: 'str',
      umurEkonomis: 'num', hargaPerolehan: 'num'
    }
  }),

  // ---------- Rincian MP ----------
  mpStore: defineCrud({
    table: mpStores,
    idPrefix: 'mps',
    required: ['nama'],
    fields: { groupId: 'ref', nama: 'str', platform: 'str', saldoAwal: 'num' }
  })
}
