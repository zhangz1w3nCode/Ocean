## 安装

macOS Apple Silicon（arm64）：在本页 Assets 里下载 `.dmg` 结尾的安装包，打开后把 Ocean 拖进 Applications。

Intel Mac 暂不提供安装包。

## 首次打开被拦截怎么办

本版本未做 Developer ID 签名与公证，下载后可能被 Gatekeeper 拦截。两种放行方式：

- 系统设置 → 隐私与安全性 → 点击「仍要打开」（macOS 15 Sequoia 起右键打开已失效）
- 终端执行 `xattr -cr /Applications/Ocean.app`

提示「已损坏，无法打开」同样用第二条解决，它不是文件损坏。
