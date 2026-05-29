# 字体图标

本目录使用 [Remix Icon](https://remixicon.com/)（MIT 协议，可免费商用）。

| 文件 | 说明 |
|------|------|
| `remixicon.woff2` | 字体主文件（已包含在包内） |

## 重新下载

```bash
curl -L -o fonts/remixicon.woff2 https://cdn.jsdelivr.net/npm/remixicon@4.6.0/fonts/remixicon.woff2
```

## 图标映射

| 摸鱼类型 | Remix 图标 | Unicode |
|----------|------------|---------|
| 上厕所 | lucide/toilet（`moyuicon.woff2`） | `\f101` |
| 喝水 | ri-cup-line | `\ec06` |
| 充电 | ri-battery-2-charge-line | `\eaaa` |
| 聊天 | ri-chat-3-line | `\eb51` |

样式定义见 `styles/iconfont.wxss`。

**注意**：微信小程序禁止在 wxss 中使用本地路径 `@font-face`，字体须在 `app.js` 通过 `wx.loadFontFace` + base64 加载（见 `utils/font.js`）。
