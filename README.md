# Food Blockchain

This repository contains a minimal Hardhat project that demonstrates a token used to track batches through a supply chain. The `BatchToken` contract emits events for every step of a batch lifecycle.

## Getting started

Run the setup script while online. It installs dependencies and compiles the
contracts so subsequent commands work offline:

```bash
./setup.sh
```

Run the unit tests:

```bash
npx hardhat test
```

To deploy, edit `hardhat.config.js` with your network settings and run:

```bash
npx hardhat run scripts/deploy.js --network <network>
```

When experimenting locally, you can start a Hardhat node with:

```bash
npx hardhat node
```

After each pull request is merged, a workflow uploads a snapshot of the repo to a GitHub Gist.

## Network configuration

Deployment scripts rely on several optional environment variables
(see `.env.example` for a template):

- `PRIVATE_KEY` – private key of the deploying account
- `ARB_GOERLI_RPC` – RPC endpoint for Arbitrum Goerli
- `OPT_GOERLI_RPC` – RPC endpoint for Optimism Goerli
- `INFURA_PROJECT_ID` – Infura project id used to construct the Sepolia RPC URL
- `DATABASE_URL` – connection string for the PostgreSQL database

When these variables are provided, the corresponding networks are made available in `hardhat.config.js`.

### Local Hardhat network

```
npx hardhat node
npx hardhat run scripts/deploy.js --network localhost
```

### Sepolia testnet

Make sure `INFURA_PROJECT_ID` and `PRIVATE_KEY` are available as
environment variables. A convenient way is to place them in a `.env` file:

```
INFURA_PROJECT_ID=<project-id>
PRIVATE_KEY=<private-key>
```

Then deploy using the configured network:

```
npx hardhat run scripts/deploy.js --network sepolia
```

If the `.env` file or any of the variables are missing, the Hardhat
configuration will throw an error explaining what is required. The
deployment script performs the same check before attempting to deploy.

### Verifying on an explorer

To publish the contract's source code, add an `ETHERSCAN_API_KEY` to your `.env`
and install the Hardhat verify plugin:

```bash
npm install --save-dev @nomicfoundation/hardhat-verify
```

After deployment run:

```bash
npx hardhat verify --network sepolia <deployed-address>
```

Once verified the explorer will expose a read/write interface for the contract.

## Offline compilation

A prebuilt copy of the Solidity `0.8.20` compiler is bundled under `compiler/soljson-v0.8.20.js`.
Hardhat uses this file automatically, enabling `npx hardhat compile` to run even when the machine has no internet access.

## Example lifecycle

Below is a minimal example of how to progress a batch through its lifecycle:

```javascript
await token.proposeTransfer(1, recipient, 1_700_000_000);
await token.confirmTransfer(1);
await token.shipBatch(1);
await token.receiveBatch(1);
```

Each step emits an event that can be indexed off chain. When a transfer is
proposed the contract records the caller as the *sender* and the `to` address as
the *recipient*. Subsequent lifecycle operations enforce that only the intended
parties may progress the batch:

- only the recorded recipient can confirm a proposal or mark the batch as
  received
- only the recorded sender can mark the batch as shipped

The contract also keeps track of batch ids for each of the four statuses
(`Proposed`, `Confirmed`, `Shipped`, `Received`). Call
`batchesInStatus(uint8 status)` to retrieve the ids currently in a given status.
The frontend uses this to populate the dropdowns for confirming, shipping and
receiving.
See **AGENTS.md** for a list of all agents and their roles.

## Testing

Offline environments like CI run only the fast test suite:

```bash
npm test
```

CI caches the local Hardhat compiler under `~/.cache/hardhat-nodejs/solc` so the first run downloads, subsequent runs are offline.

To run the full suite, including tests that access the internet, set
`RUN_LOCAL_TESTS=true` and use:

```bash
npm run test:local
```

## Local frontend

This repo ships a minimal web UI under `frontend/` that interacts with the `BatchToken` contract. To try it locally:

1. Run `./setup.sh` to install dependencies and compile the contracts.
2. Start a Hardhat node in one terminal:
   ```bash
   npx hardhat node
   ```
3. Deploy the contract to the local network in another terminal:
   ```bash
   npx hardhat run scripts/deploy.js --network localhost
   ```
   The deployment script writes the address to `addresses.json` under the
   `localhost` key.
4. Build the frontend so the Node server can serve the compiled assets:
   ```bash
   npm run build
   ```
5. Start the built-in server so the dashboard can run the indexer:
   ```bash
   npm run serve
   ```
   Set `NETWORK=localhost` or pass `CONTRACT_ADDRESS=<address>` to override the
   saved address. The server reads default addresses from `addresses.json`.
   The frontend is served at `http://localhost:8080` and the dashboard at
   `http://localhost:8080/dashboard`.
   If `CONTRACT_ADDRESS` is set, the address field in the UI is pre-filled.
6. Open `http://localhost:8080` in a browser (Chrome with MetaMask recommended)
   to interact with the contract.
7. Visit `http://localhost:8080/dashboard` to view indexed events.

The UI is built with Vite. During development run `npm run dev` which starts the
Vite dev server with hot reloading. For offline or production use build the
frontend with `npm run build` and serve it with `npm run serve`. The compiled
files live under `frontend/dist` so the application no longer depends on CDN
access to run.

### Sepolia frontend

After deploying to Sepolia you can reuse the same UI against the testnet.
Provide the deployed address and a Sepolia RPC endpoint when starting the
server:

```bash
CONTRACT_ADDRESS=<address> INFURA_PROJECT_ID=<project-id> npm run serve
```

If `PROVIDER_URL` is set instead it will be used verbatim. When
`INFURA_PROJECT_ID` is present and `PROVIDER_URL` is omitted the indexer
automatically connects to
`https://sepolia.infura.io/v3/<INFURA_PROJECT_ID>`.

### Render deployment

The repo includes a `render.yaml` that configures a Node web service. Create a new
service from this file or set the Build and Start commands manually. The build
step should install dependencies and compile the frontend:

```bash
npm install && npm run build
```

The start command runs `npm start` (or `node index.js`). Provide environment
variables such as `CONTRACT_ADDRESS` and `PROVIDER_URL` (or
`INFURA_PROJECT_ID`).


## Event indexer

The indexer script incrementally polls a JSON-RPC provider for a chosen
contract event and appends the results to `indexer/events.json`. A checkpoint in
`indexer/checkpoint.json` tracks the last processed block so the script can be
invoked repeatedly (for example by a cron job). The checkpoint stores the
contract address and will automatically clear previous data if the address
changes (e.g. after a redeploy).

```bash
# Required contract address
CONTRACT_ADDRESS=<address> npm run indexer
# or use a saved address from addresses.json
NETWORK=sepolia npm run indexer
```

Optional environment variables:

- `EVENT_NAME` – event to index (default: `TransferProposed`)
- `PROVIDER_URL` – RPC endpoint (default: `http://localhost:8545`)
- `FINALITY_LAG` – blocks to wait before indexing (default: `0`)
- `FINALITY_THRESHOLD` – blocks required for an event to be considered finalized
  when tagged in `events.json` (default: `6`)

Each entry in `events.json` now includes a `finalized` boolean that reflects
whether the event has surpassed `FINALITY_THRESHOLD` blocks. The indexer rewrites
previous entries on each run so older events become finalized once enough blocks
have passed.

The indexer will delete `events.json` and `checkpoint.json` if the current
`CONTRACT_ADDRESS` does not match what is stored in the checkpoint.

The dashboard is available at `http://localhost:8080/dashboard` when running
`npm run serve`. Make sure `CONTRACT_ADDRESS` is set or the **Refresh Index**
button will fail. Use the button to run the indexer on demand or enable **Auto
refresh** for periodic indexing.

## Admin interface

The server can optionally connect to a PostgreSQL database specified via the
`DATABASE_URL` environment variable. A simple `actors` table enables persistent
management of supply chain participants:

```sql
CREATE TABLE actors (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  address TEXT NOT NULL
);
```

Run the server with `npm run serve` and open `http://localhost:8080/admin` to
create, edit and delete actors.

When deploying to Render the `build` command runs `npm run db:init` which
creates the `actors` table if it is missing. For local development run the same
command after setting `DATABASE_URL`.
