export type IdentityDb = {
  query(sql: string, values?: unknown[]): Promise<{ rows: any[] }>;
};

export async function ownedBusiness(db: IdentityDb, userId: string, businessId?: string | null) {
  if (businessId) {
    return (await db.query("SELECT * FROM businesses WHERE id=$1 AND user_id=$2", [businessId, userId])).rows[0] ?? null;
  }
  const rows = (await db.query("SELECT * FROM businesses WHERE user_id=$1 ORDER BY created_at", [userId])).rows;
  return rows.length === 1 ? rows[0] : null;
}

export async function ownedCampaign(db: IdentityDb, userId: string, campaignId: string, businessId?: string) {
  const values: unknown[] = [campaignId, userId];
  const businessGuard = businessId ? " AND c.business_id=$3" : "";
  if (businessId) values.push(businessId);
  return (await db.query(`SELECT c.* FROM campaigns c JOIN businesses b ON b.id=c.business_id AND b.user_id=c.user_id WHERE c.id=$1 AND c.user_id=$2${businessGuard}`, values)).rows[0] ?? null;
}

export async function ownedCampaignRun(db: IdentityDb, userId: string, campaignId: string, runId: string) {
  return (await db.query(`SELECT r.* FROM campaign_runs r JOIN campaigns c ON c.id=r.campaign_id JOIN businesses b ON b.id=c.business_id AND b.user_id=c.user_id WHERE r.id=$1 AND r.campaign_id=$2 AND c.user_id=$3`, [runId, campaignId, userId])).rows[0] ?? null;
}
