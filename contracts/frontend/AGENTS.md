# AGENTS.md

AI agent guide for **confidential deck frontend** - a confidential dApp frontend built on [Inco](https://inco.org).

## About Inco

Inco is full-stack, programmable privacy for blockchains: encrypted on-chain state with programmable
access control, decrypted inside a TEE. Note: Inco is **TEE-based, not FHE** - "encrypted" means
decrypt-in-TEE, and "provably fair" means a covalidator attestation, not a zk proof.

- **Docs:** https://docs.inco.org

## Inco skill (recommended)

Install the **Inco Lightning** agent skill - it teaches confidential contracts, dApps, and
confidential-game patterns on Inco Lightning, and works across Claude Code, Codex, Cursor, and 70+ agents.

```bash
npx skills add Inco-fhevm/skills
```

Or, in Claude Code, install it as a plugin:

```
/plugin marketplace add Inco-fhevm/skills
/plugin install inco@inco
```

Then invoke `/lightning` (or `/inco:lightning`), or just describe the Inco task you want.
Skill repo: https://github.com/Inco-fhevm/skills

## Stack

- `@inco/lightning-js` (frontend SDK)

## Project layout

- Next.js app at the repository root (RainbowKit)

See `README.md` for install and run instructions.
