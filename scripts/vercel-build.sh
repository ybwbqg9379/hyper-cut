#!/bin/bash

# 强制错误即停止
set -e

# 1. 安装 Rust
echo "Installing Rust..."
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y

# 2. 暴力注入环境变量（Vercel 环境可能是 /root 或 /vercel）
export PATH="$HOME/.cargo/bin:$PATH"
export PATH="/root/.cargo/bin:$PATH"
export PATH="/vercel/.cargo/bin:$PATH"

# 加载环境
source "$HOME/.cargo/env" || true
. "$HOME/.cargo/env" || true

# 3. 强制设置 toolchain
echo "Setting up Rust toolchain..."
rustup default stable
rustup target add wasm32-unknown-unknown

# 4. 安装 wasm-pack
echo "Installing wasm-pack..."
curl https://rustwasm.github.io/wasm-pack/installer/init.sh -sSf | sh
export PATH="$HOME/.cargo/bin:$PATH"

# 5. 最终验证
cargo --version
wasm-pack --version

# 6. 进入根目录执行构建
echo "Starting project build..."
cd ../..
# 确保在执行 bun 时也能看到 cargo 路径
export PATH="$HOME/.cargo/bin:$PATH"
bun run build:web
