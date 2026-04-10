#!/bin/bash
set -e

# 1. 尝试加载环境
[[ -s "$HOME/.cargo/env" ]] && source "$HOME/.cargo/env"

# 2. 如果没有 cargo，尝试在 Vercel 环境下动态安装 (仅限 CI)
if ! command -v cargo &> /dev/null; then
    echo "Cargo not found, attempting to install Rust..."
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
    source "$HOME/.cargo/env"
    rustup default stable
    rustup target add wasm32-unknown-unknown
fi

# 3. 确保 wasm-pack 存在
if ! command -v wasm-pack &> /dev/null; then
    echo "wasm-pack not found, installing..."
    curl https://rustwasm.github.io/wasm-pack/installer/init.sh -sSf | sh
    source "$HOME/.cargo/env"
fi

# 4. 执行真正的构建
echo "Building WASM..."
cd rust/wasm
wasm-pack build --target bundler --out-dir pkg
