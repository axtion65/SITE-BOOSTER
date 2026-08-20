export const CUSTOMER_MOCKUP_LIBRARY_QUERY = `
  SELECT mp.*, p.name AS product_name, bm.display_name AS brand_model_name,
    COALESCE(json_agg(mv ORDER BY mv.version_number DESC)
      FILTER (WHERE mv.id IS NOT NULL), '[]') AS versions
  FROM mockup_projects mp
  JOIN products p ON p.id = mp.product_id
  LEFT JOIN brand_models bm ON bm.id = mp.brand_model_id
  LEFT JOIN mockup_versions mv ON mv.mockup_project_id = mp.id
  WHERE mp.user_id = $1
  GROUP BY mp.id, p.id, bm.id
  ORDER BY mp.updated_at DESC
`;

export const CUSTOMER_MOCKUP_PROJECT_QUERY = `
  SELECT mp.*, p.name AS product_name, c.name AS campaign_name,
    bm.display_name AS brand_model_name
  FROM mockup_projects mp
  JOIN products p ON p.id = mp.product_id
  LEFT JOIN campaigns c ON c.id = mp.campaign_id
  LEFT JOIN brand_models bm ON bm.id = mp.brand_model_id
  WHERE mp.id = $1 AND mp.user_id = $2
`;

export const MOCKUP_VERSIONS_QUERY =
  "SELECT * FROM mockup_versions WHERE mockup_project_id=$1 ORDER BY version_number DESC";
