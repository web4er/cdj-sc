// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// When running the script with `npx hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
import { ethers, upgrades } from 'hardhat';
import { parseEther } from 'ethers/lib/utils';
import { USDT, CdjEscrow } from '../typechain-types';

async function main() {
  // Hardhat always runs the compile task when running scripts with its command
  // line interface.
  //
  // If this script is run directly using `node` you may want to call compile
  // manually to make sure everything is compiled
  // await hre.run('compile');

  // const usdtFactory = await ethers.getContractFactory('USDT');
  // const contractUsdt = await usdtFactory.deploy(parseEther('1000000000'));
  //
  // console.log('contractUsdt.address', contractUsdt.address);

  const cdjEscrowFactory = await ethers.getContractFactory('CdjEscrow');
  const contractCdjEscrow = await cdjEscrowFactory.deploy(
    '0x3c398a6010D9B918fbC9c8759f6c32Eab370F0D5',
    '0xc9AEbBd8400Db26A0d9DbF4fCC7dC6495a25C3cD',
  );

  console.log('contractCdjEscrow.address', contractCdjEscrow.address);

  // const cdjEscrow = (await ethers.getContractAt(
  //   'CdjEscrow',
  //   '0x7a19c00dD7746d5dd566879deAD8Ea7a4C80de10',
  // )) as CdjEscrow;
  //
  // await cdjEscrow.setPaymentToken(contractUsdt.address);

  console.log('done');
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
