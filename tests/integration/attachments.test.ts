import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, scalar, signIn, type Agent, type TestContext } from '../helpers/testApp.js';

let ctx: TestContext;
let owner: Agent;
let stranger: Agent;
let n: number;

beforeAll(async () => {
  ctx = await createTestApp({ UPLOAD_MAX_BYTES: '2048' });
  owner = await signIn(ctx.app, 'sinta.wirawan@arunika.co.id');
  stranger = await signIn(ctx.app, 'putri.anggraini@arunika.co.id');
  n = 1042;
});
afterAll(async () => ctx?.close());

function multipart(filename: string, content: Buffer | string, mime = 'application/octet-stream') {
  const boundary = '----flowdesk' + Math.random().toString(16).slice(2);
  const head = `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${mime}\r\n\r\n`;
  const payload = Buffer.concat([
    Buffer.from(head),
    Buffer.isBuffer(content) ? content : Buffer.from(content),
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  return { payload, contentType: `multipart/form-data; boundary=${boundary}` };
}

async function upload(agent: Agent, filename: string, content: Buffer | string) {
  const { payload, contentType } = multipart(filename, content);
  return ctx.app.inject({
    method: 'POST',
    url: `/requests/${n}/attachments`,
    headers: {
      cookie: agent.cookie,
      'x-csrf-token': agent.csrf,
      'hx-request': 'true',
      'content-type': contentType,
    },
    payload,
  });
}

describe('attachments', () => {
  it('stores a valid file under a random key and lets authorised users download it', async () => {
    const res = await upload(owner, '../../Quote (Q3).pdf', '%PDF-1.4\n%%EOF\n');
    expect(res.statusCode, decodeURIComponent(String(res.headers['x-error-message']))).toBe(200);
    const row = (
      await ctx.db.query(
        `SELECT id, original_name, storage_key, mime_type FROM request_attachments ORDER BY created_at DESC LIMIT 1`,
      )
    ).rows[0];
    expect(row.original_name).toBe('Quote (Q3).pdf');
    expect(row.storage_key).toMatch(/^[0-9a-f-]{36}$/);
    expect(row.mime_type).toBe('application/pdf');

    const download = await owner.request('GET', `/attachments/${row.id}/download`);
    expect(download.statusCode).toBe(200);
    expect(download.headers['x-content-type-options']).toBe('nosniff');
    expect(String(download.headers['content-disposition'])).toContain('Quote (Q3).pdf');
    expect(download.body).toContain('%PDF-1.4');

    // Someone who cannot see the request cannot fetch its files either.
    expect((await stranger.request('GET', `/attachments/${row.id}/download`)).statusCode).toBe(404);
  });

  it('rejects files whose content does not match an allowed type', async () => {
    const res = await upload(owner, 'invoice.pdf', 'MZ\x90\x00 this is an executable');
    expect(res.statusCode).toBe(400);
    expect(decodeURIComponent(String(res.headers['x-error-message']))).toContain('not allowed');
    expect((await upload(owner, 'payload.exe', 'MZ')).statusCode).toBe(400);
  });

  it('rejects files over the size limit', async () => {
    const res = await upload(owner, 'big.txt', 'x'.repeat(5000));
    expect(res.statusCode).toBe(400);
    expect(decodeURIComponent(String(res.headers['x-error-message']))).toContain('MB or smaller');
  });

  it('does not let other users attach files to requests they cannot see', async () => {
    expect((await upload(stranger, 'note.txt', 'hello')).statusCode).toBe(404);
    expect(await scalar(ctx.db, `SELECT count(*)::int FROM request_attachments`)).toBe(1);
  });
});
