import { ethers } from './node_modules/ethers/lib.esm/index.js';

const PRIVATE_KEY = process.env.PRIVATE_KEY;
const p = new ethers.JsonRpcProvider('https://rpc.testnet.arc.network', {name: 'Arc Testnet', chainId: 5042002});
const w = new ethers.Wallet(PRIVATE_KEY, p);
const c = new ethers.Contract('0x79a1C363Afd912212B7581F735a9096fB453F8be', [
  'function cancel(uint256 id) external'
], w);

const tx = await c.cancel(25, {gasPrice: ethers.parseUnits('100','gwei'), gasLimit: 100000});
await tx.wait();
console.log('Cancelled! Hash:', tx.hash);
