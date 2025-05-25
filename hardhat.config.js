require("dotenv").config();
require("@nomiclabs/hardhat-ethers");

module.exports = {
  solidity: "0.8.20",
  networks: {
    hardhat: {
      chainId: 1337,
      blockGasLimit: 12_000_000
    },
    // later, point these at your L2 testnets:
    arbitrumGoerli: {
      url: process.env.ARB_GOERLI_RPC,
      accounts: [process.env.PRIVATE_KEY]
    },
    optimismGoerli: {
      url: process.env.OPT_GOERLI_RPC,
      accounts: [process.env.PRIVATE_KEY]
    }
  }
};
