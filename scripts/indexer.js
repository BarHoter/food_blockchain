const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");
const artifact = require("../artifacts/contracts/BatchToken.sol/BatchToken.json");

const PROVIDER_URL = process.env.PROVIDER_URL || "http://localhost:8545";
const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS;
const EVENT_NAME = process.env.EVENT_NAME || "TransferProposed";
const FINALITY_LAG = parseInt(process.env.FINALITY_LAG || "6", 10);

const OUT_DIR = path.join(__dirname, "..", "indexer");
const CHECKPOINT_FILE = path.join(OUT_DIR, "checkpoint.json");
const EVENTS_FILE = path.join(OUT_DIR, "events.json");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function loadCheckpoint() {
  try {
    const data = await fs.promises.readFile(CHECKPOINT_FILE, "utf8");
    return JSON.parse(data).lastIndexedBlock || 0;
  } catch (_) {
    return 0;
  }
}

async function saveCheckpoint(blockNumber) {
  await fs.promises.mkdir(OUT_DIR, { recursive: true });
  await fs.promises.writeFile(
    CHECKPOINT_FILE,
    JSON.stringify({ lastIndexedBlock: blockNumber }, null, 2)
  );
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

async function formatEvents(logs, provider) {
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
    });
  }
  return events;
}

async function main() {
  if (!CONTRACT_ADDRESS) {
    console.error("CONTRACT_ADDRESS env var is required");
    process.exit(1);
  }

  const provider = new ethers.JsonRpcProvider(PROVIDER_URL);
  const contract = new ethers.Contract(CONTRACT_ADDRESS, artifact.abi, provider);

  const lastIndexed = await loadCheckpoint();
  const latestBlock = await provider.getBlockNumber();
  const toBlock = latestBlock - FINALITY_LAG;

  if (toBlock <= lastIndexed) {
    console.log(
      `No new finalized blocks. latest=${latestBlock} checkpoint=${lastIndexed}`
    );
    return;
  }

  const fromBlock = lastIndexed + 1;
  const logs = await fetchEvents(contract, fromBlock, toBlock);

  if (logs.length === 0) {
    console.log(`No events found. Advancing checkpoint to ${toBlock}`);
    await saveCheckpoint(toBlock);
    return;
  }

  const events = await formatEvents(logs, provider);
  await writeEvents(events);
  console.log(`Indexed ${events.length} events up to block ${toBlock}`);
  await saveCheckpoint(toBlock);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
