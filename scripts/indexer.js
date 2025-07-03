const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");
const artifact = require("../artifacts/contracts/BatchToken.sol/BatchToken.json");

const PROVIDER_URL = process.env.PROVIDER_URL || "http://localhost:8545";
const ADDRESS_FILE = path.join(__dirname, "..", "address.txt");
let CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS;
if (!CONTRACT_ADDRESS) {
  try {
    CONTRACT_ADDRESS = fs.readFileSync(ADDRESS_FILE, "utf8").trim();
    console.log("Using contract address from", ADDRESS_FILE);
  } catch (_) {}
}
const EVENT_NAME = process.env.EVENT_NAME || "TransferProposed";
// How many blocks the indexer waits before persisting a checkpoint.
// Default is 0 so new events are indexed immediately.
const FINALITY_LAG = parseInt(process.env.FINALITY_LAG || "0", 10);
// Number of blocks after which an event is considered finalized. This is only
// used for tagging events and does not affect checkpointing.
const FINALITY_THRESHOLD = parseInt(process.env.FINALITY_THRESHOLD || "6", 10);

const OUT_DIR = path.join(__dirname, "..", "indexer");
const CHECKPOINT_FILE = path.join(OUT_DIR, "checkpoint.json");
const EVENTS_FILE = path.join(OUT_DIR, "events.json");

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

async function resetIndex() {
  try {
    await fs.promises.unlink(CHECKPOINT_FILE);
  } catch (_) {}
  try {
    await fs.promises.unlink(EVENTS_FILE);
  } catch (_) {}
}

async function writeEvents(events) {
  if (!events.length) return;
  await fs.promises.mkdir(OUT_DIR, { recursive: true });
  const lines = events.map((e) =>
    JSON.stringify(e, (k, v) => (typeof v === "bigint" ? v.toString() : v))
  );
  await fs.promises.appendFile(EVENTS_FILE, lines.join("\n") + "\n");
}

async function fetchEvents(contract, fromBlock, toBlock) {
  let attempt = 0;
  while (true) {
    try {
      console.log(
        `Fetching ${EVENT_NAME} events from blocks ${fromBlock} to ${toBlock}`
      );
      const filter = contract.filters[EVENT_NAME]();
      const logs = await contract.queryFilter(filter, fromBlock, toBlock);
      return logs;
    } catch (err) {
      attempt += 1;
      const delay = Math.min(1000 * 2 ** attempt, 30000);
      console.error(`RPC error: ${err.message || err}. retrying in ${delay}ms`);
      await sleep(delay);
    }
  }
}

async function formatEvents(logs, provider, finalizedBlock) {
  const events = [];
  for (const log of logs) {
    const block = await provider.getBlock(log.blockNumber);
    events.push({
      event: log.event,
      args: Object.fromEntries(
        Object.entries(log.args || {}).filter(([k]) => isNaN(k))
      ),
      blockNumber: log.blockNumber,
      blockTimestamp: block.timestamp,
      transactionHash: log.transactionHash,
      logIndex: log.logIndex,
      finalized: log.blockNumber <= finalizedBlock,
    });
  }
  return events;
}

async function main() {
  if (!CONTRACT_ADDRESS) {
    console.error(
      "CONTRACT_ADDRESS env var is required (or provide address.txt)"
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
    console.log(
      `Contract address changed from ${contractAddress} to ${CONTRACT_ADDRESS}. resetting index`
    );
    await resetIndex();
  }

  const latestBlock = await provider.getBlockNumber();
  const toBlock = latestBlock - FINALITY_LAG;
  const finalizedBlock = latestBlock - FINALITY_THRESHOLD;

  const checkpoint = contractAddress && contractAddress.toLowerCase() === CONTRACT_ADDRESS.toLowerCase() ? lastIndexedBlock : 0;

  if (toBlock <= checkpoint) {
    console.log(
      `No new blocks to index. latest=${latestBlock} checkpoint=${checkpoint}`
    );
    return;
  }

  const fromBlock = checkpoint + 1;
  const logs = await fetchEvents(contract, fromBlock, toBlock);

  if (logs.length === 0) {
    console.log(`No events found. Advancing checkpoint to ${toBlock}`);
    await saveCheckpoint(toBlock);
    return;
  }

  const events = await formatEvents(logs, provider, finalizedBlock);
  await writeEvents(events);
  console.log(`Indexed ${events.length} events up to block ${toBlock}`);
  await saveCheckpoint(toBlock);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
