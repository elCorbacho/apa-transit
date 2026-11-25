import "server-only";
import { Pool } from "pg";
import { readServerConfig } from "./config";

export interface Queryable {
  query<T = Record<string, unknown>>(text: string, values?: readonly unknown[]): Promise<{ rows: T[] }>;
}
export interface Database extends Queryable {
  transaction<T>(work: (connection: Queryable) => Promise<T>): Promise<T>;
}
let pool: Pool | undefined;

export function database(): Database {
  const config = readServerConfig();
  if (!pool) {
    const uri = new URL(config.databaseUrl);
    // pg's connection-string SSL options must not override verified TLS.
    for (const key of ["ssl", "sslmode", "sslcert", "sslkey", "sslrootcert"]) uri.searchParams.delete(key);
    pool = new Pool({
      connectionString: uri.toString(), max: 3, idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 5_000, query_timeout: 10_000,
      ssl: { rejectUnauthorized: true, ...(config.databaseCA ? { ca: config.databaseCA } : {}) }
    });
  }
  const activePool = pool;
  const transaction: Database["transaction"] = async work => {
    const client = await activePool.connect();
    try {
      await client.query("begin");
      await client.query("set local role apa_app; set local statement_timeout='8s'; set local lock_timeout='3s'; set local idle_in_transaction_session_timeout='15s'; set local timezone='UTC'");
      const result = await work({
        query: async <T>(text: string, values: readonly unknown[] = []) => ({
          rows: (await client.query(text, [...values])).rows as T[]
        })
      });
      await client.query("commit");
      return result;
    } catch (error) {
      try { await client.query("rollback"); } catch { /* Preserve the original error. */ }
      throw error;
    } finally { client.release(); }
  };
  return { transaction, query: (text, values) => transaction(connection => connection.query(text, values)) };
}
