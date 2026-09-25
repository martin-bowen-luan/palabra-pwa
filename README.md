# palabra

一款面向中文初学者的离线西班牙语背词 PWA。内置 300 个 A1 高频词，提供每日新词、间隔复习、中西互选、西语拼写、进度统计和深色模式。

## 本地运行

```bash
npm install
npm run dev
```

浏览器打开 `http://localhost:5173/today`。

## 验证与构建

```bash
npm test
npm run typecheck
npm run build
npm run preview
```

生产构建位于 `dist/`。首次在线打开后，应用壳、词库和字体会由 Service Worker 缓存，可继续离线学习。

## 数据说明

学习进度、设置和打卡记录只保存在浏览器 IndexedDB 中，不会上传到服务器。设置页可清空全部学习记录。
