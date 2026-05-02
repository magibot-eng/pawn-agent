{
  "request_id": "pawn-contract-p1-001",
  "project": "pawn-agent",
  "initiator": "arie",
  "authority": "wago-approved",
  "task_type": "implementation",
  "goal": "Phase 1: Deploy BuyoutSettlement contract + wire into backend env",
  "context": "Smart contract BuyoutSettlement.sol is already written at contracts/src/BuyoutSettlement.sol. Forge deploy script exists at contracts/script/DeployBuyoutSettlement.s.sol. Wago confirmed seller-initiates-on-chain flow. Contract must be deployed to Base Sepolia first before anything else can proceed.\n\n\nDecisions from scope doc (projects/pawn-agent/scopes/smart-contract-integration.md):\n- Seller initiates on-chain via dApp (seller connects wallet, approves PAWN to contract, calls acceptOffer themselves)\n- One contract per shop (contract_address stored on Shop model)\n- No meta-tx, no backend token custody\n\nFull scope: projects/pawn-agent/scopes/smart-contract-integration.md",
  "constraints": [
    "Deploy to Base Sepolia testnet only — NOT mainnet",
    "DEPLOYER_PRIVATE_KEY must come from Wago — ask before using",
    "BUYOUT_CONTRACT_ADDRESS env var goes to Railway backend, not frontend",
    "Do NOT touch any other settlement logic yet — only deploy + wire env",
    "All changes committed and pushed before moving to next phase"
  ],
  "approval_class": "external",
  "mutation_allowed": true,
  "expected_output": {
    "format": "markdown",
    "sections": ["summary", "deployed_address", "env_vars_set", "tests", "risks", "next_steps"]
  }
}
