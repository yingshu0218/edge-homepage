# Edge 商店上传清单（Day Start 0.1.0）

## 上传文件

- 扩展包：`day-start-edge-0.1.0.zip`
- 商店图标：`store-assets/day-start-logo-300.png`
- 截图：`store-assets/screenshot-1-main-1280x800.png` 至 `screenshot-4-weather-1280x800.png`
- 小型推广图：`store-assets/day-start-small-promo-440x280.png`
- 大型推广图：`store-assets/day-start-large-promo-1400x560.png`

## Partner Center 填写顺序

1. **包**：上传 ZIP，等待清单解析通过。
2. **可用性**：市场选择“所有市场”；可见性选择“公开”。
3. **属性**：类别选“生产力”；不包含购买；不面向儿童。
4. **隐私**：隐私政策填写 `https://github.com/yingshu0218/edge-homepage/blob/main/PRIVACY.md`；按照 `docs/edge-store-listing-zh-CN.md` 的“数据使用披露”回答位置数据问题。
5. **商店一览**：语言选择 `中文（简体）`，上传本清单列出的图标、截图和推广图；名称、简短说明、详细说明、搜索词和支持地址全部复制自 `docs/edge-store-listing-zh-CN.md`。
6. **认证说明**：复制 `docs/edge-store-listing-zh-CN.md` 的“审核测试说明”。远程代码选择“否”。
7. **保存草稿并预览**：检查图片未被裁切、说明无同步承诺、支持与隐私链接可公开访问。
8. **提交认证**：确认版本号为 `0.1.0` 后再提交。

## 发布者最终确认

- [ ] GitHub 仓库为公开状态，隐私政策无需登录即可打开。
- [ ] 确认六张内置背景图片和图标具备商用发布权利。
- [ ] 在一份全新 Edge 配置中安装 ZIP，新增/编辑/删除/排序书签均正常。
- [ ] 手动城市天气正常；拒绝定位后其他功能仍正常。
- [ ] 导出、替换导入、合并导入均已验证。
- [ ] 没有填写 Microsoft 帐号自动同步、GitHub 同步或 Gitea 同步等当前版本不提供的功能。

## 发布包校验

最终 SHA-256 在每次重新打包后记录于 `SHA256SUMS.txt`。提交前可运行：

```sh
shasum -a 256 -c SHA256SUMS.txt
```
