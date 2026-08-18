// store.js
// Persistence. Everything that was previously a Map() lives here now, behind
// an async interface so the same code path works against memory (dev) or
// Postgres (production) with no changes upstream.
//
// STORE_DRIVER=memory   -> in-process, wiped on restart. Dev only.
// STORE_DRIVER=postgres -> real persistence. Requires DATABASE_URL.
//
// Default is memory so a fresh clone runs with zero setup, but server.js
// logs a loud warning when running in memory mode so nobody ships it by
// accident.

const DRIVER = process.env.STORE_DRIVER || "memory";
if (process.env.NODE_ENV === "production" && DRIVER !== "postgres") {
    throw new Error("Refusing to start: STORE_DRIVER=postgres is required in production.");
}
if (DRIVER === "postgres" && !process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required when STORE_DRIVER=postgres.");
}

// ---------------------------------------------------------------- memory
function memoryStore() {
    const tables = {
        concords: new Map(),
        invoices: new Map(),
        commitments: new Map(),
        messages: new Map(),   // concordId -> array
        checkpoints: new Map() // chainName -> blockNumber
    };

    return {
        driver: "memory",
        async init() {},
        async get(table, key) {
            return tables[table].get(key) ?? null;
        },
        async put(table, key, value) {
            tables[table].set(key, value);
            return value;
        },
        async putIfAbsent(table, key, value) {
            if (tables[table].has(key)) return false;
            tables[table].set(key, value);
            return true;
        },
        async claimConcordFreeze(id, claim) {
            const concord = tables.concords.get(id);
            if (!concord || concord.frozenContract) return null;
            concord.frozenContract = claim;
            tables.concords.set(id, concord);
            return concord;
        },
        async claimConcordInvite(id, tokenHash, client, joinedAt) {
            const concord = tables.concords.get(id);
            if (!concord || concord.parties.client || concord.inviteTokenHash !== tokenHash) return null;
            concord.parties.client = client;
            concord.inviteUsedAt = joinedAt;
            concord.history.push({ event: "client_joined", by: client.id, at: joinedAt });
            tables.concords.set(id, concord);
            return concord;
        },
        async delete(table, key) {
            return tables[table].delete(key);
        },
        async all(table) {
            return [...tables[table].values()];
        },
        async keys(table) {
            return [...tables[table].keys()];
        },
        async appendMessage(concordId, msg) {
            const list = tables.messages.get(concordId) || [];
            const stored = { ...msg, id: msg.id || list.length + 1 };
            list.push(stored);
            tables.messages.set(concordId, list);
            return stored;
        },
        async getMessages(concordId) {
            return tables.messages.get(concordId) || [];
        },
        async getCheckpoint(chain) {
            return tables.checkpoints.get(chain) ?? null;
        },
        async setCheckpoint(chain, block) {
            tables.checkpoints.set(chain, block);
        },
        async ping() { return true; },
        async close() {}
    };
}

// -------------------------------------------------------------- postgres
function postgresStore() {
    const { Pool } = require("pg");
    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : false
    });

    // Documents are stored as JSONB so the app-level shape can evolve without
    // a migration per field. Keys and a few queryable columns are promoted
    // out for indexing; everything else stays in the blob.
    return {
        driver: "postgres",
        async init() {
            const fs = require("fs");
            const path = require("path");
            const sql = fs.readFileSync(path.join(__dirname, "migrations.sql"), "utf8");
            await pool.query(sql);
        },
        async get(table, key) {
            const { rows } = await pool.query(`SELECT data FROM ${safe(table)} WHERE id = $1`, [key]);
            return rows[0]?.data ?? null;
        },
        async put(table, key, value) {
            await pool.query(
                `INSERT INTO ${safe(table)} (id, data, updated_at) VALUES ($1, $2, now())
                 ON CONFLICT (id) DO UPDATE SET data = $2, updated_at = now()`,
                [key, value]
            );
            return value;
        },
        async putIfAbsent(table, key, value) {
            const result = await pool.query(
                `INSERT INTO ${safe(table)} (id, data, updated_at) VALUES ($1, $2, now())
                 ON CONFLICT (id) DO NOTHING`,
                [key, value]
            );
            return result.rowCount === 1;
        },
        async claimConcordFreeze(id, claim) {
            const { rows } = await pool.query(
                `UPDATE concords
                    SET data = jsonb_set(data, '{frozenContract}', $2::jsonb, true), updated_at = now()
                  WHERE id = $1
                    AND (data->'frozenContract' IS NULL OR data->'frozenContract' = 'null'::jsonb)
              RETURNING data`,
                [id, JSON.stringify(claim)]
            );
            return rows[0]?.data ?? null;
        },
        async claimConcordInvite(id, tokenHash, clientParty, joinedAt) {
            const historyEvent = { event: "client_joined", by: clientParty.id, at: joinedAt };
            const { rows } = await pool.query(
                `UPDATE concords
                    SET data = jsonb_set(
                        jsonb_set(
                            jsonb_set(data, '{parties,client}', $3::jsonb, true),
                            '{inviteUsedAt}', $4::jsonb, true
                        ),
                        '{history}', (data->'history') || $5::jsonb, true
                    ), updated_at = now()
                  WHERE id = $1
                    AND data->'parties'->'client' = 'null'::jsonb
                    AND data->>'inviteTokenHash' = $2
              RETURNING data`,
                [id, tokenHash, JSON.stringify(clientParty), JSON.stringify(joinedAt), JSON.stringify([historyEvent])]
            );
            return rows[0]?.data ?? null;
        },
        async delete(table, key) {
            const r = await pool.query(`DELETE FROM ${safe(table)} WHERE id = $1`, [key]);
            return r.rowCount > 0;
        },
        async all(table) {
            const { rows } = await pool.query(`SELECT data FROM ${safe(table)} ORDER BY updated_at DESC`);
            return rows.map(r => r.data);
        },
        async keys(table) {
            const { rows } = await pool.query(`SELECT id FROM ${safe(table)}`);
            return rows.map(r => r.id);
        },
        async appendMessage(concordId, msg) {
            const client = await pool.connect();
            try {
                await client.query("BEGIN");
                await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [concordId]);
                const { rows } = await client.query(
                    "SELECT COALESCE(MAX(seq), 0) + 1 AS seq FROM messages WHERE concord_id = $1",
                    [concordId]
                );
                const stored = { ...msg, id: Number(rows[0].seq) };
                await client.query(
                    `INSERT INTO messages (concord_id, seq, data, created_at) VALUES ($1, $2, $3, now())`,
                    [concordId, stored.id, stored]
                );
                await client.query("COMMIT");
                return stored;
            } catch (error) {
                await client.query("ROLLBACK");
                throw error;
            } finally {
                client.release();
            }
        },
        async getMessages(concordId) {
            const { rows } = await pool.query(
                `SELECT data FROM messages WHERE concord_id = $1 ORDER BY seq ASC`, [concordId]
            );
            return rows.map(r => r.data);
        },
        async getCheckpoint(chain) {
            const { rows } = await pool.query(`SELECT block_number FROM checkpoints WHERE chain = $1`, [chain]);
            return rows[0]?.block_number ?? null;
        },
        async setCheckpoint(chain, block) {
            await pool.query(
                `INSERT INTO checkpoints (chain, block_number, updated_at) VALUES ($1, $2, now())
                 ON CONFLICT (chain) DO UPDATE SET block_number = $2, updated_at = now()`,
                [chain, block]
            );
        },
        async ping() { await pool.query("SELECT 1"); return true; },
        async close() { await pool.end(); }
    };
}

// Table names are never user input, but allowlist anyway - string
// interpolation into SQL is exactly the pattern that turns into an
// injection later when someone adds a dynamic caller.
const ALLOWED = new Set(["concords", "invoices", "commitments"]);
function safe(table) {
    if (!ALLOWED.has(table)) throw new Error(`unknown table: ${table}`);
    return table;
}

const store = DRIVER === "postgres" ? postgresStore() : memoryStore();

module.exports = store;
