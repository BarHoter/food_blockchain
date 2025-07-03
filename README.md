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

Deployment scripts rely on three optional environment variables:

- `PRIVATE_KEY` – private key of the deploying account
- `ARB_GOERLI_RPC` – RPC endpoint for Arbitrum Goerli
- `OPT_GOERLI_RPC` – RPC endpoint for Optimism Goerli

When these variables are provided, the corresponding networks are made available in `hardhat.config.js`.

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

Each step emits an event that can be indexed off chain.
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
   Copy the deployed contract address from the output.
4. Start the built-in server with the contract address so the dashboard can run the indexer:
   ```bash
   CONTRACT_ADDRESS=<address> npm run serve
   ```
   The frontend is served at `http://localhost:8080` and the dashboard at
   `http://localhost:8080/dashboard.html`.
   If `CONTRACT_ADDRESS` is set, the address field in the UI is pre-filled.
5. Open `http://localhost:8080` in a browser (Chrome with MetaMask recommended)
   to interact with the contract.
6. Visit `http://localhost:8080/dashboard.html` to view indexed events.

The UI uses Ethers.js via CDN, so no additional build steps are required.

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
```

Optional environment variables:

- `EVENT_NAME` – event to index (default: `TransferProposed`)
- `PROVIDER_URL` – RPC endpoint (default: `http://localhost:8545`)
- `FINALITY_LAG` – blocks to wait before indexing (default: `6`)

The indexer will delete `events.json` and `checkpoint.json` if the current
`CONTRACT_ADDRESS` does not match what is stored in the checkpoint.

The dashboard is available at `http://localhost:8080/dashboard.html` when running
`npm run serve`. Make sure `CONTRACT_ADDRESS` is set or the **Refresh Index**
button will fail. Use the button to run the indexer on demand or enable **Auto
refresh** for periodic indexing.
