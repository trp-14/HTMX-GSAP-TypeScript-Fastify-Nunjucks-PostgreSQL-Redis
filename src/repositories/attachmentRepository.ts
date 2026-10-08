import type { Queryable } from '../db/pool.js';

export type AttachmentRecord = {
  id: string;
  requestId: string;
  uploadedBy: string;
  uploaderName: string;
  originalName: string;
  storageKey: string;
  mimeType: string;
  sizeBytes: number;
  checksum: string;
  createdAt: Date;
};

const SELECT = `
  SELECT a.id, a.request_id AS "requestId", a.uploaded_by AS "uploadedBy", u.full_name AS "uploaderName",
         a.original_name AS "originalName", a.storage_key AS "storageKey", a.mime_type AS "mimeType",
         a.size_bytes AS "sizeBytes", a.checksum_sha256 AS checksum, a.created_at AS "createdAt"
  FROM request_attachments a JOIN users u ON u.id = a.uploaded_by`;

export const attachmentRepository = {
  async listForRequest(db: Queryable, requestId: string): Promise<AttachmentRecord[]> {
    const { rows } = await db.query<AttachmentRecord>(
      `${SELECT} WHERE a.request_id = $1 ORDER BY a.created_at`,
      [requestId],
    );
    return rows;
  },

  async findById(db: Queryable, id: string): Promise<AttachmentRecord | null> {
    const { rows } = await db.query<AttachmentRecord>(`${SELECT} WHERE a.id = $1`, [id]);
    return rows[0] ?? null;
  },

  async insert(
    db: Queryable,
    a: {
      requestId: string;
      uploadedBy: string;
      originalName: string;
      storageKey: string;
      mimeType: string;
      sizeBytes: number;
      checksum: string;
    },
  ): Promise<string> {
    const { rows } = await db.query<{ id: string }>(
      `INSERT INTO request_attachments (request_id, uploaded_by, original_name, storage_key, mime_type, size_bytes, checksum_sha256)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [a.requestId, a.uploadedBy, a.originalName, a.storageKey, a.mimeType, a.sizeBytes, a.checksum],
    );
    return rows[0]!.id;
  },

  async delete(db: Queryable, id: string): Promise<void> {
    await db.query(`DELETE FROM request_attachments WHERE id = $1`, [id]);
  },

  async storageKeysForRequest(db: Queryable, requestId: string): Promise<string[]> {
    const { rows } = await db.query<{ k: string }>(
      `SELECT storage_key AS k FROM request_attachments WHERE request_id = $1`,
      [requestId],
    );
    return rows.map((r) => r.k);
  },
};
