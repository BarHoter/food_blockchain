// hardhat.config.js
require("dotenv").config();
require("@nomicfoundation/hardhat-ethers");
require("@nomicfoundation/hardhat-chai-matchers");

const {
  ARB_GOERLI_RPC,
  OPT_GOERLI_RPC,
  PRIVATE_KEY,
  INFURA_ETHERIUM_URL,
  INFURA_ETHERIUM_KEY
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

// Only add Sepolia if both RPC URL and key are present
if (
  INFURA_ETHERIUM_URL &&
  INFURA_ETHERIUM_KEY &&
  INFURA_ETHERIUM_KEY.startsWith("0x") &&
  INFURA_ETHERIUM_KEY.length === 66
) {
  networks.sepolia = {
    url: INFURA_ETHERIUM_URL,
    accounts: [INFURA_ETHERIUM_KEY]
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
