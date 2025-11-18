const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");
const artifact = require("../artifacts/contracts/BatchToken.sol/BatchToken.json");

const ENV_PATH = path.join(__dirname, "..", ".env");
if (fs.existsSync(ENV_PATH)) dotenv.config({ path: ENV_PATH });

const { INFURA_PROJECT_ID, PROVIDER_URL, PRIVATE_KEY, SOURCE_CONTRACT_ADDRESS, CONTRACT_ADDRESS } = process.env;
const RPC_URL = PROVIDER_URL || (INFURA_PROJECT_ID ? `https://sepolia.infura.io/v3/${INFURA_PROJECT_ID}` : "http://localhost:8545");

async function main() {
  if (!SOURCE_CONTRACT_ADDRESS || !ethers.isAddress(SOURCE_CONTRACT_ADDRESS)) {
    console.error("SOURCE_CONTRACT_ADDRESS is required");
    process.exit(1);
  }
  if (!CONTRACT_ADDRESS || !ethers.isAddress(CONTRACT_ADDRESS)) {
    console.error("CONTRACT_ADDRESS (target) is required");
    process.exit(1);
  }
  if (!PRIVATE_KEY) {
    console.error("PRIVATE_KEY (admin of target) is required");
    process.exit(1);
  }

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

  const source = new ethers.Contract(SOURCE_CONTRACT_ADDRESS, artifact.abi, provider);
  const target = new ethers.Contract(CONTRACT_ADDRESS, artifact.abi, wallet);

  const latest = await provider.getBlockNumber();
  const filter = source.filters.ItemLinked();
  const logs = await source.queryFilter(filter, 0, latest);
  const map = new Map();
  for (const log of logs) {
    const batch = String(log.args[0]);
    const item = String(log.args[1]);
    map.set(batch, item);
  }
  console.log(`Found ${map.size} batch->item mappings on source`);

  let migrated = 0, skipped = 0;
  for (const [batch, item] of map.entries()) {
    try {
      const existing = await target.itemOfBatch(batch);
      if (existing && String(existing).length) {
        if (String(existing) === item) { skipped += 1; continue; }
        // If mismatch, this will revert due to guard in contract
        console.log(`Mismatch for ${batch}. target has ${existing}, source has ${item}. Skipping.`);
        skipped += 1;
        continue;
      }
      const tx = await target.setItemForBatch(batch, item);
      await tx.wait();
      migrated += 1;
      if (migrated % 20 === 0) console.log(`Migrated ${migrated}/${map.size}...`);
    } catch (err) {
      console.error(`Failed to migrate ${batch} -> ${item}:`, err?.message || err);
    }
  }

  console.log(`Done. Migrated=${migrated}, Skipped=${skipped}`);
}

main().catch((e) => { console.error(e); process.exit(1); });

