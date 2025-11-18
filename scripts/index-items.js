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
const CHECKPOINT_FILE = path.join(OUT_DIR, "items.checkpoint.json");
const MAP_FILE = path.join(OUT_DIR, "items-map.json");

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

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

async function loadMap() {
  try {
    const text = await fs.promises.readFile(MAP_FILE, "utf8");
    return JSON.parse(text) || {};
  } catch (_) {
    return {};
  }
}

async function saveMap(map) {
  await fs.promises.mkdir(OUT_DIR, { recursive: true });
  await fs.promises.writeFile(MAP_FILE, JSON.stringify(map, null, 2));
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
    console.error("CONTRACT_ADDRESS env var is required (or provide addresses.json)");
    process.exit(1);
  }
  const provider = new ethers.JsonRpcProvider(PROVIDER_URL);
  const contract = new ethers.Contract(CONTRACT_ADDRESS, artifact.abi, provider);

  const { lastIndexedBlock, contractAddress } = await loadCheckpoint();

  if (contractAddress && contractAddress.toLowerCase() !== CONTRACT_ADDRESS.toLowerCase()) {
    await saveMap({});
  }

  const latest = await provider.getBlockNumber();
  const fromBlock = lastIndexedBlock ? lastIndexedBlock + 1 : 0;
  const toBlock = latest;
  if (toBlock < fromBlock) {
    console.log("No new blocks to index for items.");
    return;
  }

  const linkedLogs = await queryWithRetry(contract, contract.filters.ItemLinked(), fromBlock, toBlock);
  const map = await loadMap();
  for (const log of linkedLogs) {
    const batchExternalId = log.args[0];
    const itemId = log.args[1];
    map[batchExternalId] = itemId;
  }
  await saveMap(map);
  await saveCheckpoint(toBlock);
  console.log(`Indexed items up to block ${toBlock}. Count=${Object.keys(map).length}`);
}

main().catch((err) => { console.error(err); process.exit(1); });

