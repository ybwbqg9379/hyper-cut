#!/bin/bash

# 1. Install Rust
echo "Installing Rust..."
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
source "$HOME/.cargo/env"

# 2. Select default toolchain and add wasm target
echo "Setting up Rust toolchain..."
rustup default stable
rustup target add wasm32-unknown-unknown

# 3. Install wasm-pack
echo "Installing wasm-pack..."
curl https://rustwasm.github.io/wasm-pack/installer/init.sh -sSf | sh

# 4. Run the build from the root directory
echo "Starting project build..."
cd ../..
bun run build:web
