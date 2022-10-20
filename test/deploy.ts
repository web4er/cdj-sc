import { ethers, upgrades } from 'hardhat';
import { parseEther } from 'ethers/lib/utils';
import { USDT } from '../typechain-types';
import { reset } from './helpers';

export const deploy = async <ContractType>(contractName: string): Promise<[ContractType, USDT]> => {
  /**
   * owner
   * addr1 = reserve
   */

  reset();

  const [owner, freelancer, client, devWallet, ...signers] = await ethers.getSigners();

  const usdtFactory = await ethers.getContractFactory('USDT');
  const usdt = (await usdtFactory.deploy(parseEther('100000'))) as USDT;

  const mainContractFactory = await ethers.getContractFactory(contractName);
  const mainContract = await upgrades.deployProxy(mainContractFactory, [
    usdt.address,
    devWallet.address,
  ]);

  await usdt.transfer(client.address, parseEther('1000'));

  return [mainContract as unknown as ContractType, usdt];
};
