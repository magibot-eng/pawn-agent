# Pawn Agent Security Rules

## Dependency Management
- All Python dependencies must be locked via `uv.lock`
- Run `uv sync` to install — never `pip install` without a lock file
- `uv lock` must be run and committed whenever dependencies change

## Pre-Deploy Audit (mandatory)
Before any deploy:
```
cd backend && bash scripts/audit-deps.sh
```
This runs pip check + blocks untrusted registries + blocks suspicious names.

## No Direct Curl-Bash
Never run `curl | bash` or `wget | bash` to install software. Always:
1. Download the script
2. Review its contents
3. Run manually

## Subprocess Shell Escaping
Never pass raw user input (ETH addresses, ENS names, hex strings) into shell commands.
Always use Python's `shlex.quote()` or subprocess with list args.

## Package Registry Allowlist
- pip: PyPI only (no `--extra-index-url` pointing to untrusted sources)
- npm: npmjs.org only (check `.npmrc` for registry restrictions)

## Agent Rules
- Never run `npx` or `pip install` on untrusted user-provided packages
- Never execute scripts fetched from URLs without review
- If a package version silently changes on the registry (typosquatting), the lock file protects against this