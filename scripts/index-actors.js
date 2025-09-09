const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");
const artifact = require("../artifacts/contracts/BatchToken.sol/BatchToken.json");

const ENV_PATH = path.join(__dirname, "..", ".env");
if (fs.existsSync(ENV_PATH)) {
  dotenv.config({ path: ENV_PATH });
}

const { INFURA_PROJECT_ID } = process.env;
const PROVIDER_URL =
  process.env.PROVIDER_URL ||
  (INFURA_PROJECT_ID
    ? `https://sepolia.infura.io/v3/${INFURA_PROJECT_ID}`
    : "http://localhost:8545");
const ADDRESS_FILE = path.join(__dirname, "..", "addresses.json");
const NETWORK = process.env.NETWORK;
let CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS;
if (!CONTRACT_ADDRESS) {
  try {
    const data = fs.readFileSync(ADDRESS_FILE, "utf8");
    const map = JSON.parse(data);
    const net = NETWORK || Object.keys(map)[0];
    const addr = map[net];
    if (addr) {
      CONTRACT_ADDRESS = addr;
      console.log("Using %s contract address from %s", net, ADDRESS_FILE);
    } else if (NETWORK) {
      console.warn(`No address for network ${NETWORK} in ${ADDRESS_FILE}`);
    }
  } catch (_) {}
}

const OUT_DIR = path.join(__dirname, "..", "indexer");
const CHECKPOINT_FILE = path.join(OUT_DIR, "actors.checkpoint.json");
const ACTORS_FILE = path.join(OUT_DIR, "actors.json");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function loadCheckpoint() {
  try {
    const data = await fs.promises.readFile(CHECKPOINT_FILE, "utf8");
    const parsed = JSON.parse(data);
    return {
      lastIndexedBlock: parsed.lastIndexedBlock || 0,
      contractAddress: parsed.contractAddress || null,
    };
  } catch (_) {
    return { lastIndexedBlock: 0, contractAddress: null };
  }
}

async function saveCheckpoint(blockNumber) {
  await fs.promises.mkdir(OUT_DIR, { recursive: true });
  await fs.promises.writeFile(
    CHECKPOINT_FILE,
    JSON.stringify(
      { lastIndexedBlock: blockNumber, contractAddress: CONTRACT_ADDRESS },
      null,
      2
    )
  );
}

async function loadActors() {
  try {
    const text = await fs.promises.readFile(ACTORS_FILE, "utf8");
    const parsed = JSON.parse(text);
    return new Set(parsed.addresses || []);
  } catch (_) {
    return new Set();
  }
}

async function saveActors(set) {
  await fs.promises.mkdir(OUT_DIR, { recursive: true });
  const arr = Array.from(set);
  await fs.promises.writeFile(
    ACTORS_FILE,
    JSON.stringify({ addresses: arr }, null, 2)
  );
}

async function queryWithRetry(contract, filter, from, to) {
  let attempt = 0;
  while (true) {
    try {
      return await contract.queryFilter(filter, from, to);
    } catch (err) {
      attempt += 1;
      const delay = Math.min(1000 * 2 ** attempt, 30000);
      console.error(`RPC error: ${err.message || err}. retrying in ${delay}ms`);
      await sleep(delay);
    }
  }
}

async function main() {
  if (!CONTRACT_ADDRESS) {
    console.error(
      "CONTRACT_ADDRESS env var is required (or provide addresses.json)"
    );
    process.exit(1);
  }

  const provider = new ethers.JsonRpcProvider(PROVIDER_URL);
  const contract = new ethers.Contract(CONTRACT_ADDRESS, artifact.abi, provider);

  const { lastIndexedBlock, contractAddress } = await loadCheckpoint();

  if (
    contractAddress &&
    contractAddress.toLowerCase() !== CONTRACT_ADDRESS.toLowerCase()
  ) {
    // Reset by ignoring previous state when address changes
    await saveActors(new Set());
  }

  const latest = await provider.getBlockNumber();
  const fromBlock = lastIndexedBlock ? lastIndexedBlock + 1 : 0;
  const toBlock = latest;

  if (toBlock < fromBlock) {
    console.log("No new blocks to index for actors.");
    return;
  }

  const addedLogs = await queryWithRetry(contract, contract.filters.ActorAdded(), fromBlock, toBlock);
  const removedLogs = await queryWithRetry(contract, contract.filters.ActorRemoved(), fromBlock, toBlock);

  const actors = await loadActors();
  for (const log of addedLogs) {
    const addr = log.args[0];
    actors.add(addr);
  }
  for (const log of removedLogs) {
    const addr = log.args[0];
    actors.delete(addr);
  }

  await saveActors(actors);
  await saveCheckpoint(toBlock);
  console.log(`Indexed actors up to block ${toBlock}. Count=${actors.size}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

