# Project Specification

This document serves as an overview of the "Food Blockchain" demo and acts as the central source of meaning for ongoing work.

## Purpose

Track batches of food through a supply chain using a simple Ethereum token. Every lifecycle step emits events that can be indexed off chain. The project demonstrates how a blockchain-based approach can provide transparency for producers, distributors and consumers.

## Goals

- Show a minimal end-to-end setup for supply chain tracking
- Run offline whenever possible (vendored Solidity compiler and local tests)
- Keep deployment and development simple so new contributors can get started quickly
- Document agent roles and contributor responsibilities
- Maintain a lightweight UI that works in light and dark mode

## Methods

- Solidity smart contract compiled with Hardhat
- Event indexer and dashboard implemented in Node.js
- React and Vite provide the user interface
- Optional Postgres database stores actors for the admin panel
- Continuous integration runs `npm test` using the offline suite

## Implementation Guidelines

1. **Usage and deployment** – See [README.md](../README.md) for setup instructions, network configuration and local workflow.
2. **Bots and automation** – Agent responsibilities are defined in [AGENTS.md](../AGENTS.md). Follow these guidelines when creating pull requests or running tests.
3. **Styling and UI/UX** – The structure and color scheme of the frontend are documented in [frontend/STYLING.md](../frontend/STYLING.md).
4. **Admin interface** – Details on the optional database-backed UI live in [docs/admin.md](admin.md).

All new features should keep the offline-first approach in mind and reference this specification so implementations remain aligned with the overall purpose and goals.
