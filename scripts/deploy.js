const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");

const ENV_PATH = path.join(__dirname, "..", ".env");
if (fs.existsSync(ENV_PATH)) {
  dotenv.config({ path: ENV_PATH });
} else {
  console.warn(`Warning: .env file not found at ${ENV_PATH}`);
}

const {
  ARB_GOERLI_RPC,
  OPT_GOERLI_RPC,
  PRIVATE_KEY,
  INFURA_PROJECT_ID
} = process.env;

function validateEnv() {
  const requestedNetwork = process.env.HARDHAT_NETWORK;
  if (!requestedNetwork) return;

  const missing = [];
  if (!fs.existsSync(ENV_PATH)) missing.push(".env file");

  if (requestedNetwork === "sepolia") {
    if (!INFURA_PROJECT_ID) missing.push("INFURA_PROJECT_ID");
    if (!PRIVATE_KEY) missing.push("PRIVATE_KEY");
  } else if (requestedNetwork === "arbitrumGoerli") {
    if (!ARB_GOERLI_RPC) missing.push("ARB_GOERLI_RPC");
    if (!PRIVATE_KEY) missing.push("PRIVATE_KEY");
  } else if (requestedNetwork === "optimismGoerli") {
    if (!OPT_GOERLI_RPC) missing.push("OPT_GOERLI_RPC");
    if (!PRIVATE_KEY) missing.push("PRIVATE_KEY");
  }

  if (missing.length) {
    throw new Error(
      `Missing required environment variables for ${requestedNetwork}: ${missing.join(", ")}. Create a .env file with these values.`
    );
  }
}

const ADDRESS_FILE = path.join(__dirname, "..", "address.txt");

validateEnv();

async function main() {
  // Compile & deploy to the configured network
  const BatchToken = await ethers.getContractFactory("BatchToken");
  console.log("Deploying BatchToken...");
  const token = await BatchToken.deploy();
  await token.waitForDeployment();    // ← ethers v6 replacement for deployed()
  console.log("BatchToken deployed at:", token.target);

  try {
    await fs.promises.mkdir(path.dirname(ADDRESS_FILE), { recursive: true });
    await fs.promises.writeFile(ADDRESS_FILE, token.target.toString());
    console.log("Saved address to", ADDRESS_FILE);
  } catch (err) {
    console.warn("Failed to save address", err);
  }
}

main()
  .then(() => process.exit(0))
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
