import { BigNumber } from 'ethers';
import { ethers, network } from 'hardhat';

export const toWei = (val: number): BigNumber => {
  return ethers.utils.parseEther('' + val);
};

export const fromWei = (val: BigNumber): string => {
  return ethers.utils.formatEther(val);
};

export const timeTravel = async (days: number) => {
  await network.provider.send('evm_increaseTime', [3600 * 24 * days]);
  await network.provider.send('evm_mine');
};

export const reset = async () => {
  await network.provider.request({
    method: 'hardhat_reset',
    params: [],
  });
};
