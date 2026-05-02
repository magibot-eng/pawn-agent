# PAWN Token Deploy Next Steps

Generated local Base Sepolia deployer wallet:

- Address: `0xAc052AbB0C2F6cc1f59414B659050561DbA83e65`
- RPC: `https://sepolia.base.org`
- Env file: `contracts/.env`

## Before deploy
Fund the deployer wallet with a small amount of Base Sepolia ETH from a faucet.

## Deploy command
```bash
cd ~/Desktop/Mira/projects/pawn-agent/contracts
source ~/.zshenv
set -a
source .env
set +a
forge script script/DeployPawnToken.s.sol --rpc-url "$BASE_SEPOLIA_RPC_URL" --broadcast
```

## After deploy
Copy the deployed token address into:
- `frontend/.env.local` as `NEXT_PUBLIC_PAWN_TOKEN_ADDRESS=<address>`

Then rebuild/redeploy frontend.
