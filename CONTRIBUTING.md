# Contributing to Pawn Agent

## Foundry / Contract Development

After cloning, install Solidity dependencies:

```bash
cd contracts
forge install OpenZeppelin/openzeppelin-contracts@v5.2.0 --no-commit
forge install foundry-rs/forge-std --no-commit
```

This populates `contracts/lib/` with OpenZeppelin and forge-std.

## Backend Development

```bash
cd backend
uv sync
uv run pytest -q
```

## Frontend Development

```bash
cd frontend
npm install
npm run dev
```

## Commit Guidelines

- One concern per commit
- Use conventional commit prefixes: `feat(...)`, `fix(...)`, `docs(...)`, `test(...)`, `chore(...)`
- No large hidden-diff commits
