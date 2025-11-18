## Admin interface

The server can optionally connect to a PostgreSQL database specified via the `DATABASE_URL` environment variable. A simple `actors` table enables persistent management of supply chain participants:

```sql
CREATE TABLE actors (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  physical_address TEXT NOT NULL,
  blockchain_address TEXT NOT NULL,
  logo_url TEXT
);
```

Some of this information is stored in Postgres today, but future versions may keep certain fields on-chain or in decentralized storage such as IPFS/Filecoin.

Run the server with `npm run serve` and open `http://localhost:8080/admin` to create, edit and delete actors.

When deploying to Render the `build` command runs `npm run db:init`. The script now drops the existing `actors` table, recreates it and seeds a few demo rows. For local development run the same command after setting `DATABASE_URL` to start with fresh sample data. If the admin interface fails to add actors, rerun `npm run db:init` to ensure the table has all expected columns.

### Sync database actors from on-chain approvals

If you reset Postgres but the contract already tracks approved actors, run the new sync command to recreate placeholder rows automatically:

```
CONTRACT_ADDRESS=<address> npm run sync:actors
```

The script refreshes `indexer/actors.json`, compares it to the `actors` table and inserts any missing blockchain addresses with generated names such as `Recovered actor 0x1234...abcd`. Customize the placeholder text with:

- `SYNC_ACTOR_NAME_PREFIX` or `SYNC_ACTOR_NAME_TEMPLATE` (accepts `{address}` token)
- `SYNC_ACTOR_PHYSICAL`
- `SYNC_ACTOR_LOGO_URL`

The admin UI now offers the same automation via the **Sync on-chain actors** button above the _Database Actors_ list. The button indicates how many entries are missing and only enables when the DB connection is healthy.

### Batch → Item mapping resiliency

The contract emits `ItemLinked(batchExternalId, itemId)` whenever an admin links a manufacturing batch to an item id. Two utilities help recover or migrate those mappings:

- Index on-chain mappings to JSON:
  - Endpoint: `POST /api/refresh` now also runs `scripts/index-items.js`.
  - Output: `indexer/items-map.json` containing `{ "<batchExternalId>": "<itemId>", ... }` built from `ItemLinked` events.
  - Use this to discover batch keys even if the database is unavailable.

- Migrate mappings to a new contract:
  - Script: `node scripts/migrate-items.js`
  - Required env: `SOURCE_CONTRACT_ADDRESS` (old contract), `CONTRACT_ADDRESS` (new contract), `PRIVATE_KEY` (admin key), and `PROVIDER_URL` or `INFURA_PROJECT_ID`.
  - Behavior: reads all `ItemLinked` from the source, checks target `itemOfBatch(batch)`, and calls `setItemForBatch(batch,itemId)` only when missing. Existing mismatches are skipped.

Example:

```
export PROVIDER_URL=https://sepolia.infura.io/v3/<project>
export SOURCE_CONTRACT_ADDRESS=0xOld...
export CONTRACT_ADDRESS=0xNew...
export PRIVATE_KEY=0xabc123...
node scripts/migrate-items.js
```

This ensures frontends that depend on `itemOfBatch` keep working after redeploys, and gives operators a way to recover batch keys if the DB is corrupted.
