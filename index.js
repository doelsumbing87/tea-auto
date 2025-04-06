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

// Utility
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getRandomAmount() {
  const rand = Math.random() * (MAX_AMOUNT - MIN_AMOUNT) + MIN_AMOUNT;
  return parseFloat(rand.toFixed(6)); // 6 desimal presisi
}

function readFileLines(filePath) {
  try {
    return fs.readFileSync(filePath, "utf-8")
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
  } catch (err) {
    console.error(`[❌] Gagal baca file ${filePath}`);
    return [];
  }
}

// Mengambil atau mengupdate jumlah transaksi
function getTransactionCount(walletAddress) {
  let countData = {};
  try {
    countData = JSON.parse(fs.readFileSync(transactionsCountFile, "utf-8"));
  } catch (err) {
    console.warn("[⚠️] Tidak dapat membaca count transaksi sebelumnya.");
  }

  // Reset jika sudah hari baru
  const today = new Date().toISOString().split('T')[0]; // format yyyy-mm-dd
  const lastDate = countData.date || "";
  const todayDate = new Date().toISOString().split('T')[0];

  if (lastDate !== todayDate) {
    countData = { date: todayDate }; // reset count
  }

  if (!countData[walletAddress]) {
    countData[walletAddress] = 0;
  }

  // Update file
  fs.writeFileSync(transactionsCountFile, JSON.stringify(countData, null, 2));
  return countData[walletAddress];
}

function updateTransactionCount(walletAddress, count) {
  let countData = JSON.parse(fs.readFileSync(transactionsCountFile, "utf-8"));
  countData[walletAddress] = count;
  fs.writeFileSync(transactionsCountFile, JSON.stringify(countData, null, 2));
}

async function sendNativeToken(senderPK, recipients, provider) {
  const wallet = new ethers.Wallet(senderPK, provider);

  console.log(`\n[👛] Menggunakan wallet: ${wallet.address}`);

  // Cek dan update count transaksi
  const currentCount = getTransactionCount(wallet.address);
  if (currentCount >= MAX_SEND_PER_DAY) {
    console.log(`[❌] Wallet ${wallet.address} sudah mencapai limit transaksi hari ini (${MAX_SEND_PER_DAY} transaksi).`);
    return; // Jika sudah mencapai limit, hentikan pengiriman
  }

  for (const recipient of recipients) {
    if (!ethers.isAddress(recipient)) {
      console.warn(`[⚠️] Alamat tidak valid, dilewati: ${recipient}`);
      continue;
    }

    const amount = getRandomAmount();
    const amountInWei = ethers.parseUnits(amount.toString(), 18);

    try {
      const tx = await wallet.sendTransaction({
        to: recipient,
        value: amountInWei,
      });

      console.log(
        `[✅] Kirim ${amount} TEA ke ${recipient} | TX: ${BLOCK_EXPLORER_URL}${tx.hash}`
      );

      // Update transaksi count
      const updatedCount = currentCount + 1;
      updateTransactionCount(wallet.address, updatedCount);

    } catch (err) {
      console.error(`[❌] Gagal kirim ke ${recipient}: ${err.message}`);
    }

    await delay(DELAY_MS);

    // Cek ulang jika transaksi sudah mencapai limit setelah delay
    const updatedCount = getTransactionCount(wallet.address);
    if (updatedCount >= MAX_SEND_PER_DAY) {
      console.log(`[❌] Wallet ${wallet.address} sudah mencapai limit transaksi hari ini.`);
      break; // Hentikan kirim jika limit tercapai
    }
  }
}

async function main() {
  const privateKeys = readFileLines(pkFile);
  const recipients = readFileLines(recipientsFile);

  if (privateKeys.length === 0 || recipients.length === 0) {
    console.error("[❌] File pk.txt atau recipients.txt kosong.");
    return;
  }

  const provider = new ethers.JsonRpcProvider(RPC_URL, CHAIN_ID);

  for (const pk of privateKeys) {
    await sendNativeToken(pk, recipients, provider);
  }

  console.log("\n[🏁] Semua transaksi selesai.");
}

main();
