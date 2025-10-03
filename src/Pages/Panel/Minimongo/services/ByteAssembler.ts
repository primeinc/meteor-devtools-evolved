/**
 * ByteAssembler: Memory-efficient JSON array writer
 *
 * Builds valid JSON arrays without creating huge intermediate strings.
 * Chunks are accumulated as Uint8Arrays to stay under memory limits.
 */

export class ByteAssembler {
  private enc = new TextEncoder()
  private parts: Uint8Array[] = []
  private total = 0

  constructor(private hardCapBytes = 250 * 1024 * 1024) {}

  private pushStr(s: string): void {
    const u8 = this.enc.encode(s)
    this.total += u8.byteLength
    if (this.total > this.hardCapBytes) {
      throw new Error(`Export exceeds size limit of ${this.hardCapBytes} bytes`)
    }
    this.parts.push(u8)
  }

  beginArray(): void {
    this.pushStr('[')
  }

  item(json: string, isLast: boolean): void {
    this.pushStr(json)
    if (!isLast) {
      this.pushStr(',')
    }
  }

  endArray(): void {
    this.pushStr(']')
  }

  toBlob(): Blob {
    return new Blob(this.parts, { type: 'application/json' })
  }

  getTotalBytes(): number {
    return this.total
  }
}
