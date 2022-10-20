import { task } from 'hardhat/config';
import '@typechain/hardhat';
import '@nomiclabs/hardhat-ethers';
import '@nomiclabs/hardhat-waffle';
import '@openzeppelin/hardhat-upgrades';
import 'hardhat-gas-reporter';
import 'hardhat-docgen';
import 'solidity-coverage';

import { config as dotenvConfig } from 'dotenv';
import { resolve } from 'path';

dotenvConfig({ path: resolve(__dirname, './.env') });

// This is a sample Hardhat task. To learn how to create your own go to
// https://hardhat.org/guides/create-task.html
task('accounts', 'Prints the list of accounts', async (taskArgs, hre) => {
  const accounts = await hre.ethers.getSigners();

  for (const account of accounts) {
    console.log(account.address);
  }
});

const MAINNET_DEV_KEY: string | undefined = process.env.MAINNET_DEV_KEY;
if (!MAINNET_DEV_KEY) {
  throw new Error('Please set your MAINNET_DEV_KEY in a .env file');
}

const TESTNET_DEV_KEY: string | undefined = process.env.TESTNET_DEV_KEY;
if (!TESTNET_DEV_KEY) {
  throw new Error('Please set your TESTNET_DEV_KEY in a .env file');
}

// You need to export an object to set up your config
// Go to https://hardhat.org/config/ to learn more

/**
 * @type import('hardhat/config').HardhatUserConfig
 */

const optimizerEnabled = true;

export default {
  gasReporter: {
    currency: 'USD',
    enabled: true,
    token: 'BNB',
    onlyCalledMethods: true,
    excludeContracts: [],
    gasPriceApi: 'https://api.bscscan.com/api?module=proxy&action=eth_gasPrice',
    coinmarketcap: '82cd475a-1f94-4ddd-9bbb-8a81c3345a2e',
  },
  solidity: {
    compilers: [
      {
        version: '0.8.14',
        settings: {
          optimizer: {
            enabled: optimizerEnabled,
            runs: 200,
          },
        },
      },
      {
        version: '0.8.7',
        settings: {
          optimizer: {
            enabled: optimizerEnabled,
            runs: 200,
          },
        },
      },
      {
        version: '0.8.4',
        settings: {
          optimizer: {
            enabled: optimizerEnabled,
            runs: 200,
          },
        },
      },
      {
        version: '0.6.6',
        settings: {
          optimizer: {
            enabled: optimizerEnabled,
            runs: 200,
          },
        },
      },
      {
        version: '0.5.16',
        settings: {
          optimizer: {
            enabled: optimizerEnabled,
            runs: 200,
          },
        },
      },
      {
        version: '0.4.24',
        settings: {
          optimizer: {
            enabled: optimizerEnabled,
            runs: 200,
          },
        },
      },
    ],
  },
  networks: {
    hardhat: {
      //gas: 30000000,
      allowUnlimitedContractSize: true,
      chainId: 1337,
      hardfork: 'berlin',
    },
    bsctest: {
      url: 'https://data-seed-prebsc-1-s1.binance.org:8545/',
      chainId: 97,
      accounts: [TESTNET_DEV_KEY],
      // gas: 3100000,
      // gasPrice: 8000000000,
    },
    bscMainnet: {
      url: 'https://bsc-dataseed.binance.org/',
      chainId: 56,
      accounts: [MAINNET_DEV_KEY],
      // gas: 3100000,
      // gasPrice: 8000000000,
    },
  },
};
