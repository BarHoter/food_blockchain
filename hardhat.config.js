// hardhat.config.js
const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");

const ENV_PATH = path.resolve(__dirname, ".env");
if (fs.existsSync(ENV_PATH)) {
  dotenv.config({ path: ENV_PATH });
} else {
  console.warn(`Warning: .env file not found at ${ENV_PATH}`);
}
require("@nomicfoundation/hardhat-ethers");
require("@nomicfoundation/hardhat-chai-matchers");

const {
  ARB_GOERLI_RPC,
  OPT_GOERLI_RPC,
  PRIVATE_KEY,
  INFURA_PROJECT_ID
} = process.env;

// Hardhat sets HARDHAT_NETWORK too late for validation, so parse CLI args
function getRequestedNetwork() {
  const idx = process.argv.indexOf("--network");
  if (idx !== -1 && process.argv.length > idx + 1) {
    return process.argv[idx + 1];
  }
  const arg = process.argv.find(a => a.startsWith("--network="));
  if (arg) return arg.split("=")[1];
  return null;
}

const requestedNetwork = getRequestedNetwork();
if (requestedNetwork) {
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

// Always have a local Hardhat network
const networks = {
  hardhat: {
    chainId: 1337,
    blockGasLimit: 12_000_000
  }
};

// Only add Arbitrum Goerli if both RPC URL + key are present
if (ARB_GOERLI_RPC && PRIVATE_KEY) {
  networks.arbitrumGoerli = {
    url: ARB_GOERLI_RPC,
    accounts: [PRIVATE_KEY]
  };
}

// Only add Optimism Goerli if both RPC URL + key are present
if (OPT_GOERLI_RPC && PRIVATE_KEY) {
  networks.optimismGoerli = {
    url: OPT_GOERLI_RPC,
    accounts: [PRIVATE_KEY]
  };
}

// Only add Sepolia if project id and private key are present
if (
  INFURA_PROJECT_ID &&
  PRIVATE_KEY &&
  PRIVATE_KEY.startsWith("0x") &&
  PRIVATE_KEY.length === 66
) {
  networks.sepolia = {
    url: `https://sepolia.infura.io/v3/${INFURA_PROJECT_ID}`,
    accounts: [PRIVATE_KEY]
  };
}

module.exports = {
  solidity: {
    compilers: [
      {
        version: "0.8.20",
        compilerPath: "./compiler/soljson-v0.8.20.js"
      }
    ]
  },
  networks
};
