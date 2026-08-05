import { randomUUID } from "crypto";
import { Readable } from "stream";

import {
  CopyObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import {
  canAccessObject,
  getObjectAclPolicy,
  ObjectAclPolicy,
  ObjectPermission,
  setObjectAclPolicy,
} from "./objectAcl";

/**
 * Railway provides an S3-compatible bucket.
 *
 * The bucket connector may expose either Railway's original variable names:
 *   ENDPOINT, BUCKET, REGION, ACCESS_KEY_ID, SECRET_ACCESS_KEY
 *
 * or the AWS-style aliases shown in your SITE-BOOSTER service:
 *   AWS_ENDPOINT_URL, AWS_S3_BUCKET_NAME, AWS_DEFAULT_REGION,
 *   AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY
 */
function requireEnv(...names: string[]): string {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }

  throw new Error(
    `Missing storage variable. Expected one of: ${names.join(", ")}`,
  );
}

function getStorageConfig() {
  return {
    endpoint: requireEnv("AWS_ENDPOINT_URL", "ENDPOINT"),
    bucket: requireEnv("AWS_S3_BUCKET_NAME", "BUCKET"),
    region:
      process.env.AWS_DEFAULT_REGION?.trim() ||
      process.env.AWS_REGION?.trim() ||
      process.env.REGION?.trim() ||
      "auto",
    accessKeyId: requireEnv("AWS_ACCESS_KEY_ID", "ACCESS_KEY_ID"),
    secretAccessKey: requireEnv(
      "AWS_SECRET_ACCESS_KEY",
      "SECRET_ACCESS_KEY",
    ),
  };
}

const storageConfig = getStorageConfig();

export const objectStorageClient = new S3Client({
  endpoint: storageConfig.endpoint,
  region: storageConfig.region,
  credentials: {
    accessKeyId: storageConfig.accessKeyId,
    secretAccessKey: storageConfig.secretAccessKey,
  },

  // Railway Buckets are S3-compatible and work reliably with path-style URLs.
  forcePathStyle: true,
});

export class ObjectNotFoundError extends Error {
  constructor() {
    super("Object not found");
    this.name = "ObjectNotFoundError";
    Object.setPrototypeOf(this, ObjectNotFoundError.prototype);
  }
}

/**
 * Small Google-Storage-like compatibility wrapper.
 *
 * objectAcl.ts was written against Google Cloud Storage File objects. This
 * wrapper implements the methods and properties that code commonly uses:
 *
 * - file.name
 * - file.bucket.name
 * - file.exists()
 * - file.getMetadata()
 * - file.setMetadata()
 * - file.save()
 *
 * This lets the existing ACL helper continue working while the actual bytes
 * are stored in Railway's S3-compatible bucket.
 */
export class S3ObjectFile {
  readonly name: string;
  readonly bucket: { name: string };

  constructor(
    readonly bucketName: string,
    readonly objectName: string,
  ) {
    this.name = objectName;
    this.bucket = { name: bucketName };
  }

  async exists(): Promise<[boolean]> {
    try {
      await objectStorageClient.send(
        new HeadObjectCommand({
          Bucket: this.bucketName,
          Key: this.objectName,
        }),
      );

      return [true];
    } catch (error: any) {
      const status = error?.$metadata?.httpStatusCode;
      const name = error?.name;

      if (
        status === 404 ||
        name === "NotFound" ||
        name === "NoSuchKey"
      ) {
        return [false];
      }

      throw error;
    }
  }

  async getMetadata(): Promise<[Record<string, unknown>]> {
    try {
      const result = await objectStorageClient.send(
        new HeadObjectCommand({
          Bucket: this.bucketName,
          Key: this.objectName,
        }),
      );

      return [
        {
          ...result.Metadata,
          metadata: result.Metadata ?? {},
          contentType:
            result.ContentType ?? "application/octet-stream",
          size: result.ContentLength,
          cacheControl: result.CacheControl,
          etag: result.ETag,
          updated: result.LastModified?.toISOString(),
        },
      ];
    } catch (error: any) {
      const status = error?.$metadata?.httpStatusCode;

      if (
        status === 404 ||
        error?.name === "NotFound" ||
        error?.name === "NoSuchKey"
      ) {
        throw new ObjectNotFoundError();
      }

      throw error;
    }
  }

  /**
   * Preserve object bytes and replace S3 metadata.
   *
   * This supports the existing objectAcl.ts helper, which may store its ACL
   * policy in custom object metadata.
   */
  async setMetadata(
    metadataInput: Record<string, any>,
  ): Promise<[Record<string, unknown>]> {
    const [current] = await this.getMetadata();

    const nestedMetadata =
      metadataInput.metadata &&
      typeof metadataInput.metadata === "object"
        ? metadataInput.metadata
        : metadataInput;

    const metadata: Record<string, string> = {};

    for (const [key, value] of Object.entries(nestedMetadata)) {
      if (value === undefined || value === null) continue;
      if (typeof value === "object") {
        metadata[key] = JSON.stringify(value);
      } else {
        metadata[key] = String(value);
      }
    }

    await objectStorageClient.send(
      new CopyObjectCommand({
        Bucket: this.bucketName,
        Key: this.objectName,
        CopySource: encodeCopySource(
          this.bucketName,
          this.objectName,
        ),
        MetadataDirective: "REPLACE",
        Metadata: metadata,
        ContentType:
          (metadataInput.contentType as string | undefined) ??
          (current.contentType as string | undefined) ??
          "application/octet-stream",
        CacheControl:
          (metadataInput.cacheControl as string | undefined) ??
          (current.cacheControl as string | undefined),
      }),
    );

    return this.getMetadata();
  }

  async save(
    data: Buffer | Uint8Array | string,
    options?: {
      contentType?: string;
      resumable?: boolean;
      metadata?: Record<string, string>;
      cacheControl?: string;
    },
  ): Promise<void> {
    await objectStorageClient.send(
      new PutObjectCommand({
        Bucket: this.bucketName,
        Key: this.objectName,
        Body: data,
        ContentType:
          options?.contentType ?? "application/octet-stream",
        Metadata: options?.metadata,
        CacheControl: options?.cacheControl,
      }),
    );
  }
}

function encodeCopySource(
  bucketName: string,
  objectName: string,
): string {
  const encodedKey = objectName
    .split("/")
    .map(encodeURIComponent)
    .join("/");

  return `${encodeURIComponent(bucketName)}/${encodedKey}`;
}

function normalizeKey(value: string): string {
  return value
    .replace(/^\/+/, "")
    .replace(/^api\/storage\/objects\//, "")
    .replace(/^objects\//, "");
}

function internalObjectPath(objectName: string): string {
  return `/api/storage/objects/${objectName}`;
}

export class ObjectStorageService {
  constructor() {}

  /**
   * Kept for compatibility with existing code.
   *
   * Railway uses one configured bucket, so this returns that bucket rather
   * than requiring PUBLIC_OBJECT_SEARCH_PATHS.
   */
  getPublicObjectSearchPaths(): Array<string> {
    return [`/${storageConfig.bucket}`];
  }

  /**
   * Kept for compatibility with existing callers.
   *
   * This is no longer an environment variable. It represents the root of the
   * Railway S3 bucket.
   */
  getPrivateObjectDir(): string {
    return `/${storageConfig.bucket}`;
  }

  async searchPublicObject(
    filePath: string,
  ): Promise<S3ObjectFile | null> {
    const objectName = normalizeKey(filePath);
    const file = new S3ObjectFile(
      storageConfig.bucket,
      objectName,
    );

    const [exists] = await file.exists();
    return exists ? file : null;
  }

  async downloadObject(
    file: S3ObjectFile,
    cacheTtlSec: number = 3600,
  ): Promise<Response> {
    const result = await objectStorageClient.send(
      new GetObjectCommand({
        Bucket: file.bucketName,
        Key: file.objectName,
      }),
    );

    if (!result.Body) {
      throw new ObjectNotFoundError();
    }

    let isPublic = false;

    try {
      const aclPolicy = await getObjectAclPolicy(file as any);
      isPublic = aclPolicy?.visibility === "public";
    } catch (error) {
      console.warn(
        "[objectStorage] Could not read ACL metadata; treating object as private",
        error,
      );
    }

    const webStream = result.Body.transformToWebStream();

    const headers: Record<string, string> = {
      "Content-Type":
        result.ContentType ?? "application/octet-stream",
      "Cache-Control": `${
        isPublic ? "public" : "private"
      }, max-age=${cacheTtlSec}`,
    };

    if (result.ContentLength !== undefined) {
      headers["Content-Length"] = String(
        result.ContentLength,
      );
    }

    if (result.ETag) {
      headers.ETag = result.ETag;
    }

    return new Response(webStream, { headers });
  }

  /**
   * Creates a signed PUT URL for direct browser uploads.
   *
   * The uploaded object is stored at:
   * uploads/<uuid>
   */
  async getObjectEntityUploadURL(): Promise<string> {
    const objectId = randomUUID();
    const objectName = `uploads/${objectId}`;

    return getSignedUrl(
      objectStorageClient,
      new PutObjectCommand({
        Bucket: storageConfig.bucket,
        Key: objectName,
        ContentType: "application/octet-stream",
      }),
      { expiresIn: 900 },
    );
  }

  async getObjectEntityFile(
    objectPath: string,
  ): Promise<S3ObjectFile> {
    const objectName = normalizeKey(objectPath);

    if (!objectName) {
      throw new ObjectNotFoundError();
    }

    const objectFile = new S3ObjectFile(
      storageConfig.bucket,
      objectName,
    );

    const [exists] = await objectFile.exists();

    if (!exists) {
      throw new ObjectNotFoundError();
    }

    return objectFile;
  }

  normalizeObjectEntityPath(rawPath: string): string {
    if (
      rawPath.startsWith("/objects/") ||
      rawPath.startsWith("/api/storage/objects/")
    ) {
      return `/objects/${normalizeKey(rawPath)}`;
    }

    try {
      const url = new URL(rawPath);
      const endpoint = new URL(storageConfig.endpoint);

      // Path-style Railway S3 URL:
      // /<bucket>/<object-key>
      if (url.host === endpoint.host) {
        const pathname = decodeURIComponent(url.pathname);
        const bucketPrefix = `/${storageConfig.bucket}/`;

        if (pathname.startsWith(bucketPrefix)) {
          return `/objects/${pathname.slice(
            bucketPrefix.length,
          )}`;
        }
      }
    } catch {
      // rawPath was not an absolute URL.
    }

    return rawPath;
  }

async trySetObjectEntityAclPolicy(
  rawPath: string,
  _aclPolicy: ObjectAclPolicy,
): Promise<string> {
  const normalizedPath = this.normalizeObjectEntityPath(rawPath);

  // Railway S3 objects remain private.
  // Signed URLs control access, so Replit/GCS ACL finalization is not needed.
  if (normalizedPath.startsWith("/objects/")) {
    return normalizedPath;
  }

  if (normalizedPath.startsWith("/api/storage/objects/")) {
    return `/objects/${normalizeKey(normalizedPath)}`;
  }

  return normalizedPath;
}




  async canAccessObjectEntity({
    userId,
    objectFile,
    requestedPermission,
  }: {
    userId?: string;
    objectFile: S3ObjectFile;
    requestedPermission?: ObjectPermission;
  }): Promise<boolean> {
    return canAccessObject({
      userId,
      objectFile: objectFile as any,
      requestedPermission:
        requestedPermission ?? ObjectPermission.READ,
    });
  }

  /**
   * Downloads a generated video from fal.media and stores it permanently in
   * the Railway bucket.
   *
   * Returns:
   * /api/storage/objects/videos/<uuid>.mp4
   */
  async uploadVideoFromUrl(
    videoUrl: string,
  ): Promise<string> {
    const objectId = randomUUID();
    const objectName = `videos/${objectId}.mp4`;

    const response = await fetch(videoUrl, {
      signal: AbortSignal.timeout(180_000),
    });

    if (!response.ok) {
      throw new Error(
        `Video download failed: HTTP ${response.status} from ${videoUrl}`,
      );
    }

    const buffer = Buffer.from(
      await response.arrayBuffer(),
    );

    await objectStorageClient.send(
      new PutObjectCommand({
        Bucket: storageConfig.bucket,
        Key: objectName,
        Body: buffer,
        ContentType: "video/mp4",
        CacheControl: "private, max-age=31536000",
      }),
    );

    console.log(
      `[objectStorage] Archived video → s3://${storageConfig.bucket}/${objectName} (${buffer.length} bytes)`,
    );

    return internalObjectPath(objectName);
  }

  /**
   * Stores a video buffer in the Railway bucket.
   */
  async uploadVideoBuffer(
    buffer: Buffer,
  ): Promise<string> {
    const objectId = randomUUID();
    const objectName = `videos/${objectId}.mp4`;

    await objectStorageClient.send(
      new PutObjectCommand({
        Bucket: storageConfig.bucket,
        Key: objectName,
        Body: buffer,
        ContentType: "video/mp4",
        CacheControl: "private, max-age=31536000",
      }),
    );

    console.log(
      `[objectStorage] Uploaded video buffer → s3://${storageConfig.bucket}/${objectName} (${buffer.length} bytes)`,
    );

    return internalObjectPath(objectName);
  }

  /**
   * Returns a short-lived signed GET URL for an existing private object.
   */
  async getSignedObjectEntityUrl(
    objectPath: string,
    ttlSec: number = 900,
  ): Promise<string> {
    const objectFile =
      await this.getObjectEntityFile(objectPath);

    return getSignedUrl(
      objectStorageClient,
      new GetObjectCommand({
        Bucket: objectFile.bucketName,
        Key: objectFile.objectName,
      }),
      { expiresIn: ttlSec },
    );
  }
}
