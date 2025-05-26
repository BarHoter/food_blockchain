# Food Blockchain

This repository contains a minimal Hardhat project that demonstrates a token used to track batches through a supply chain. The `BatchToken` contract emits events for every step of a batch lifecycle.

## Getting started

Install the dependencies:

```bash
npm install
```

Compile the contracts:

```bash
npx hardhat compile
```

Run the unit tests:

```bash
npx hardhat test
```

To deploy, edit `hardhat.config.js` with your network settings and run:

```bash
npx hardhat run scripts/deploy.js --network <network>
```

After each pull request is merged, a workflow uploads a snapshot of the repo to a GitHub Gist.
