import { Readable } from 'stream';
import {
  RequestUploadUrlBody,
  RequestUploadUrlResponse,
} from '@workspace/api-zod';
import { Router, type IRouter, type Request, type Response } from 'express';
import { pool } from '@workspace/db';

import { ObjectPermission, setObjectAclPolicy } from '../lib/objectAcl';
import {
  ObjectNotFoundError,
  ObjectStorageService,
} from '../lib/objectStorage';
import {
  consumeUploadIntent,
  issueUploadIntent,
  validateUpload,
} from '../lib/uploadSecurity';

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();

export const persistedMarketingObjectOwnersQuery = `
  WITH requested_paths AS (
    SELECT path
    FROM UNNEST(ARRAY[
      $2::TEXT,
      '/api/storage' || $2::TEXT,
      REGEXP_REPLACE($2::TEXT, '^/objects/', '')
    ]) AS path
  )
  SELECT COALESCE(BOOL_AND(owner_id = $1), FALSE) AS owned
  FROM (
    SELECT mp.user_id AS owner_id
    FROM mockup_versions mv
    JOIN mockup_projects mp ON mp.id = mv.mockup_project_id
    WHERE mv.object_path IN (SELECT path FROM requested_paths)

    UNION ALL

    SELECT b.user_id AS owner_id
    FROM product_images pi
    JOIN products p ON p.id = pi.product_id
    JOIN businesses b ON b.id = p.business_id
    WHERE pi.object_path IN (SELECT path FROM requested_paths)

    UNION ALL

    SELECT b.user_id AS owner_id
    FROM brand_kits bk
    JOIN businesses b ON b.id = bk.business_id
    WHERE bk.logo_object_path IN (SELECT path FROM requested_paths)
       OR bk.secondary_logo_object_path IN (SELECT path FROM requested_paths)

    UNION ALL

    SELECT b.user_id AS owner_id
    FROM brand_models bm
    JOIN businesses b ON b.id = bm.business_id
    WHERE bm.reference_object_paths ?| ARRAY(SELECT path FROM requested_paths)

    UNION ALL

    SELECT p.user_id AS owner_id
    FROM projects p
    WHERE p.product_image_url IN (SELECT path FROM requested_paths)
  ) persisted_owners
`;

async function isExclusivelyOwnedPersistedMarketingObject(
  userId: string,
  objectPath: string,
): Promise<boolean> {
  const result = await pool.query<{ owned: boolean }>(
    persistedMarketingObjectOwnersQuery,
    [userId, objectPath],
  );
  return result.rows[0]?.owned === true;
}

// ---------------------------------------------------------------------------
// Upload intent token store — single-use, server-issued, short-lived
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Auth helpers
// ---------------------------------------------------------------------------

import { resolveUserIdFromToken } from "./auth";

/** Resolve a Bearer token to a verified DB user id, or return null. */
const resolveVerifiedUserId = resolveUserIdFromToken;

// ---------------------------------------------------------------------------
// Upload constraints
// ---------------------------------------------------------------------------

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
    const validationError = validateUpload(size, contentType);
    if (validationError) {
      res.status(400).json({ error: validationError });
      return;
    }

    try {
      const uploadURL = await objectStorageService.getObjectEntityUploadURL(contentType);
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
 * GET /storage/object-signed-url/*path
 *
 * Return a short-lived (15 min) GCS signed GET URL for a private object.
 * Requires authentication + ownership check — does NOT stream the file.
 * The client uses the returned URL as an <img src> without needing auth headers.
 */
router.get('/storage/object-signed-url/*path', async (req: Request, res: Response) => {
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

    let allowed = await objectStorageService.canAccessObjectEntity({
      userId,
      objectFile,
      requestedPermission: ObjectPermission.READ,
    });
    if (
      !allowed
      && await isExclusivelyOwnedPersistedMarketingObject(userId, objectPath)
    ) {
      await setObjectAclPolicy(objectFile, {
        owner: userId,
        visibility: 'private',
      });
      allowed = true;
      req.log.info(
        { userId, objectPath },
        'Repaired legacy marketing object ACL from exclusive persisted ownership',
      );
    }
    if (!allowed) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    const ttl = 900;
    const url = await objectStorageService.getSignedObjectEntityUrl(objectPath, ttl);
    res.json({ url, expiresIn: ttl });
  } catch (error) {
    if (error instanceof ObjectNotFoundError) {
      res.status(404).json({ error: 'Object not found' });
      return;
    }
    req.log.error({ err: error }, 'Error generating signed object URL');
    res.status(500).json({ error: 'Failed to generate signed URL' });
  }
});

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
