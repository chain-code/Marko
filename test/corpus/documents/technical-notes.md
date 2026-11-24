---
title: 部署笔记
tags: [electron, markdown]
typora-root-url: ./assets
---

# 部署笔记

[TOC]

## 环境

> [!NOTE]
> 需要 Node.js 24 和 npm 10。

> [!WARNING]
> 打包前先跑 `npm test`。

安装依赖：`npm ci`；用到的反引号：`` `code` ``。

```powershell
npm ci
npm run build
```

## 配置

<details>
<summary>完整配置</summary>

```json
{ "appId": "com.chaincode.marko" }
```

</details>

参考 [electron-builder 文档][eb] 和 <https://www.electronjs.org/>。

[eb]: https://www.electron.build/ "electron-builder"

*[CSP]: Content Security Policy

CSP 要在响应头里设置。

Term
: 定义列表的说明。

<!-- 内部备注：不要导出 -->
