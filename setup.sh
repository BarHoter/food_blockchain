#!/bin/bash

# Setup script to prepare the project for offline use.
# Run this script while network access is available.

set -euo pipefail

# Install npm dependencies
npm install

# Compile contracts so that artifacts are available offline
npx hardhat compile
