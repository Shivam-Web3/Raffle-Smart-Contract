// const { hardhatArguments } = require("hardhat")

require("@nomiclabs/hardhat-waffle")
require("@nomiclabs/hardhat-etherscan")
require("hardhat-deploy")
require("solidity-coverage")
require("hardhat-gas-reporter")
require("hardhat-contract-sizer")
require("dotenv").config()

const GOERLI_RPC_URL = process.env.GOERLI_RPC_URL
const PRIVATE_KEY = process.env.PRIVATE_KEY
const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY
const COINMARKETCAP_API_KEY = process.env.COINMARKETCAP_API_KEY

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
    defaultNetwork: "hardhat",
    networks: {
        hardhat: {
            chainId: 31337,
            blockConfirmations: 1,
        },
        goerli: {
            chainId: 5,
            blockConfirmations: 5,
            url: GOERLI_RPC_URL,
            accounts: [PRIVATE_KEY],
        },
    },
    etherscan: {
        apiKey: {
            goerli: ETHERSCAN_API_KEY,
        },
    },
    gasReporter: {
        enabled: true,
        currency: "INR",
        outputFile: "gasReporter.txt",
        noColors: true,
        coinmarketcap: COINMARKETCAP_API_KEY,
    },
    solidity: "0.8.9",
    namedAccounts: {
        deployer: {
            default: 0,
        },
        player: {
            default: 1,
        },
    },
    mocha: {
        timeout: 300000, //300 seconds
    },
}
