import { ethers } from 'hardhat';
import chai, { expect } from 'chai';
import 'mocha';
import { BN } from 'bn.js';
import chai_bn from 'chai-bn';
import { deploy } from './deploy';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { CdjEscrow, USDT } from '../typechain-types';
import { parseEther } from 'ethers/lib/utils';
import { BigNumber } from 'ethers';
import { timeTravel } from './helpers';

chai.use(chai_bn(BN));

describe('CdjEscrow', function () {
  let owner: SignerWithAddress,
    freelancer: SignerWithAddress,
    client: SignerWithAddress,
    devWallet: SignerWithAddress,
    signers: SignerWithAddress[];

  let cdjEscrow: CdjEscrow, usdt: USDT;

  enum ContractStatus {
    STARTED,
    COMPLETE_INITIATED,
    COMPLETED,
    IN_DISPUTE,
    DISPUTE_RESOLVED,
  }

  const firstContractNo = 11112;
  const defaultFee = 100;

  beforeEach(async function () {
    [owner, freelancer, client, devWallet, ...signers] = await ethers.getSigners();

    [cdjEscrow, usdt] = await deploy<CdjEscrow>('CdjEscrow');
  });

  const startNewContract = async (termsHash: string, contractAmount: BigNumber) => {
    await usdt.connect(client).approve(cdjEscrow.address, contractAmount);
    await cdjEscrow.connect(client).startContract(freelancer.address, termsHash, contractAmount);
    const contractDetails = await cdjEscrow.contractDetails(11112);
    return contractDetails;
  };

  const getHash = () => {
    return ethers.utils.solidityKeccak256(
      ['string'],
      ['0ee10f0aca975351c91a87242f56e43fbb3b2812299438e66469c7456e3c3510'],
    );
  };

  it('Should start a new contract', async () => {
    const termsHash = getHash();
    const contractAmount = parseEther('10');

    const contractDetails = await startNewContract(termsHash, contractAmount);
    expect(await cdjEscrow.currentContractNo()).eq(firstContractNo);

    expect({
      contractNo: contractDetails.contractNo.toNumber(),
      freelancer: contractDetails.freelancer,
      client: contractDetails.client,
      termsHash: contractDetails.termsHash,
      status: 1,
      amount: contractDetails.amount.toString(),
    }).deep.eq({
      contractNo: firstContractNo,
      freelancer: freelancer.address,
      client: client.address,
      termsHash: termsHash,
      status: 1,
      amount: contractAmount.toString(),
    });

    expect(contractDetails.startTime).gt(0);
  });

  it('Should revert new contract with payment amount less than 1', async () => {
    const termsHash = getHash();
    const contractAmount = parseEther('0');

    await expect(
      cdjEscrow.connect(client).startContract(freelancer.address, termsHash, contractAmount),
    ).revertedWith('Min pay amount 1 required');

    const contractAmount2 = parseEther('1').sub('1');
    await usdt.connect(client).approve(cdjEscrow.address, contractAmount2);
    await expect(
      cdjEscrow.connect(client).startContract(freelancer.address, termsHash, contractAmount2),
    ).revertedWith('Min pay amount 1 required');
  });

  it('Should revert new contract with insufficient allowance', async () => {
    const termsHash = getHash();
    const contractAmount = parseEther('10');

    await usdt.connect(client).approve(cdjEscrow.address, contractAmount.sub(1));
    await expect(
      cdjEscrow.connect(client).startContract(freelancer.address, termsHash, contractAmount),
    ).revertedWith('ERC20: transfer amount exceeds allowance');
  });

  it('Should revert start new contract when main switch is off', async () => {
    const termsHash = getHash();
    const contractAmount = parseEther('10');

    await usdt.connect(client).approve(cdjEscrow.address, contractAmount);

    await cdjEscrow.toggleNewContractAllowed();
    await expect(
      cdjEscrow.connect(client).startContract(freelancer.address, termsHash, contractAmount),
    ).revertedWith('Contract is on pause');
  });

  it('Should revert close contract by freelancer', async () => {
    const termsHash = getHash();
    const contractAmount = parseEther('10');

    const contractDetailsBefore = await startNewContract(termsHash, contractAmount);
    expect(await cdjEscrow.currentContractNo()).eq(11112);
    expect(contractDetailsBefore.status).eq(0);

    //do not allowing closing contract again
    await expect(cdjEscrow.connect(freelancer).initiateComplete(11112)).revertedWith(
      'Only client can close',
    );
  });

  it('Should close contract by client', async () => {
    const termsHash = getHash();
    const contractAmount = parseEther('10');

    const contractDetailsBefore = await startNewContract(termsHash, contractAmount);
    expect(await cdjEscrow.currentContractNo()).eq(11112);
    expect(contractDetailsBefore.status).eq(0);
    await cdjEscrow.connect(client).initiateComplete(11112);

    const contractDetailsAfter = await cdjEscrow.contractDetails(11112);
    expect(contractDetailsAfter.status).eq(1);

    //do not allowing closing contract again
    await expect(cdjEscrow.connect(client).initiateComplete(11112)).revertedWith(
      'Not available for closing',
    );
  });

  it('Should revert claim payment with invalid conditions', async () => {
    const termsHash = getHash();
    const contractAmount = parseEther('10');

    const contractDetailsBefore = await startNewContract(termsHash, contractAmount);

    await expect(cdjEscrow.connect(freelancer).claimPayment(11112)).revertedWith(
      'Not available for claim',
    );

    await cdjEscrow.connect(client).initiateComplete(11112);

    const contractDetailsAfter = await cdjEscrow.contractDetails(11112);
    expect(contractDetailsAfter.status).eq(1);

    await expect(cdjEscrow.connect(client).claimPayment(11112)).revertedWith(
      'Only freelancer can claim',
    );

    await expect(cdjEscrow.connect(freelancer).claimPayment(11112)).revertedWith(
      'Too early to claim',
    );
  });

  it('Should allow claim payment by freelancer', async () => {
    const termsHash = getHash();
    const contractAmount = parseEther('10');

    const contractDetailsBefore = await startNewContract(termsHash, contractAmount);
    await cdjEscrow.connect(client).initiateComplete(11112);

    const contractDetailsAfter = await cdjEscrow.contractDetails(11112);
    expect(contractDetailsAfter.status).eq(1);

    timeTravel(7);
    await cdjEscrow.connect(freelancer).claimPayment(11112);

    const feeAmount = contractAmount.mul(defaultFee).div(10000);
    const freelancerAmount = contractAmount.sub(feeAmount);

    const freelancerBalance = await usdt.balanceOf(freelancer.address);
    expect(freelancerBalance).eq(freelancerAmount);

    const devBalance = await usdt.balanceOf(devWallet.address);
    expect(devBalance).eq(feeAmount);
  });

  it('Should not change the fee for old contract', async () => {
    const termsHash = getHash();
    const contractAmount = parseEther('10');

    const contractDetailsBefore = await startNewContract(termsHash, contractAmount);
    await cdjEscrow.setFee('200');
    await cdjEscrow.connect(client).initiateComplete(firstContractNo);

    const contractDetailsAfter = await cdjEscrow.contractDetails(firstContractNo);
    expect(contractDetailsAfter.status).eq(1);

    timeTravel(7);
    await cdjEscrow.connect(freelancer).claimPayment(firstContractNo);

    const feeAmount = contractAmount.mul(defaultFee).div(10000);
    const devBalance = await usdt.balanceOf(devWallet.address);
    expect(devBalance).eq(feeAmount);
  });

  it('Should start dispute by freelancer', async () => {
    const termsHash = getHash();
    const contractAmount = parseEther('10');

    const contractDetails = await startNewContract(termsHash, contractAmount);

    await expect(cdjEscrow.startDispute(firstContractNo)).revertedWith('Not allowed');

    await cdjEscrow.connect(freelancer).startDispute(firstContractNo);
    const contractDetailsAfter = await cdjEscrow.contractDetails(firstContractNo);
    expect(contractDetailsAfter.status).eq(ContractStatus.IN_DISPUTE);
  });

  it('Should start dispute by client', async () => {
    const termsHash = getHash();
    const contractAmount = parseEther('10');

    const contractDetails = await startNewContract(termsHash, contractAmount);

    await expect(cdjEscrow.startDispute(firstContractNo)).revertedWith('Not allowed');

    await cdjEscrow.connect(client).startDispute(firstContractNo);
    const contractDetailsAfter = await cdjEscrow.contractDetails(firstContractNo);
    expect(contractDetailsAfter.status).eq(ContractStatus.IN_DISPUTE);
  });

  it('Should start dispute by client in COMPLETE_INITIATED', async () => {
    const termsHash = getHash();
    const contractAmount = parseEther('10');

    const contractDetails = await startNewContract(termsHash, contractAmount);

    await cdjEscrow.connect(client).initiateComplete(firstContractNo);

    await cdjEscrow.connect(client).startDispute(firstContractNo);
    const contractDetailsAfter = await cdjEscrow.contractDetails(firstContractNo);
    expect(contractDetailsAfter.status).eq(ContractStatus.IN_DISPUTE);
  });

  it('Should revert dispute by freelancer in COMPLETE_INITIATED', async () => {
    const termsHash = getHash();
    const contractAmount = parseEther('10');

    const contractDetails = await startNewContract(termsHash, contractAmount);

    await cdjEscrow.connect(client).initiateComplete(firstContractNo);

    await expect(cdjEscrow.connect(freelancer).startDispute(firstContractNo)).revertedWith(
      'Cannot dispute this contract',
    );
  });

  it('Should revert closing disputed contract', async () => {
    const termsHash = getHash();
    const contractAmount = parseEther('10');

    const contractDetails = await startNewContract(termsHash, contractAmount);
    await cdjEscrow.connect(freelancer).startDispute(firstContractNo);

    await expect(cdjEscrow.connect(client).initiateComplete(firstContractNo)).revertedWith(
      'Not available for closing',
    );
  });

  it('Should resolve dispute', async () => {
    const termsHash = getHash();
    const contractAmount = parseEther('10');

    const contractDetails = await startNewContract(termsHash, contractAmount);
    await cdjEscrow.connect(client).startDispute(firstContractNo);

    const clientBalanceBefore = await usdt.balanceOf(client.address);

    await cdjEscrow.setDisputeResolver(signers[0].address, true);

    const freelancerAmount = parseEther('8');
    await cdjEscrow.connect(signers[0]).resolveDispute(firstContractNo, freelancerAmount);

    const feeAmount = contractAmount.mul(defaultFee).div(10000);
    const clientAmount = contractAmount.sub(feeAmount).sub(freelancerAmount);

    const freelancerBalance = await usdt.balanceOf(freelancer.address);
    expect(freelancerBalance).eq(freelancerAmount);

    const devBalance = await usdt.balanceOf(devWallet.address);
    expect(devBalance).eq(feeAmount);

    const clientBalanceAfter = await usdt.balanceOf(client.address);
    expect(clientBalanceAfter).eq(clientBalanceBefore.add(clientAmount));

    const contractDetails2 = await cdjEscrow.contractDetails(firstContractNo);
    expect(contractDetails2.status).eq(ContractStatus.DISPUTE_RESOLVED);
  });

  it('Should revert resolve dispute', async () => {
    const termsHash = getHash();
    const contractAmount = parseEther('10');
    await cdjEscrow.setDisputeResolver(signers[0].address, true);

    const contractDetails = await startNewContract(termsHash, contractAmount);
    const freelancerAmount = parseEther('3');
    await expect(
      cdjEscrow.connect(signers[0]).resolveDispute(firstContractNo, freelancerAmount),
    ).revertedWith('Not in dispute');

    await cdjEscrow.connect(client).startDispute(firstContractNo);

    await expect(
      cdjEscrow.connect(signers[1]).resolveDispute(firstContractNo, freelancerAmount),
    ).revertedWith('Only dispute resolver allowed');

    await expect(
      cdjEscrow.connect(signers[0]).resolveDispute(firstContractNo, parseEther('10')),
    ).revertedWith('Freelancer amount too much');

    await expect(cdjEscrow.connect(signers[0]).resolveDispute(firstContractNo, freelancerAmount))
      .not.reverted;
  });

  it('Should set payment token by owner only', async () => {
    expect(await cdjEscrow.paymentToken()).eq(usdt.address);

    const busd = '0x55d398326f99059fF775485246999027B3197955';
    await cdjEscrow.setPaymentToken(busd);
    expect(await cdjEscrow.paymentToken()).eq(busd);

    await expect(cdjEscrow.connect(signers[0]).setPaymentToken(usdt.address)).revertedWith(
      'Ownable: caller is not the owner',
    );
  });

  it('Should allow toggle main switch by owner only', async () => {
    expect(await cdjEscrow.newContractAllowed()).eq(true);

    await cdjEscrow.toggleNewContractAllowed();
    expect(await cdjEscrow.newContractAllowed()).eq(false);

    await expect(cdjEscrow.connect(signers[0]).toggleNewContractAllowed()).revertedWith(
      'Ownable: caller is not the owner',
    );
  });

  it('Should allow changing fee by owner only', async () => {
    expect(await cdjEscrow.fee()).eq(defaultFee);

    await cdjEscrow.setFee(defaultFee + 10);
    expect(await cdjEscrow.fee()).eq(defaultFee + 10);

    await expect(cdjEscrow.connect(signers[0]).setFee(1)).revertedWith(
      'Ownable: caller is not the owner',
    );
  });

  it('Should close contract', async () => {
    expect(await cdjEscrow.fee()).eq(defaultFee);

    await cdjEscrow.setFee(1000);
    expect(await cdjEscrow.fee()).eq(1000);

    await expect(cdjEscrow.connect(signers[0]).setFee(1)).revertedWith(
      'Ownable: caller is not the owner',
    );
  });

  it('Should get 10 recent contracts by client', async () => {
    const termsHash = getHash();
    const contractAmount = parseEther('10');

    let contractDetails = [];
    for (let i = 0; i < 10; ++i) {
      contractDetails[i] = await startNewContract(termsHash, contractAmount);
    }

    expect(await cdjEscrow.currentContractNo()).eq(11121);

    const results = await cdjEscrow.getRecentContractByClient(client.address, 20);
    expect(results.length).eq(10);
  });

  it('Should get 5 recent contracts by freelancer', async () => {
    const termsHash = getHash();
    const contractAmount = parseEther('10');

    let contractDetails = [];
    for (let i = 0; i < 5; ++i) {
      contractDetails[i] = await startNewContract(termsHash, contractAmount);
    }

    expect(await cdjEscrow.currentContractNo()).eq(11116);

    const results = await cdjEscrow.getRecentContractByFreelancer(freelancer.address, 20);
    expect(results.length).eq(5);

    const results2 = await cdjEscrow.getRecentContractByFreelancer(signers[0].address, 20);
    expect(results2.length).eq(0);
  });

  it('Should get full view', async () => {
    const termsHash = getHash();
    const contractAmount = parseEther('10');

    let contractDetails = [];
    for (let i = 0; i < 5; ++i) {
      contractDetails[i] = await startNewContract(termsHash, contractAmount);
    }

    await usdt.connect(client).approve(cdjEscrow.address, contractAmount);

    const fullView = await cdjEscrow.connect(client).getFullView(3);

    expect({
      newContractAllowed: fullView.newContractAllowed,
      paymentToken: fullView.paymentToken,
      paymentTokenSymbol: fullView.paymentTokenSymbol,
      paymentTokenAllowance: fullView.paymentTokenAllowance,
      currentContractNo: fullView.currentContractNo.toNumber(),
      fee: fullView.fee.toNumber(),
      holdInterval: fullView.holdInterval.toNumber(),
      devWallet: fullView.devWallet,
      isDisputeResolvers: fullView.isDisputeResolvers,
    }).deep.eq({
      newContractAllowed: true,
      paymentToken: usdt.address,
      paymentTokenSymbol: await usdt.symbol(),
      paymentTokenAllowance: contractAmount,
      currentContractNo: 11116,
      fee: defaultFee,
      holdInterval: 604800,
      devWallet: devWallet.address,
      isDisputeResolvers: false,
    });

    expect(fullView.freelancerContracts.length).eq(0);
    expect(fullView.clientContracts.length).eq(3);

    const fullViewFreelancer = await cdjEscrow.connect(freelancer).getFullView(3);
    expect(fullViewFreelancer.freelancerContracts.length).eq(3);
    expect(fullViewFreelancer.clientContracts.length).eq(0);
  });
});
