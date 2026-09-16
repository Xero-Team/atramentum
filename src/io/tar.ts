// A minimal POSIX/ustar unpacker (fflate has no tar support; all we need is to read our own course archives)
// Supports the GNU 'L' long-name entry; pax extension headers are skipped (our paths are short enough not to need them)
export interface TarEntry {
  name: string
  data: Uint8Array
}

export function untarSync(buf: Uint8Array): TarEntry[] {
  const out: TarEntry[] = []
  const dec = new TextDecoder()
  let off = 0
  let longName: string | null = null
  while (off + 512 <= buf.length) {
    const header = buf.subarray(off, off + 512)
    // A 512-byte all-zero block ends the archive
    if (header.every((b) => b === 0)) break
    const name = dec.decode(header.subarray(0, 100)).replace(/\0.*$/, '')
    const size = parseInt(dec.decode(header.subarray(124, 136)).replace(/\0/g, '').trim() || '0', 8) || 0
    const type = header[156]
    off += 512
    const data = buf.subarray(off, off + size)
    off += Math.ceil(size / 512) * 512
    if (type === 0x4c) {
      // 'L' GNU long name: the data is the next entry's name
      longName = dec.decode(data).replace(/\0.*$/, '')
      continue
    }
    if (type === 0 || type === 0x30) {
      // '\0' or '0': a regular file (directory '5', links and the rest are skipped)
      out.push({ name: longName ?? name, data })
    }
    longName = null
  }
  return out
}
