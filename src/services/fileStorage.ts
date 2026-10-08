import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, rename, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { Transform, type Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { detectKind, type ATTACHMENT_KINDS } from '../utils/files.js';
import { AppError, validationError } from '../utils/errors.js';

export type StoredFile = {
  storageKey: string;
  sizeBytes: number;
  checksum: string;
  mime: string;
  inline: boolean;
};

/**
 * Private file storage. Files live outside the public directory under random, unguessable keys
 * and are only ever served through authorised routes. The original filename is metadata only —
 * it never touches the filesystem.
 */
export class FileStorage {
  constructor(
    private readonly root: string,
    private readonly maxBytes: number,
  ) {}

  private pathFor(area: string, key: string): string {
    if (!/^[a-z]+$/.test(area) || !/^[0-9a-f-]{36}$/.test(key)) throw new Error('invalid storage key');
    return path.join(this.root, area, key);
  }

  async save(
    area: 'attachments' | 'products',
    filename: string,
    stream: Readable & { truncated?: boolean },
    kinds?: typeof ATTACHMENT_KINDS,
    maxBytes = this.maxBytes,
  ): Promise<StoredFile> {
    await mkdir(path.join(this.root, area), { recursive: true });
    const storageKey = randomUUID();
    const finalPath = this.pathFor(area, storageKey);
    const tmpPath = `${finalPath}.part`;
    const hash = createHash('sha256');
    let size = 0;
    let head = Buffer.alloc(0);
    let tooLarge = false;

    const inspect = new Transform({
      transform(chunk: Buffer, _enc, cb) {
        size += chunk.length;
        if (size > maxBytes) {
          tooLarge = true;
          cb(new AppError(413, 'TOO_LARGE', 'File is too large.'));
          return;
        }
        if (head.length < 64) head = Buffer.concat([head, chunk.subarray(0, 64 - head.length)]);
        hash.update(chunk);
        cb(null, chunk);
      },
    });

    try {
      await pipeline(stream, inspect, createWriteStream(tmpPath, { flags: 'wx', mode: 0o600 }));
      if (stream.truncated || tooLarge)
        throw validationError({ file: `Files must be ${Math.round(maxBytes / 1024 / 1024)} MB or smaller.` });
      if (size === 0) throw validationError({ file: 'The file is empty.' });
      const kind = detectKind(filename, head, kinds);
      if (!kind)
        throw validationError({
          file: 'This file type is not allowed, or its contents do not match its extension.',
        });
      await rename(tmpPath, finalPath);
      return {
        storageKey,
        sizeBytes: size,
        checksum: hash.digest('hex'),
        mime: kind.mime,
        inline: kind.inline,
      };
    } catch (err) {
      await rm(tmpPath, { force: true });
      if (err instanceof AppError && err.code === 'TOO_LARGE') {
        throw validationError({ file: `Files must be ${Math.round(maxBytes / 1024 / 1024)} MB or smaller.` });
      }
      throw err;
    }
  }

  async open(area: 'attachments' | 'products', key: string): Promise<{ stream: Readable; size: number }> {
    const p = this.pathFor(area, key);
    const s = await stat(p);
    return { stream: createReadStream(p), size: s.size };
  }

  async remove(area: 'attachments' | 'products', key: string): Promise<void> {
    await rm(this.pathFor(area, key), { force: true });
  }
}
