const { ethers } = require("ethers");
const fs = require("fs");

const RPC_URL = "https://tea-sepolia.g.alchemy.com/public";
const CHAIN_ID = 10218;
const BLOCK_EXPLORER_URL = "https://sepolia.tea.xyz/tx/";

const DELAY_MS = 5000;
const MIN_AMOUNT = 0.001;
const MAX_AMOUNT = 0.0013;
const MAX_SEND_PER_DAY = 120;

const pkFile = "pk.txt";
const recipientsFile = "recipients.txt";
const transactionsCountFile = "transactions_count.json";

// Utility functions
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getRandomAmount() {
  const rand = Math.random() * (MAX_AMOUNT - MIN_AMOUNT) + MIN_AMOUNT;
  return parseFloat(rand.toFixed(6)); // 6 decimal places
}

function getRandomDelay() {
  // Random delay between 3-10 seconds
  return Math.floor(Math.random() * (10000 - 3000 + 1)) + 3000;
}

function readFileLines(filePath) {
  try {
    return fs.readFileSync(filePath, "utf-8")
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
  } catch (err) {
    console.error(`[❌] Failed to read file ${filePath}`);
    return [];
  }
}

// Get or update transaction count for each wallet
function getTransactionCount(walletAddress) {
  let countData = {};
  try {
    countData = JSON.parse(fs.readFileSync(transactionsCountFile, "utf-8"));
  } catch (err) {
    console.warn("[⚠️] Unable to read previous transaction counts.");
  }

  const today = new Date().toISOString().split('T')[0]; // format yyyy-mm-dd
  const lastDate = countData.date || "";
  const todayDate = new Date().toISOString().split('T')[0];

  if (lastDate !== todayDate) {
    countData = { date: todayDate }; // reset count for new day
  }

  if (!countData[walletAddress]) {
    countData[walletAddress] = 0;
  }

  // Save the count data
  fs.writeFileSync(transactionsCountFile, JSON.stringify(countData, null, 2));
  return countData[walletAddress];
}

function updateTransactionCount(walletAddress, count) {
  let countData = JSON.parse(fs.readFileSync(transactionsCountFile, "utf-8"));
  countData[walletAddress] = count;
  fs.writeFileSync(transactionsCountFile, JSON.stringify(countData, null, 2));
}

// Function to send native token (TEA) to recipients
async function sendNativeToken(senderPK, recipients, provider) {
  const wallet = new ethers.Wallet(senderPK, provider);

  console.log(`\n[👛] Using wallet: ${wallet.address}`);

  // Check and update transaction count
  const currentCount = getTransactionCount(wallet.address);
  if (currentCount >= MAX_SEND_PER_DAY) {
    console.log(`[❌] Wallet ${wallet.address} has reached the transaction limit for today (${MAX_SEND_PER_DAY} transactions).`);
    return; // Stop sending if transaction limit is reached
  }

  for (const recipient of recipients) {
    if (!ethers.isAddress(recipient)) {
      console.warn(`[⚠️] Invalid address, skipping: ${recipient}`);
      continue;
    }

    const amount = getRandomAmount();
    const amountInWei = ethers.parseUnits(amount.toString(), 18);

    try {
      const tx = await wallet.sendTransaction({
        to: recipient,
        value: amountInWei,
      });

      console.log(`[✅] Sent ${amount} TEA to ${recipient} | TX: ${BLOCK_EXPLORER_URL}${tx.hash}`);

      // Update transaction count
      const updatedCount = currentCount + 1;
      updateTransactionCount(wallet.address, updatedCount);

    } catch (err) {
      console.error(`[❌] Failed to send to ${recipient}: ${err.message}`);
    }

    // Apply random delay between transactions
    const randomDelay = getRandomDelay();
    await delay(randomDelay); // Delay between 3s to 10s

    // Check if transaction limit is reached after delay
    const updatedCount = getTransactionCount(wallet.address);
    if (updatedCount >= MAX_SEND_PER_DAY) {
      console.log(`[❌] Wallet ${wallet.address} has reached the transaction limit for today.`);
      break;
    }
  }
}

async function main() {
  const privateKeys = readFileLines(pkFile);
  const recipients = readFileLines(recipientsFile);

  if (privateKeys.length === 0 || recipients.length === 0) {
    console.error("[❌] pk.txt or recipients.txt is empty.");
    return;
  }

  const provider = new ethers.JsonRpcProvider(RPC_URL, CHAIN_ID);

  // Process each wallet in parallel
  const walletPromises = privateKeys.map(async (pk) => {
    await sendNativeToken(pk, recipients, provider);
  });

  // Wait for all transactions to be completed
  await Promise.all(walletPromises);

  console.log("\n[🏁] All transactions completed.");
}

main();
