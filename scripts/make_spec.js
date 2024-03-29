const fs = require('fs');
const path = require('path');
const Web3 = require('web3');
const web3 = new Web3();
const utils = require('./utils/utils');

const VALIDATOR_SET_CONTRACT = '0x1000000000000000000000000000000000000001';
const BLOCK_REWARD_CONTRACT = '0x2000000000000000000000000000000000000001';
const RANDOM_CONTRACT = '0x3000000000000000000000000000000000000001';
const STAKING_CONTRACT = '0x1100000000000000000000000000000000000001';
const PERMISSION_CONTRACT = '0x4000000000000000000000000000000000000001';
const CERTIFIER_CONTRACT = '0x5000000000000000000000000000000000000001';
const GOVERNANCE_CONTRACT = '0x6100000000000000000000000000000000000001';

main();

async function main() {
  const networkName = process.env.NETWORK_NAME;
  const networkID = process.env.NETWORK_ID;
  const owner = process.env.OWNER.trim();
  let initialValidators = process.env.INITIAL_VALIDATORS.split(',');
  for (let i = 0; i < initialValidators.length; i++) {
    initialValidators[i] = initialValidators[i].trim();
  }
  let stakingAddresses = process.env.STAKING_ADDRESSES.split(',');
  for (let i = 0; i < stakingAddresses.length; i++) {
    stakingAddresses[i] = stakingAddresses[i].trim();
  }
  const firstValidatorIsUnremovable = process.env.FIRST_VALIDATOR_IS_UNREMOVABLE === 'true';
  const stakingEpochDuration = process.env.STAKING_EPOCH_DURATION;
  const stakeWithdrawDisallowPeriod = process.env.STAKE_WITHDRAW_DISALLOW_PERIOD;
  const collectRoundLength = process.env.COLLECT_ROUND_LENGTH;
  const erc20Restricted = process.env.ERC20_RESTRICTED === 'true';
  const isTestnet = process.env.IS_TESTNET === 'true';
  const delegatorMinStake = process.env.DELEGATOR_MIN_STAKE;
  const candidateMinStake = process.env.CANDIDATE_MIN_STAKE;
  const ownerBalance = process.env.OWNER_BALANCE;

  const txPriorityContractName = isTestnet ? 'TxPriority' : 'TxPriorityMock';
  const contracts = [
    'AdminUpgradeabilityProxy',
    'BlockRewardAuRa',
    'Certifier',
    'Governance',
    'InitializerAuRa',
    'RandomAuRa',
    'Registry',
    'StakingAuRa',
    'TxPermission',
    txPriorityContractName,
    'ValidatorSetAuRa',
  ];

  let spec = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'templates', 'spec.json'), 'UTF-8'));

  spec.name = networkName;
  spec.params.networkID = networkID;

  let contractsCompiled = {};
  for (let i = 0; i < contracts.length; i++) {
    const contractName = contracts[i];
    let realContractName = contractName;
    let dir = 'contracts/';

    if (contractName == 'AdminUpgradeabilityProxy') {
      dir = 'contracts/upgradeability/';
    } else if (contractName == 'TxPriorityMock') {
      dir = 'contracts/mock/';
    } else if (contractName == 'StakingAuRa' && erc20Restricted) {
      realContractName = 'StakingAuRaCoins';
      dir = 'contracts/base/';
    } else if (contractName == 'BlockRewardAuRa' && erc20Restricted) {
      realContractName = 'BlockRewardAuRaCoins';
      dir = 'contracts/base/';
    }

    console.log(`Compiling ${contractName}...`);
    const compiled = await compile(
      path.join(__dirname, '..', dir),
      realContractName
    );
    contractsCompiled[contractName] = compiled;
  }

  const storageProxyCompiled = contractsCompiled['AdminUpgradeabilityProxy'];
  let contract = new web3.eth.Contract(storageProxyCompiled.abi);
  let deploy;

  // Build ValidatorSetAuRa contract
  deploy = await contract.deploy({data: '0x' + storageProxyCompiled.bytecode, arguments: [
    '0x1000000000000000000000000000000000000000', // implementation address
    owner
  ]});
  spec.engine.authorityRound.params.validators.multi = {
    "0": {
      "contract": VALIDATOR_SET_CONTRACT
    }
  };
  spec.accounts[VALIDATOR_SET_CONTRACT] = {
    balance: '0',
    constructor: await deploy.encodeABI()
  };
  spec.accounts['0x1000000000000000000000000000000000000000'] = {
    balance: '0',
    constructor: '0x' + contractsCompiled['ValidatorSetAuRa'].bytecode
  };

  // Build StakingAuRa contract
  deploy = await contract.deploy({data: '0x' + storageProxyCompiled.bytecode, arguments: [
    '0x1100000000000000000000000000000000000000', // implementation address
    owner
  ]});
  spec.accounts[STAKING_CONTRACT] = {
    balance: '0',
    constructor: await deploy.encodeABI()
  };
  spec.accounts['0x1100000000000000000000000000000000000000'] = {
    balance: '0',
    constructor: '0x' + contractsCompiled['StakingAuRa'].bytecode
  };

  // Build BlockRewardAuRa contract
  deploy = await contract.deploy({data: '0x' + storageProxyCompiled.bytecode, arguments: [
    '0x2000000000000000000000000000000000000000', // implementation address
    owner
  ]});
  spec.accounts[BLOCK_REWARD_CONTRACT] = {
    balance: '0',
    constructor: await deploy.encodeABI()
  };
  spec.engine.authorityRound.params.blockRewardContractAddress = BLOCK_REWARD_CONTRACT;
  spec.engine.authorityRound.params.blockRewardContractTransition = 0;
  spec.accounts['0x2000000000000000000000000000000000000000'] = {
    balance: '0',
    constructor: '0x' + contractsCompiled['BlockRewardAuRa'].bytecode
  };

  // Build RandomAuRa contract
  deploy = await contract.deploy({data: '0x' + storageProxyCompiled.bytecode, arguments: [
    '0x3000000000000000000000000000000000000000', // implementation address
    owner
  ]});
  spec.accounts[RANDOM_CONTRACT] = {
    balance: '0',
    constructor: await deploy.encodeABI()
  };
  spec.accounts['0x3000000000000000000000000000000000000000'] = {
    balance: '0',
    constructor: '0x' + contractsCompiled['RandomAuRa'].bytecode
  };
  spec.engine.authorityRound.params.randomnessContractAddress[0] = RANDOM_CONTRACT;

  // Build TxPermission contract
  deploy = await contract.deploy({data: '0x' + storageProxyCompiled.bytecode, arguments: [
    '0x4000000000000000000000000000000000000000', // implementation address
    owner
  ]});
  spec.accounts[PERMISSION_CONTRACT] = {
    balance: '0',
    constructor: await deploy.encodeABI()
  };
  spec.params.transactionPermissionContract = PERMISSION_CONTRACT;
  spec.accounts['0x4000000000000000000000000000000000000000'] = {
    balance: '0',
    constructor: '0x' + contractsCompiled['TxPermission'].bytecode
  };

  // Build TxPriority contract
  const txPriorityContract = new web3.eth.Contract(contractsCompiled[txPriorityContractName].abi);
  deploy = await txPriorityContract.deploy({
    data: '0x' + contractsCompiled[txPriorityContractName].bytecode,
    arguments: isTestnet ? [owner] : [owner, true]
  });
  const txPriorityContractItem = {
    balance: '0',
    constructor: await deploy.encodeABI()
  };
  spec.accounts['0x4100000000000000000000000000000000000000'] = txPriorityContractItem;

  // Build Certifier contract
  deploy = await contract.deploy({data: '0x' + storageProxyCompiled.bytecode, arguments: [
    '0x5000000000000000000000000000000000000000', // implementation address
    owner
  ]});
  spec.accounts[CERTIFIER_CONTRACT] = {
    balance: '0',
    constructor: await deploy.encodeABI()
  };
  spec.accounts['0x5000000000000000000000000000000000000000'] = {
    balance: '0',
    constructor: '0x' + contractsCompiled['Certifier'].bytecode
  };

  // Build Governance contract
  deploy = await contract.deploy({data: '0x' + storageProxyCompiled.bytecode, arguments: [
    '0x6100000000000000000000000000000000000000', // implementation address
    owner
  ]});
  spec.accounts[GOVERNANCE_CONTRACT] = {
    balance: '0',
    constructor: await deploy.encodeABI()
  };
  spec.accounts['0x6100000000000000000000000000000000000000'] = {
    balance: '0',
    constructor: '0x' + contractsCompiled['Governance'].bytecode
  };

  // Build Registry contract
  contract = new web3.eth.Contract(contractsCompiled['Registry'].abi);
  deploy = await contract.deploy({data: '0x' + contractsCompiled['Registry'].bytecode, arguments: [
    CERTIFIER_CONTRACT,
    owner
  ]});
  spec.accounts['0x6000000000000000000000000000000000000000'] = {
    balance: '0',
    constructor: await deploy.encodeABI()
  };
  spec.params.registrar = '0x6000000000000000000000000000000000000000';

  // Build InitializerAuRa contract
  contract = new web3.eth.Contract(contractsCompiled['InitializerAuRa'].abi);
  deploy = await contract.deploy({data: '0x' + contractsCompiled['InitializerAuRa'].bytecode, arguments: [
    [ // _contracts
      VALIDATOR_SET_CONTRACT,
      BLOCK_REWARD_CONTRACT,
      RANDOM_CONTRACT,
      STAKING_CONTRACT,
      PERMISSION_CONTRACT,
      CERTIFIER_CONTRACT,
      GOVERNANCE_CONTRACT
    ],
    owner, // _owner
    initialValidators, // _miningAddresses
    stakingAddresses, // _stakingAddresses
    firstValidatorIsUnremovable, // _firstValidatorIsUnremovable
    web3.utils.toWei(delegatorMinStake || '1000'), // _delegatorMinStake
    web3.utils.toWei(candidateMinStake || '20000'), // _candidateMinStake
    stakingEpochDuration, // _stakingEpochDuration
    0, // _stakingEpochStartBlock
    stakeWithdrawDisallowPeriod, // _stakeWithdrawDisallowPeriod
    collectRoundLength // _collectRoundLength
  ]});
  spec.accounts['0x7000000000000000000000000000000000000000'] = {
    balance: '0',
    constructor: await deploy.encodeABI()
  };

  if (ownerBalance) {
    spec.accounts[owner] = {
      balance: web3.utils.toWei(ownerBalance)
    };
  }

  console.log('Saving spec.json file ...');
  fs.writeFileSync(path.join(__dirname, '..', 'spec.json'), JSON.stringify(spec, null, '  '), 'UTF-8');
  console.log('Done');
}

async function compile(dir, contractName) {
  upgradeableContracts = [
    "ValidatorSetAuRa", 
    "BlockRewardAuRa", 
    "RandomAuRa", 
    "StakingAuRa", 
    "TxPermission", 
    "Certifier", 
    "Governance"
  ]

  let compiled = {}

  if (!upgradeableContracts.includes(contractName)) {
    compiled = await utils.compile(dir, contractName);
    return {abi: compiled.abi, bytecode: compiled.evm.bytecode.object};
  }
  compiled = JSON.parse(fs.readFileSync(path.join(
    'upgradeable-artifacts/' + contractName + '.json'
  ), 'UTF-8'));
  return {abi: compiled.abi, bytecode: compiled.bytecode.substring(2)};
}

// NETWORK_NAME=DPoSChain NETWORK_ID=101 OWNER=0x1092a1E3A3F2FB2024830Dd12064a4B33fF8EbAe INITIAL_VALIDATORS=0xeE385a1df869A468883107B0C06fA8791b28A04f,0x71385ae87c4b93db96f02f952be1f7a63f6057a6,0x190ec582090ae24284989af812f6b2c93f768ecd STAKING_ADDRESSES=0xe5aa2949ac94896bb2c5c75d9d5a88eb9f7c6b59,0x63a9344ae66c1f26d400b3ea4750a709c3aa6cfa,0xa5f6858d6254329a67cddab2dc04d795c5257709 STAKING_EPOCH_DURATION=120954 STAKE_WITHDRAW_DISALLOW_PERIOD=4320 COLLECT_ROUND_LENGTH=114 FIRST_VALIDATOR_IS_UNREMOVABLE=true ERC20_RESTRICTED=false node scripts/make_spec.js
