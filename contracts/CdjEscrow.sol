// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import 'hardhat/console.sol';
import '@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol';
import '@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol';
import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@openzeppelin/contracts/token/ERC20/ERC20.sol';

/// @title CdjEscrow
/// @author EresDev
contract CdjEscrow is Initializable, OwnableUpgradeable {
  bool public newContractAllowed;
  address public paymentToken;
  uint256 public currentContractNo;
  uint256 public fee;
  uint256 public holdInterval;
  address public devWallet;

  mapping(address => uint256[]) public freelancerContracts;
  mapping(address => uint256[]) public clientContracts;
  mapping(uint256 => ContractDetail) public contractDetails;

  mapping(address => bool) public disputeResolvers;

  event ContractStarted(
    uint256 indexed contractNo,
    address freelancer,
    address client,
    uint256 amount
  );

  event ContractCloseInitiated(
    uint256 indexed contractNo,
    address freelancer,
    address client,
    uint256 closeTime
  );

  event ContractClosed(
    uint256 indexed contractNo,
    address freelancer,
    address client,
    uint256 closeTime,
    uint256 amountAfterFee,
    uint256 fee
  );

  event DisputeStarted(
    uint256 indexed contractNo,
    string freelancerOrClient,
    address freelancer,
    address client
  );

  event DisputeResolved(
    uint256 indexed contractNo,
    address resolver,
    address freelancer,
    address client,
    uint256 clientAmount,
    uint256 freelancerAmount,
    uint256 fee
  );

  enum ContractStatus {
    STARTED,
    COMPLETE_INITIATED,
    COMPLETED,
    IN_DISPUTE,
    DISPUTE_RESOLVED
  }

  struct ContractDetail {
    uint256 contractNo;
    address freelancer;
    address client;
    bytes32 termsHash;
    uint256 startTime;
    ContractStatus status;
    uint256 amount;
    uint256 fee; // per thousand
    uint256 completionTime;
  }

  modifier onlyDisputeResolver() {
    require(disputeResolvers[_msgSender()] == true, 'Only dispute resolver allowed');
    _;
  }

  function initialize(address _paymentToken, address _devWallet) public initializer {
    __Ownable_init();

    paymentToken = _paymentToken;
    devWallet = _devWallet;
    disputeResolvers[_msgSender()] = true;

    newContractAllowed = true;
    currentContractNo = 11111;
    fee = 100; // per ten thousand
    holdInterval = 7 days;
  }

  /// @notice must be called by client because _msgSender() is stored as client
  function startContract(
    address freelancer,
    bytes32 termsHash,
    uint256 paymentAmount
  ) external {
    require(newContractAllowed, 'Contract is on pause');
    require(paymentAmount >= 1e18, 'Min pay amount 1 required');

    uint256 balanceBefore = IERC20(paymentToken).balanceOf(address(this));
    IERC20(paymentToken).transferFrom(_msgSender(), address(this), paymentAmount);
    uint256 balanceAfter = IERC20(paymentToken).balanceOf(address(this));
    require(balanceBefore + paymentAmount == balanceAfter, 'Unable to receive payment');

    ++currentContractNo;

    contractDetails[currentContractNo] = ContractDetail(
      currentContractNo,
      freelancer,
      _msgSender(),
      termsHash,
      block.timestamp,
      ContractStatus.STARTED,
      paymentAmount,
      fee,
      0
    );

    freelancerContracts[freelancer].push(currentContractNo);
    clientContracts[_msgSender()].push(currentContractNo);

    emit ContractStarted(currentContractNo, freelancer, _msgSender(), paymentAmount);
  }

  /// @notice must be called by client
  function initiateComplete(uint256 contractNo) external {
    require(_msgSender() == contractDetails[contractNo].client, 'Only client can close');
    require(
      contractDetails[contractNo].status == ContractStatus.STARTED,
      'Not available for closing'
    );

    contractDetails[contractNo].status = ContractStatus.COMPLETE_INITIATED;
    contractDetails[contractNo].completionTime = block.timestamp + holdInterval;

    emit ContractCloseInitiated(
      contractNo,
      contractDetails[contractNo].freelancer,
      contractDetails[contractNo].client,
      contractDetails[contractNo].completionTime
    );
  }

  /// @notice must be called by freelancer
  function claimPayment(uint256 contractNo) external {
    require(_msgSender() == contractDetails[contractNo].freelancer, 'Only freelancer can claim');
    require(
      contractDetails[contractNo].status == ContractStatus.COMPLETE_INITIATED,
      'Not available for claim'
    );
    require(contractDetails[contractNo].completionTime < block.timestamp, 'Too early to claim');

    contractDetails[contractNo].status = ContractStatus.COMPLETED;

    uint256 feeAmount = (contractDetails[contractNo].amount * contractDetails[contractNo].fee) /
      10000;
    uint256 freelancerAmount = contractDetails[contractNo].amount - feeAmount;

    if (feeAmount > 0) {
      IERC20(paymentToken).transfer(devWallet, feeAmount);
    }

    if (freelancerAmount > 0) {
      IERC20(paymentToken).transfer(contractDetails[contractNo].freelancer, freelancerAmount);
    }

    emit ContractClosed(
      contractNo,
      contractDetails[contractNo].freelancer,
      contractDetails[contractNo].client,
      contractDetails[contractNo].completionTime,
      freelancerAmount,
      feeAmount
    );
  }

  /// @notice must be called by freelancer or client
  function startDispute(uint256 contractNo) external {
    if (_msgSender() == contractDetails[contractNo].client) {
      require(
        contractDetails[contractNo].status == ContractStatus.STARTED ||
          contractDetails[contractNo].status == ContractStatus.COMPLETE_INITIATED,
        'Cannot dispute this contract'
      );
    } else if (_msgSender() == contractDetails[contractNo].freelancer) {
      require(
        contractDetails[contractNo].status == ContractStatus.STARTED,
        'Cannot dispute this contract'
      );
    } else {
      revert('Not allowed');
    }

    contractDetails[contractNo].status = ContractStatus.IN_DISPUTE;

    emit DisputeStarted(
      contractNo,
      _msgSender() == contractDetails[contractNo].freelancer ? 'freelancer' : 'client',
      contractDetails[contractNo].freelancer,
      contractDetails[contractNo].client
    );
  }

  /// @notice You specify clientShare only, because rest is given to freelancer
  function resolveDispute(uint256 contractNo, uint256 freelancerAmount)
    external
    onlyDisputeResolver
  {
    require(contractDetails[contractNo].status == ContractStatus.IN_DISPUTE, 'Not in dispute');

    uint256 feeAmount = (contractDetails[contractNo].amount * contractDetails[contractNo].fee) /
      10000;

    require(
      feeAmount + freelancerAmount <= contractDetails[contractNo].amount,
      'Freelancer amount too much'
    );

    uint256 clientAmount = (contractDetails[contractNo].amount - feeAmount) - freelancerAmount;

    contractDetails[contractNo].status = ContractStatus.DISPUTE_RESOLVED;

    if (feeAmount > 0) {
      IERC20(paymentToken).transfer(devWallet, feeAmount);
    }

    if (clientAmount > 0) {
      IERC20(paymentToken).transfer(contractDetails[contractNo].client, clientAmount);
    }

    if (freelancerAmount > 0) {
      IERC20(paymentToken).transfer(contractDetails[contractNo].freelancer, freelancerAmount);
    }

    emit DisputeResolved(
      contractNo,
      _msgSender(),
      contractDetails[contractNo].freelancer,
      contractDetails[contractNo].client,
      clientAmount,
      freelancerAmount,
      feeAmount
    );
  }

  function setDisputeResolver(address _wallet, bool canResolve) external onlyOwner {
    disputeResolvers[_wallet] = canResolve;
  }

  function setPaymentToken(address _paymentToken) external onlyOwner {
    paymentToken = _paymentToken;
  }

  function toggleNewContractAllowed() external onlyOwner {
    newContractAllowed = !newContractAllowed;
  }

  function setFee(uint256 perTenThousand) external onlyOwner {
    fee = perTenThousand;
  }

  function setHoldInterval(uint256 _seconds) external onlyOwner {
    holdInterval = _seconds;
  }

  function setDevWallet(address _wallet) external onlyOwner {
    devWallet = _wallet;
  }

  // getters
  function getRecentContractByClient(address _client, uint256 noOfContracts)
    public
    view
    returns (ContractDetail[] memory)
  {
    uint256 totalContracts = clientContracts[_client].length;
    uint256 noToRetrieve = noOfContracts < totalContracts ? noOfContracts : totalContracts;

    ContractDetail[] memory _contractDetails = new ContractDetail[](noToRetrieve);
    for (uint256 i = 0; i < noToRetrieve; ++i) {
      _contractDetails[i] = contractDetails[clientContracts[_client][totalContracts - 1 - i]];
    }

    return _contractDetails;
  }

  function getRecentContractByFreelancer(address _freelancer, uint256 noOfContracts)
    public
    view
    returns (ContractDetail[] memory)
  {
    uint256 totalContracts = freelancerContracts[_freelancer].length;
    uint256 noToRetrieve = noOfContracts < totalContracts ? noOfContracts : totalContracts;

    ContractDetail[] memory _contractDetails = new ContractDetail[](noToRetrieve);
    for (uint256 i = 0; i < noToRetrieve; ++i) {
      _contractDetails[i] = contractDetails[
        freelancerContracts[_freelancer][totalContracts - 1 - i]
      ];
    }

    return _contractDetails;
  }

  struct FullView {
    bool newContractAllowed;
    address paymentToken;
    string paymentTokenSymbol;
    uint256 paymentTokenAllowance;
    uint256 currentContractNo;
    uint256 fee;
    uint256 holdInterval;
    address devWallet;
    bool isDisputeResolvers;
    ContractDetail[] freelancerContracts;
    ContractDetail[] clientContracts;
  }

  function getFullView(uint256 noOfContracts) external view returns (FullView memory) {
    return
      FullView(
        newContractAllowed,
        paymentToken,
        ERC20(paymentToken).symbol(),
        IERC20(paymentToken).allowance(_msgSender(), address(this)),
        currentContractNo,
        fee,
        holdInterval,
        devWallet,
        disputeResolvers[_msgSender()],
        getRecentContractByFreelancer(_msgSender(), noOfContracts),
        getRecentContractByClient(_msgSender(), noOfContracts)
      );
  }
}
