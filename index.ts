import { FlashbotsBundleProvider } from '@flashbots/ethers-provider-bundle'
import SafeApiKit from '@safe-global/api-kit'
import Safe from '@safe-global/protocol-kit'
import dotenv from 'dotenv'
import { isAddress, JsonRpcProvider, Wallet } from 'ethers'

dotenv.config()

const NETWORK_ID = BigInt(process.env.NETWORK_ID as string)
const PRIVATE_KEY = process.env.PRIVATE_KEY as string
const RPC_URL = process.env.RPC_URL as string
const SAFE_ADDRESS = process.env.SAFE_ADDRESS as string
const DONT_USE_FLASHBOTS = !!process.env.DONT_USE_FLASHBOTS

if (NETWORK_ID !== 1n && NETWORK_ID !== 11155111n) {
  throw new Error('Unsupported network id')
} else if (!PRIVATE_KEY) {
  throw new Error('Invalid private key')
} else if (!RPC_URL) {
  throw new Error('Invalid RPC URL')
} else if (!SAFE_ADDRESS || !isAddress(SAFE_ADDRESS)) {
  throw new Error('Invalid safe address')
}

if (DONT_USE_FLASHBOTS) {
  console.info('Not using Flashbots')
}

async function main() {
  const provider = new JsonRpcProvider(RPC_URL, NETWORK_ID)
  const signer = new Wallet(PRIVATE_KEY).connect(provider)

  const flashbotsUrl = NETWORK_ID === 1n ? 'https://relay.flashbots.net' : 'https://relay-sepolia.flashbots.net'
  const flashbotsProvider = await FlashbotsBundleProvider.create(provider, signer, flashbotsUrl)

  const protocolKit = await Safe.init({
    provider: RPC_URL,
    signer: PRIVATE_KEY,
    safeAddress: SAFE_ADDRESS,
  })

  const apiKit = new SafeApiKit({ chainId: NETWORK_ID })
  const pendingTransactions = (await apiKit.getPendingTransactions(SAFE_ADDRESS)).results

  if (!pendingTransactions.length) {
    console.info('There are no pending transactions')
  } else {
    console.info(`There are ${pendingTransactions.length} pending transactions`)
  }

  for (let i = 0; i < pendingTransactions.length; i++) {
    const pendingTx = pendingTransactions[i]
    const tx = await protocolKit.signTransaction(pendingTx)
    const data = await protocolKit.getEncodedTransaction(tx)

    const transaction = { data, to: SAFE_ADDRESS }
    const populatedTransaction = await signer.populateTransaction(transaction)
    const signedTransaction = await signer.signTransaction(populatedTransaction)

    if (DONT_USE_FLASHBOTS) {
      const executeTxResponse = await protocolKit.executeTransaction(tx)
      console.info('Safe execute response:', executeTxResponse)
    } else {
      const response = await flashbotsProvider.sendPrivateTransaction({ signedTransaction })
      console.info('Flashbots private transaction response:', response)
    }
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
