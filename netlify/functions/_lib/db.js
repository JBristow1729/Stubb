let databasePromise;

async function getDb() {
  if (!databasePromise) {
    databasePromise = import("@netlify/database").then(({ getDatabase }) => getDatabase());
  }
  return databasePromise;
}

async function transaction(work) {
  const db = await getDb();
  const client = await db.pool.connect();
  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

module.exports = { getDb, transaction };
