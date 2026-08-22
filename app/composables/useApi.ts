import type { NitroFetchOptions } from 'nitropack'

/**
 * $fetch yang aman dipakai dari top-level setup.
 *
 * Saat SSR, $fetch polos tidak ikut membawa cookie browser sehingga
 * requireUserSession() di server/middleware/auth.ts menolak dengan 401.
 * Composable ini meneruskan cookie-nya. Di browser useRequestHeaders()
 * mengembalikan objek kosong, jadi tidak ada efek apa-apa.
 *
 * Harus dipanggil di top-level <script setup>, bukan di dalam fungsi async.
 */
export function useApi() {
  const ssrHeaders = useRequestHeaders(['cookie'])

  return function api<T = unknown>(url: string, opts: NitroFetchOptions<string> = {}): Promise<T> {
    return $fetch<T>(url, {
      ...opts,
      headers: { ...ssrHeaders, ...(opts.headers as Record<string, string> | undefined) }
    } as NitroFetchOptions<string>) as Promise<T>
  }
}
