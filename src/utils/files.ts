import path from 'node:path';

/** Strips paths, control characters and anything outside a conservative set; keeps the extension. */
export function sanitizeFilename(name: string): string {
  const base = path.basename(name.replace(/\\/g, '/')).normalize('NFKC');
  const cleaned = base
    // eslint-disable-next-line no-control-regex -- stripping control characters is the point
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/[^\p{L}\p{N} ._()-]/gu, '_')
    .replace(/\s+/g, ' ')
    .replace(/^\.+/, '')
    .trim();
  const ext = path.extname(cleaned).slice(0, 10);
  const stem = cleaned.slice(0, cleaned.length - ext.length).slice(0, 120) || 'file';
  return stem + ext.toLowerCase();
}

type FileKind = { ext: string[]; mime: string; inline: boolean; matches: (head: Buffer) => boolean };

const startsWith = (head: Buffer, bytes: number[]) => bytes.every((b, i) => head[i] === b);
const isZip = (h: Buffer) => startsWith(h, [0x50, 0x4b, 0x03, 0x04]);
const looksLikeText = (h: Buffer) => !h.includes(0) && !/\uFFFD/.test(h.toString('utf8'));

/** Allow-list of upload types. The extension *and* the leading magic bytes must agree. */
export const ATTACHMENT_KINDS: FileKind[] = [
  {
    ext: ['.pdf'],
    mime: 'application/pdf',
    inline: true,
    matches: (h) => h.subarray(0, 5).toString('latin1') === '%PDF-',
  },
  {
    ext: ['.png'],
    mime: 'image/png',
    inline: true,
    matches: (h) => startsWith(h, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  },
  {
    ext: ['.jpg', '.jpeg'],
    mime: 'image/jpeg',
    inline: true,
    matches: (h) => startsWith(h, [0xff, 0xd8, 0xff]),
  },
  {
    ext: ['.webp'],
    mime: 'image/webp',
    inline: true,
    matches: (h) =>
      h.subarray(0, 4).toString('latin1') === 'RIFF' && h.subarray(8, 12).toString('latin1') === 'WEBP',
  },
  {
    ext: ['.docx'],
    mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    inline: false,
    matches: isZip,
  },
  {
    ext: ['.xlsx'],
    mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    inline: false,
    matches: isZip,
  },
  {
    ext: ['.pptx'],
    mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    inline: false,
    matches: isZip,
  },
  { ext: ['.csv'], mime: 'text/csv', inline: false, matches: looksLikeText },
  { ext: ['.txt'], mime: 'text/plain', inline: false, matches: looksLikeText },
];

export const IMAGE_KINDS = ATTACHMENT_KINDS.filter((k) => k.mime.startsWith('image/'));

export function detectKind(
  filename: string,
  head: Buffer,
  kinds: FileKind[] = ATTACHMENT_KINDS,
): FileKind | null {
  const ext = path.extname(filename).toLowerCase();
  const kind = kinds.find((k) => k.ext.includes(ext));
  return kind && head.length > 0 && kind.matches(head) ? kind : null;
}

export const ACCEPT_ATTRIBUTE = ATTACHMENT_KINDS.flatMap((k) => k.ext).join(',');

/** RFC 6266 Content-Disposition with an ASCII fallback and a UTF-8 filename*. */
export function contentDisposition(type: 'attachment' | 'inline', filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  return `${type}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
