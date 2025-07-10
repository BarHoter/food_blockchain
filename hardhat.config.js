// hardhat.config.js
require("dotenv").config();
require("@nomicfoundation/hardhat-ethers");
require("@nomicfoundation/hardhat-chai-matchers");

const {
  ARB_GOERLI_RPC,
  OPT_GOERLI_RPC,
  PRIVATE_KEY,
  INFURA_PROJECT_ID
} = process.env;

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
