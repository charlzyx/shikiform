# 归档

这里是设计过程材料，**不会**被 Starlight 编进站点，侧边栏和首页也不链接到这里。

库的行为以 `src/` 为准。下面的决定记录不再当作待拍板清单。

| 路径 | 内容 |
|---|---|
| `PLAN.md` `STATE.md` `LAYOUT.md` `QUALITY.md` `REVIEW.md` | 规划、状态、分层、质量标准和旧实现回顾 |
| `ARCH.md` | 内部架构笔记（四层、reaction、大表订阅）。不是公开文档 |
| `usage/DECISIONS.md` | 设计期的决定和当时未决的问题 |
| `usage/API.md` | 由伪代码反推的 API 草案 |
| `usage/*.tsx` | 用例伪代码，不参与 `tsc` |
| `site-sketches/` | 曾作为 Starlight 页面的 MDX（待拍板、API 草案、架构页、17 个用例页）和 `OpenPoints.astro` |

这些 MDX 的 import 指向搬迁前的路径，只作阅读，不要再挂回 `src/content/docs/`。
