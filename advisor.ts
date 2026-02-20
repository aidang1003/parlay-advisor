
import { ethers } from "ethers";
import { createZGComputeNetworkBroker } from "@0glabs/0g-serving-broker";
import { OpenAI } from "openai";
import * as dotenv from 'dotenv';
dotenv.config();

async function main() {
    // 1. Initialize broker with your wallet
    const provider = new ethers.JsonRpcProvider("https://evmrpc-testnet.0g.ai");
    const wallet = new ethers.Wallet(process.env.PRIVATE_KEY!, provider);
    const broker = await createZGComputeNetworkBroker(wallet);

    // 2. Fund your account (one-time, minimum 4 OG for v0.6.x)
    // Create ledger account if it doesn't exist yet (one-time setup)

    try {
        const ledger = await broker.ledger.getLedger();
        console.log("Ledger account already exists:", ledger);
    } catch {
        console.log("Creating ledger account with 4 A0GI...");
        await broker.ledger.addLedger(4);
        console.log("Ledger account created!");
    }

    // 3. Discover available AI services
    const services = await broker.inference.listService();
    console.log("Available models:");
    services.forEach((s) => {
        console.log(`  ${s.model} — provider: ${s.provider} — type: ${s.serviceType}`);
        console.log(`    input: ${s.inputPrice}, output: ${s.outputPrice}, verifiable: ${s.verifiability}`);
    });

    // 4. Pick a provider and acknowledge them (one-time per provider)
    const chosen = services.find((s) => s.model.includes("qwen-2.5-7b-instruct")); // or pick any
    console.log("Chose model.provider:", chosen.provider);
    if (!chosen) throw new Error("No suitable service found");

    const ledger = await broker.ledger.getLedger();
    const ledgerBalance = BigInt(ledger[2]);
    console.log("Ledger Balance:", ledger[2]);
    const maxLedgerBalance = BigInt(4000000000000000000);
    if (ledgerBalance < maxLedgerBalance) {
        await broker.ledger.depositFund(1); // May need to deposit funds
    } else {
        console.log("Don't need to fund the ledger");
    }



    const providerAddress = chosen.provider;
    try {
        await broker.inference.acknowledgeProviderSigner(providerAddress);
        console.log("Provider acknowledged successfully");
    } catch (e) {
        console.error("Failed to acknowledge provider:", e);
    }

    // 5. Send an inference request (OpenAI-compatible API)
    const question = "Given the Polymarket at https://polymarket.com/sports/nba/nba-hou-cha-2026-02-19 research which bet has the best risk-adjusted value. Answer as concisely as possible. Format your answer in this dictionary {bet:'only the bet', reason:'give the reason here', confidence:'percent confidenc in the result'}";
    const { endpoint, model } = await broker.inference.getServiceMetadata(providerAddress);
    const headers = await broker.inference.getRequestHeaders(providerAddress, question);


    const openai = new OpenAI({
        baseURL: endpoint,
        apiKey: "", // not needed, auth is via 0G headers
        defaultHeaders: { ...headers },
    });

    const response = await openai.chat.completions.create(
        {
            model: model,
            messages: [
                { role: 'user', content: question },
            ],
        }
    );

    const content = response.choices[0].message.content!;
    const chatID = response.id;

    // 6. Verify the response (settles fees + verifies TEE signature)
    const valid = await broker.inference.processResponse(providerAddress, chatID, content);
    console.log(`Response valid: ${valid}`);
    console.log(`AI says: ${content}`);
}

main();