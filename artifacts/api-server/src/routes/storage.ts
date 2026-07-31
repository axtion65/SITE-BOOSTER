import crypto from 'crypto';
import { Readable } from 'stream';
import {
  RequestUploadUrlBody,
  RequestUploadUrlResponse,
} from '@workspace/api-zod';
import { Router, type IRouter, type Request, type Response } from 'express';
import { db, usersTable } from '@workspace/db';
import { eq } from 'drizzle-orm';

import { ObjectPermission } from '../lib/objectAcl';
import {
  ObjectNotFoundError,
  ObjectStorageService,
} from '../lib/objectStorage';

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();

// ---------------------------------------------------------------------------
// Upload intent token store — single-use, server-issued, short-lived
// ---------------------------------------------------------------------------
interface UploadIntent {
  userId: string;
  objectPath: string;
  expiresAt: number; // unix ms
}

// In-memory map: token (UUID) -> intent
const uploadIntents = new Map<string, UploadIntent>();
const INTENT_TTL_MS = 15 * 60 * 1000; // 15 minutes

function issueUploadIntent(userId: string, objectPath: string): string {
  const token = crypto.randomUUID();
  const expiresAt = Date.now() + INTENT_TTL_MS;
  uploadIntents.set(token, { userId, objectPath, expiresAt });
  return token;
}

/** Consume a token. Returns the intent if valid & matching, or null. */
function consumeUploadIntent(
  token: string,
  userId: string,
  objectPath: string,
): UploadIntent | null {
  const intent = uploadIntents.get(token);
  if (!intent) return null;
  // Always remove — token is single-use regardless of outcome
  uploadIntents.delete(token);
  if (Date.now() > intent.expiresAt) return null;
  if (intent.userId !== userId) return null;
  if (intent.objectPath !== objectPath) return null;
  return intent;
}

// ---------------------------------------------------------------------------
// Auth helpers
// ---------------------------------------------------------------------------

/** Extract userId from the project's custom Bearer JWT auth header. */
function getUserIdFromAuthHeader(authHeader: string | undefined): string | null {
  if (!authHeader?.startsWith('Bearer ')) return null;
  try {
    const decoded = Buffer.from(authHeader.slice(7), 'base64url').toString('utf-8');
    return decoded.split(':')[0] || null;
  } catch {
    return null;
  }
}

/** Resolve a Bearer token to a verified DB user id, or return null. */
async function resolveVerifiedUserId(authHeader: string | undefined): Promise<string | null> {
  const userId = getUserIdFromAuthHeader(authHeader);
  if (!userId) return null;
  const [user] = await db.select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.id, userId as string));
  return user?.id ?? null;
}

// ---------------------------------------------------------------------------
// Upload constraints
// ---------------------------------------------------------------------------

const ALLOWED_UPLOAD_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);
const MAX_UPLOAD_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

/**
 * POST /storage/uploads/request-url
 *
 * Step 1 of the two-step presigned upload flow.
 * Returns a short-lived presigned GCS PUT URL, a normalized objectPath,
 * and a single-use `finalizeToken` bound to this caller + objectPath.
 * The client PUTs the file directly to GCS, then calls
 * POST /storage/uploads/finalize with the finalizeToken to claim ownership.
 */
router.post(
  '/storage/uploads/request-url',
  async (req: Request, res: Response) => {
    const userId = await resolveVerifiedUserId(req.headers.authorization);
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const parsed = RequestUploadUrlBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Missing or invalid required fields' });
      return;
    }

    const { name, size, contentType } = parsed.data;

    // Server-side constraints — reject oversized files and disallowed MIME types.
    if (size > MAX_UPLOAD_SIZE_BYTES) {
      res.status(400).json({
        error: `File too large. Maximum upload size is ${MAX_UPLOAD_SIZE_BYTES / 1024 / 1024} MB.`,
      });
      return;
    }
    if (!ALLOWED_UPLOAD_MIME_TYPES.has(contentType)) {
      res.status(400).json({
        error: `Unsupported file type "${contentType}". Allowed: ${[...ALLOWED_UPLOAD_MIME_TYPES].join(', ')}.`,
      });
      return;
    }

    try {
      const uploadURL = await objectStorageService.getObjectEntityUploadURL();
      const objectPath = objectStorageService.normalizeObjectEntityPath(uploadURL);

      // Issue a single-use intent token: binds this caller + objectPath + expiry
      const finalizeToken = issueUploadIntent(userId, objectPath);

      res.json(
        RequestUploadUrlResponse.parse({
          uploadURL,
          objectPath,
          finalizeToken,
          metadata: { name, size, contentType },
        }),
      );
    } catch (error) {
      req.log.error({ err: error }, 'Error generating upload URL');
      res.status(500).json({ error: 'Failed to generate upload URL' });
    }
  },
);

/**
 * POST /storage/uploads/finalize
 *
 * Step 2 of the two-step presigned upload flow.
 * Caller must supply the `finalizeToken` returned by request-url.
 * The token is single-use, expires in 15 minutes, and is bound to
 * the original caller's userId + objectPath — preventing ownership hijack.
 * Body: { objectPath: string; finalizeToken: string }
 */
router.post(
  '/storage/uploads/finalize',
  async (req: Request, res: Response) => {
    const userId = await resolveVerifiedUserId(req.headers.authorization);
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { objectPath, finalizeToken } = req.body as {
      objectPath?: unknown;
      finalizeToken?: unknown;
    };

    if (typeof objectPath !== 'string' || !objectPath.startsWith('/objects/')) {
      res.status(400).json({ error: 'Invalid objectPath' });
      return;
    }
    if (typeof finalizeToken !== 'string' || !finalizeToken) {
      res.status(400).json({ error: 'finalizeToken is required' });
      return;
    }

    // Verify the token: single-use, bound to this user + this objectPath
    const intent = consumeUploadIntent(finalizeToken, userId, objectPath);
    if (!intent) {
      res.status(403).json({ error: 'Invalid or expired finalizeToken' });
      return;
    }

    try {
      await objectStorageService.trySetObjectEntityAclPolicy(objectPath, {
        owner: userId,
        visibility: 'private',
      });
      res.json({ ok: true, objectPath });
    } catch (error) {
      req.log.error({ err: error }, 'Error setting ACL on uploaded object');
      res.status(500).json({ error: 'Failed to finalize upload permissions' });
    }
  },
);

/**
 * GET /storage/public-objects/*
 *
 * Serve public assets from PUBLIC_OBJECT_SEARCH_PATHS.
 * Unconditionally public — no authentication or ACL checks.
 */
router.get(
  '/storage/public-objects/*filePath',
  async (req: Request, res: Response) => {
    try {
      const raw = req.params.filePath;
      const filePath = Array.isArray(raw) ? raw.join('/') : raw;
      const file = await objectStorageService.searchPublicObject(filePath);
      if (!file) {
        res.status(404).json({ error: 'File not found' });
        return;
      }

      const response = await objectStorageService.downloadObject(file);

      res.status(response.status);
      response.headers.forEach((value, key) => res.setHeader(key, value));

      if (response.body) {
        const nodeStream = Readable.fromWeb(
          response.body as ReadableStream<Uint8Array>,
        );
        nodeStream.pipe(res);
      } else {
        res.end();
      }
    } catch (error) {
      req.log.error({ err: error }, 'Error serving public object');
      res.status(500).json({ error: 'Failed to serve public object' });
    }
  },
);

/**
 * GET /storage/objects/*
 *
 * Serve private object entities from PRIVATE_OBJECT_DIR.
 * Requires authentication. Access is enforced via ACL metadata (owner check).
 */
router.get('/storage/objects/*path', async (req: Request, res: Response) => {
  const userId = await resolveVerifiedUserId(req.headers.authorization);
  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  try {
    const raw = req.params.path;
    const wildcardPath = Array.isArray(raw) ? raw.join('/') : raw;
    const objectPath = `/objects/${wildcardPath}`;
    const objectFile = await objectStorageService.getObjectEntityFile(objectPath);

    // Enforce ownership: only the object owner (or an explicit ACL rule) may read.
    const allowed = await objectStorageService.canAccessObjectEntity({
      userId,
      objectFile,
      requestedPermission: ObjectPermission.READ,
    });
    if (!allowed) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    const response = await objectStorageService.downloadObject(objectFile);

    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));

    if (response.body) {
      const nodeStream = Readable.fromWeb(
        response.body as ReadableStream<Uint8Array>,
      );
      nodeStream.pipe(res);
    } else {
      res.end();
    }
  } catch (error) {
    if (error instanceof ObjectNotFoundError) {
      req.log.warn({ err: error }, 'Object not found');
      res.status(404).json({ error: 'Object not found' });
      return;
    }
    req.log.error({ err: error }, 'Error serving object');
    res.status(500).json({ error: 'Failed to serve object' });
  }
});

export default router;
