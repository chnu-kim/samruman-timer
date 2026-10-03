interface CloudflareEnv {
  DB: D1Database;
  CHZZK_CLIENT_ID: string;
  CHZZK_CLIENT_SECRET: string;
  BASE_URL: string;
  JWT_SECRET: string;
  /** wrangler.toml [version_metadata]. 운영 로그의 versionId·versionTag 출처 */
  CF_VERSION_METADATA: WorkerVersionMetadata;
}
