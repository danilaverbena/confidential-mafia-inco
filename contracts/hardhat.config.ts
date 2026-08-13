import type { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox-viem";
import * as dotenv from "dotenv";

dotenv.config();

const PRIVATE_KEY = process.env.PRIVATE_KEY_BASE_SEPOLIA || "";

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.30",
    settings: {
      evmVersion: "cancun",
      viaIR: true, // games use many stack slots
      optimizer: { enabled: true, runs: 200 },
    },
  },
  networks: {
    hardhat: {},
    // Inco local node; 20 funded accounts for multi-player tests.
    anvil: {
      url: process.env.LOCAL_RPC_URL || "http://localhost:8545",
      chainId: 31337,
      accounts: {
        mnemonic:
          process.env.SEED_PHRASE ||
          "test test test test test test test test test test test junk",
        count: 20,
      },
    },
    baseSepolia: {
      url: process.env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org",
      chainId: 84532,
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
    },
  },
  mocha: { timeout: 120_000 }, // covalidator round-trips are slow
};

export default config;
