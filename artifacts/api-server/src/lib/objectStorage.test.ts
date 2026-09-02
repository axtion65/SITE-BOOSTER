import assert from "node:assert/strict";
import test from "node:test";

process.env.AWS_ENDPOINT_URL ||= "http://storage.test";
process.env.AWS_S3_BUCKET_NAME ||= "private-test-bucket";
process.env.AWS_ACCESS_KEY_ID ||= "test";
process.env.AWS_SECRET_ACCESS_KEY ||= "test";

const {
  createObjectEntityUploadCommand,
  imageDimensions,
  validateVideoPayload,
  videoObjectName,
  validateImagePayload,
  mockupImageObjectName,
  websiteImportImageObjectName,
  ObjectStorageService,
} = await import("./objectStorage");
const { getObjectAclPolicy, ObjectPermission, setObjectAclPolicy } = await import("./objectAcl");

class LowercasingMetadataFile {
  readonly name = "uploads/fixed-id";
  private metadata: Record<string, string> = {};

  async exists(): Promise<[boolean]> {
    return [true];
  }

  async getMetadata(): Promise<[Record<string, unknown>]> {
    return [{ metadata: { ...this.metadata }, contentType: "image/png" }];
  }

  async setMetadata(input: Record<string, any>): Promise<void> {
    for (const key of Object.keys(input.metadata ?? input)) {
      assert.match(key, /^[a-zA-Z0-9-]+$/, "S3 metadata keys must be HTTP-header safe");
    }
    this.metadata = Object.fromEntries(
      Object.entries(input.metadata ?? input).map(([key, value]) => [
        key.toLowerCase(),
        String(value),
      ]),
    );
  }
}

for (const contentType of ["image/png", "image/jpeg", "image/webp"]) {
  test(`signed upload command preserves ${contentType}`, () => {
    const command = createObjectEntityUploadCommand(contentType, "fixed-id");
    assert.equal(command.input.ContentType, contentType);
    assert.equal(command.input.Key, "uploads/fixed-id");
  });
}

test("finalized Railway upload persists a private, owner-scoped ACL", async () => {
  const file = new LowercasingMetadataFile();
  const storage = new ObjectStorageService();
  storage.getObjectEntityFile = async () => file as any;

  const path = await storage.trySetObjectEntityAclPolicy(
    "/objects/uploads/fixed-id",
    { owner: "owner-1", visibility: "private" },
  );

  assert.equal(path, "/objects/uploads/fixed-id");
  assert.deepEqual(await getObjectAclPolicy(file), {
    owner: "owner-1",
    visibility: "private",
  });
  assert.equal(
    await storage.canAccessObjectEntity({
      userId: "owner-1",
      objectFile: file as any,
      requestedPermission: ObjectPermission.READ,
    }),
    true,
    "product image ownership validation succeeds for the owner",
  );
  assert.equal(
    await storage.canAccessObjectEntity({
      userId: "another-account",
      objectFile: file as any,
      requestedPermission: ObjectPermission.READ,
    }),
    false,
    "product image ownership validation rejects another account",
  );
  assert.equal(
    await storage.canAccessObjectEntity({
      objectFile: file as any,
      requestedPermission: ObjectPermission.READ,
    }),
    false,
    "the image remains private when served without its owner",
  );
});

test("ACL reads tolerate S3-lowercased metadata keys", async () => {
  const file = new LowercasingMetadataFile();
  await setObjectAclPolicy(file, { owner: "owner-1", visibility: "private" });
  assert.equal((await getObjectAclPolicy(file))?.owner, "owner-1");
});

function mp4(payload = "video-data"): Buffer {
  return Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from("ftypisom"), Buffer.from(payload)]);
}

test("durable video keys are deterministic and scoped to user, project, and render", () => {
  const identity = { userId: "user-1", projectId: "project-1", renderId: "render-1" };
  assert.equal(videoObjectName(identity), "videos/user-1/project-1/render-1.mp4");
  assert.equal(videoObjectName(identity), videoObjectName(identity), "duplicate polling reuses the object key");
  assert.notEqual(videoObjectName(identity), videoObjectName({ ...identity, renderId: "render-2" }), "rerenders get a new durable object");
  assert.notEqual(videoObjectName(identity), videoObjectName({ ...identity, userId: "user-2" }), "users cannot collide");
});

test("accepts a non-empty MP4 provider response", () => {
  assert.doesNotThrow(() => validateVideoPayload(mp4(), "video/mp4"));
  assert.doesNotThrow(() => validateVideoPayload(mp4(), "application/octet-stream"));
});

test("rejects provider XML, HTML, and JSON error documents", () => {
  assert.throws(() => validateVideoPayload(Buffer.from("<Error>RequestCanceled</Error>"), "application/xml"), /error document/);
  assert.throws(() => validateVideoPayload(Buffer.from("<!doctype html><h1>failure</h1>"), "text/html"), /error document/);
  assert.throws(() => validateVideoPayload(Buffer.from('{"error":"failed"}'), "application/json"), /error document/);
});

test("rejects empty, oversized, and non-MP4 provider output", () => {
  assert.throws(() => validateVideoPayload(Buffer.alloc(0), "video/mp4"), /empty/);
  assert.throws(() => validateVideoPayload(mp4(), "video/mp4", 4), /storage limit/);
  assert.throws(() => validateVideoPayload(Buffer.from("not an mp4"), "video/mp4"), /valid MP4/);
});


test("durable mockup keys are scoped and deterministic",()=>{const i={userId:"u",businessId:"b",mockupId:"m",versionId:"v"};assert.equal(mockupImageObjectName(i),"mockups/u/b/m/v.png");assert.equal(mockupImageObjectName(i),mockupImageObjectName(i));});
test("website import keys are private, deterministic, and customer scoped",()=>{const i={userId:"owner-1",importId:"import-1",assetKey:"product-0-image-0"};assert.equal(websiteImportImageObjectName(i,"webp"),"website-imports/owner-1/import-1/product-0-image-0.webp");assert.equal(websiteImportImageObjectName(i),websiteImportImageObjectName(i));assert.notEqual(websiteImportImageObjectName(i),websiteImportImageObjectName({...i,userId:"owner-2"}));});
test("image validation accepts magic bytes and rejects provider documents",()=>{const png=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),Buffer.alloc(32)]);assert.doesNotThrow(()=>validateImagePayload(png,"image/png"));assert.throws(()=>validateImagePayload(Buffer.from("<html>failure</html>"),"text/html"),/unsupported|error document/);assert.throws(()=>validateImagePayload(Buffer.from('{"error":true}'),"image/png"),/error document/);});
test("reads dimensions from delivered image bytes when provider metadata is absent",()=>{const png=Buffer.alloc(24);Buffer.from([137,80,78,71,13,10,26,10]).copy(png);png.writeUInt32BE(1024,16);png.writeUInt32BE(1280,20);assert.deepEqual(imageDimensions(png),{width:1024,height:1280});});
