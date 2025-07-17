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
