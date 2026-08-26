// Rumus "Bisa Dipakai": IF(saldo>12000000, MROUND(saldo,1000000)-12000000, 0)
// Nyisain buffer Rp12jt per rekening, sisanya dibulatkan ke juta terdekat.
export function hitungBisaDipakai(saldo: number): number {
  if (!(saldo > 12_000_000)) return 0
  return Math.round(saldo / 1_000_000) * 1_000_000 - 12_000_000
}
