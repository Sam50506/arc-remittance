import fs from 'fs';
import path from 'path';
import solc from 'solc';
import { ethers } from 'ethers';

const CONTRACT_PATH = path.resolve('./contracts/ScheduledPayment.sol');
const source = fs.readFileSync(CONTRACT_PATH, 'utf8');

function findImports(importPath) {
  const roots = [
    path.resolve('node_modules'),
    path.resolve('../node_modules'),
  ];
  for (const root of roots) {
    const candidate = path.resolve(root, importPath);
    if (!candidate.startsWith(root + path.sep)) continue; // block path traversal outside node_modules
    if (fs.existsSync(candidate)) return { contents: fs.readFileSync(candidate, 'utf8') };
  }
  return { error: 'File not found: ' + importPath };
}

const input = {
  language: 'Solidity',
  sources: { 'ScheduledPayment.sol': { content: source } },
  settings: {
    optimizer: { enabled: true, runs: 200 },
    outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object'] } }
  }
};

console.log('Compiling...');
const output = JSON.parse(solc.compile(JSON.stringify(input), { import: findImports }));

if (output.errors) {
  const fatal = output.errors.filter(e => e.severity === 'error');
  output.errors.forEach(e => console.log(e.formattedMessage));
  if (fatal.length) { console.error('Compilation failed.'); process.exit(1); }
}

const out = output.contracts['ScheduledPayment.sol']['ScheduledPayment'];
const abi = out.abi;
const bytecode = '0x' + out.evm.bytecode.object;

fs.writeFileSync('./ScheduledPayment.abi.json', JSON.stringify(abi, null, 2));
fs.writeFileSync('./ScheduledPayment.bytecode.txt', bytecode);
console.log('Compiled OK. ABI + bytecode saved to disk.');

const PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY;
if (!PRIVATE_KEY) {
  console.log('\nNo DEPLOYER_PRIVATE_KEY set — compiled only, did not deploy.');
  console.log('Rerun as: DEPLOYER_PRIVATE_KEY=0xyourkey node deploy-ethers.mjs');
  process.exit(0);
}

const RPC = 'https://rpc.testnet.arc.network';
const provider = new ethers.JsonRpcProvider(RPC, { name: 'Arc Testnet', chainId: 5042002 });
const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

console.log('Deploying from:', wallet.address);

const factory = new ethers.ContractFactory(abi, bytecode, wallet);
const initialExecutor = '0xeE8BFA4ad53bE3e52B6e293136eebbc49244e146';

const contract = await factory.deploy(initialExecutor, {
  gasPrice: ethers.parseUnits('100', 'gwei'),
  gasLimit: 3000000
});

console.log('Tx sent:', contract.deploymentTransaction().hash);
console.log('Waiting for confirmation...');
await contract.waitForDeployment();

const address = await contract.getAddress();
console.log('\n✅ Deployed at:', address);
