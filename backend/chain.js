// chain.js
// The only file in the backend allowed to hold a private key. Wraps
// InvoiceFactory.registerInvoice/amendCommitment so the rest of the app calls
// registerOnChain(id, commitment) and never touches ethers directly.
//
// Needs: FACTORY_ADDRESS (confirmed identical across chains per README step 6),
// REGISTRAR_PRIVATE_KEY (a funded burner - this key can register commitments,
// nothing more; it never touches settled funds), and one RPC URL per chain
// you want registrations to land on.

const { ethers } = require("ethers");

const FACTORY_ABI = [
    "function registerInvoice(bytes32 invoiceId, bytes32 commitment) external",
    "function amendCommitment(bytes32 invoiceId, bytes32 newCommitment) external",
    "function commitmentOf(bytes32) view returns (bytes32)",
    "function deployAndSweep(bytes32 invoiceId, address token) external returns (uint256)",
    "event InvoiceRegistered(bytes32 indexed invoiceId, bytes32 commitment, address depositAddress)"
];

const FACTORY_ADDRESS = process.env.FACTORY_ADDRESS;
const PRIVATE_KEY = process.env.REGISTRAR_PRIVATE_KEY;

const CHAINS = [
    { name: "polygon", rpc: process.env.POLYGON_RPC_URL }
].filter(c => c.rpc);

let contracts = null;

function initChain() {
    if (contracts) return contracts;
    if (!FACTORY_ADDRESS || !PRIVATE_KEY || CHAINS.length === 0) {
        throw new Error("FACTORY_ADDRESS, REGISTRAR_PRIVATE_KEY, and at least one RPC URL are required.");
    }
    contracts = CHAINS.map(c => {
        const provider = new ethers.JsonRpcProvider(c.rpc);
        const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
        return { name: c.name, contract: new ethers.Contract(FACTORY_ADDRESS, FACTORY_ABI, wallet) };
    });
    return contracts;
}

// Registers the same (invoiceId, commitment) pair on every configured chain.
// Since the factory address and the derivation are identical everywhere,
// this is what makes the deposit address usable on whichever chain the
// payer actually shows up on - registration has to exist on all of them.
async function registerOnChain(invoiceIdString, commitmentHex) {
    const chains = initChain();
    const invoiceIdHash = ethers.keccak256(ethers.toUtf8Bytes(invoiceIdString));

    const results = [];
    for (const { name, contract } of chains) {
        try {
            const existing = await contract.commitmentOf(invoiceIdHash);
            let tx;
            if (existing === ethers.ZeroHash) {
                tx = await contract.registerInvoice(invoiceIdHash, commitmentHex);
            } else if (existing !== commitmentHex) {
                tx = await contract.amendCommitment(invoiceIdHash, commitmentHex);
            } else {
                results.push({ chain: name, skipped: true, reason: "already registered with same commitment" });
                continue;
            }
            const receipt = await tx.wait();
            results.push({ chain: name, txHash: receipt.hash, blockNumber: receipt.blockNumber });
        } catch (err) {
            results.push({ chain: name, error: err.message });
        }
    }

    const failures = results.filter(result => result.error);
    if (failures.length && process.env.NODE_ENV === "production" && process.env.ALLOW_PARTIAL_CHAIN_REGISTRATION !== "true") {
        throw new Error(`chain registration failed: ${failures.map(f => `${f.chain}: ${f.error}`).join("; ")}`);
    }
    return {
        registered: results.length > 0 && failures.length === 0,
        invoiceIdHash,
        commitment: commitmentHex,
        results
    };
}

async function sweepOnChain(invoiceIdString, chainName, tokenAddress) {
    const selected = initChain().find(c => c.name === chainName);
    if (!selected) throw new Error("unsupported chain");
    const invoiceIdHash = ethers.keccak256(ethers.toUtf8Bytes(invoiceIdString));
    const tx = await selected.contract.deployAndSweep(invoiceIdHash, tokenAddress);
    const receipt = await tx.wait();
    return { chain: chainName, txHash: receipt.hash, blockNumber: receipt.blockNumber };
}

module.exports = { registerOnChain, sweepOnChain };
