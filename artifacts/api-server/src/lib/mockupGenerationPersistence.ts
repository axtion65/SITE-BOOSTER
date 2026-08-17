export type GenerationQueryClient = {
  query: (text: string, values?: unknown[]) => Promise<{ rows: any[] }>;
};

export class MockupProjectUnavailableError extends Error {
  readonly category = "project_unavailable";

  constructor(readonly lookupStage: "project_lock" | "version_insert") {
    super("mockup_project_unavailable_during_generation");
  }
}

type PersistGenerationInput = {
  client: GenerationQueryClient;
  projectId: string;
  userId: string;
  idempotencyKey: string;
  revisionRequest?: string;
  creationPath: string;
  productReferencePaths: string[];
  brandModelId?: string | null;
  createVersionId: () => string;
};

export async function lockProjectAndPersistGeneration(input: PersistGenerationInput) {
  const { client, projectId, userId, idempotencyKey } = input;
  const locked = await client.query(
    "SELECT id FROM mockup_projects WHERE id=$1 AND user_id=$2 FOR UPDATE",
    [projectId, userId],
  );
  if (!locked.rows[0]) throw new MockupProjectUnavailableError("project_lock");

  let version = (await client.query(
    "SELECT * FROM mockup_versions WHERE mockup_project_id=$1 AND idempotency_key=$2",
    [projectId, idempotencyKey],
  )).rows[0];
  if (version) return { version, created: false };

  const active = (await client.query(
    "SELECT * FROM mockup_versions WHERE mockup_project_id=$1 AND status IN ('queued','provider_submitting','provider_processing','saving_asset') ORDER BY version_number DESC LIMIT 1",
    [projectId],
  )).rows[0];
  if (active) return { version: active, created: false };

  const versionNumber = Number((await client.query(
    "SELECT COALESCE(MAX(version_number),0)+1 n FROM mockup_versions WHERE mockup_project_id=$1",
    [projectId],
  )).rows[0].n);
  const versionId = input.createVersionId();
  version = (await client.query(
    "INSERT INTO mockup_versions(id,mockup_project_id,version_number,status,job_stage,queued_at,revision_request,idempotency_key,creation_path,product_reference_paths,brand_model_id) SELECT $1,mp.id,$3,'queued','queued',NOW(),$4,$5,$6,$7::jsonb,$8 FROM mockup_projects mp WHERE mp.id=$2 AND mp.user_id=$9 RETURNING *",
    [versionId, projectId, versionNumber, input.revisionRequest || null, idempotencyKey, input.creationPath, JSON.stringify(input.productReferencePaths), input.brandModelId || null, userId],
  )).rows[0];
  if (!version) throw new MockupProjectUnavailableError("version_insert");
  await client.query(
    "UPDATE mockup_projects SET status='queued',updated_at=NOW() WHERE id=$1 AND user_id=$2",
    [projectId, userId],
  );
  return { version, created: true };
}
