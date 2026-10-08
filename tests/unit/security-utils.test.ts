import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from '../../src/auth/password.js';
import { safeNext } from '../../src/controllers/authController.js';
import { contentDisposition, detectKind, sanitizeFilename } from '../../src/utils/files.js';
import { highlightSnippet, renderMarkdown } from '../../src/utils/markdown.js';

describe('password hashing', () => {
  it('hashes with a random salt and verifies', async () => {
    const a = await hashPassword('Correct horse 42');
    const b = await hashPassword('Correct horse 42');
    expect(a).not.toBe(b);
    expect(a.startsWith('scrypt$')).toBe(true);
    expect(await verifyPassword('Correct horse 42', a)).toBe(true);
    expect(await verifyPassword('wrong password 42', a)).toBe(false);
    expect(await verifyPassword('anything', 'not-a-hash')).toBe(false);
  });
});

describe('markdown rendering', () => {
  it('escapes raw HTML so article content cannot inject markup', () => {
    const { html } = renderMarkdown('Hello <script>alert(1)</script> <img src=x onerror=alert(1)>');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;script&gt;');
  });

  it('only allows internal or https links', () => {
    const { html } = renderMarkdown('[bad](javascript:alert(1)) [ok](/knowledge) [ext](https://example.com)');
    expect(html).not.toContain('javascript:');
    expect(html).toContain('href="/knowledge"');
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it('builds headings with ids, lists, tables and callouts', () => {
    const { html, headings } = renderMarkdown(
      '## Approval thresholds\n\n- one\n- two\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n\n> [!TIP] Be specific.',
    );
    expect(headings).toEqual([{ id: 'approval-thresholds', text: 'Approval thresholds', level: 2 }]);
    expect(html).toContain('<ul><li>one</li><li>two</li></ul>');
    expect(html).toContain('<table class="md-table">');
    expect(html).toContain('callout-tip');
  });

  it('highlights search snippets safely', () => {
    expect(highlightSnippet('a [[match]] <img src=x>')).toBe('a <mark>match</mark> &lt;img src=x ');
  });
});

describe('file handling', () => {
  it('sanitises filenames: no paths, no control characters, safe charset', () => {
    expect(sanitizeFilename('../../etc/passwd')).toBe('passwd');
    expect(sanitizeFilename('C:\\Users\\me\\Quote "final".PDF')).toBe('Quote _final_.pdf');
    expect(sanitizeFilename('\u0000\u0007.htaccess')).toBe('htaccess');
    expect(sanitizeFilename('Laporan Q3 — final.xlsx')).toBe('Laporan Q3 _ final.xlsx');
  });

  it('accepts a file only when extension and magic bytes agree', () => {
    expect(detectKind('quote.pdf', Buffer.from('%PDF-1.7 ...'))?.mime).toBe('application/pdf');
    expect(detectKind('quote.pdf', Buffer.from('MZ\x90\x00'))).toBeNull();
    expect(detectKind('photo.png', Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))?.mime).toBe(
      'image/png',
    );
    expect(detectKind('script.exe', Buffer.from('MZ'))).toBeNull();
    expect(detectKind('notes.txt', Buffer.from('plain text'))?.mime).toBe('text/plain');
    expect(detectKind('notes.txt', Buffer.from([0x00, 0x01, 0x02]))).toBeNull();
  });

  it('builds RFC 6266 content-disposition headers', () => {
    expect(contentDisposition('attachment', 'Laporan "Q3".pdf')).toBe(
      `attachment; filename="Laporan _Q3_.pdf"; filename*=UTF-8''Laporan%20%22Q3%22.pdf`,
    );
  });
});

describe('post-login redirects', () => {
  it('only allows same-site relative paths', () => {
    expect(safeNext('/requests/1042')).toBe('/requests/1042');
    expect(safeNext('//evil.example')).toBe('/overview');
    expect(safeNext('https://evil.example')).toBe('/overview');
    expect(safeNext('/login')).toBe('/overview');
    expect(safeNext(undefined)).toBe('/overview');
  });
});
