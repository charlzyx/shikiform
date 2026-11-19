export function pageLanguage(path: string) {
  return /^\/en(?:\/|$)/.test(path) ? "en" : "zh-CN";
}

export function languagePath(path: string, language: "en" | "zh-CN") {
  const base = path.replace(/^\/en(?=\/|$)/, "") || "/";
  return language === "en" ? "/en" + base : base;
}

const englishLabels: Record<string, string> = {
  首页: "Home", 其他: "Other", 开始: "Getting started", 快速开始: "Quick start", 接入组件库: "Connecting a UI library",
  教程: "Tutorial", 总览: "Overview", "1. 字段与路径": "1. Fields and paths", "2. 状态与校验": "2. State and validation",
  "3. 联动与数组": "3. Effects and arrays", "4. 提交与进阶": "4. Submission and next steps",
  基础: "Fundamentals", 表单与字段: "Forms and fields", 核心概念: "Core concepts", 按路径读写: "Field paths",
  字段路径与结构: "Objects and arrays", 字段状态: "Field state", 校验: "Validation", 提交与重置: "Submit and reset",
  进阶: "Advanced", 联动: "Reactions and watches", 数组: "Arrays", 命名UI: "Named UI nodes", "命名 UI": "Named UI nodes",
  查询列表: "Query tables", 场景示例: "Examples", 表单与校验: "Forms and validation", 联动与显隐: "Effects and visibility",
  数组与树: "Arrays and trees", 表格与查询: "Tables and queries", 业务场景: "Business forms", 示例目录: "Playground",
  最佳实践: "Best practices", 常见的坑: "Common pitfalls", "测试、性能与 SSR": "Testing, performance and SSR",
  "迁移与 FAQ": "Migration and FAQ", "API 参考": "API reference", "API 总览": "API overview", "查询 Hooks": "Query hooks",
  "Agent 指南": "Agent guide", 指南: "Guides", 示例: "Examples",
};

export const englishLabel = (label: string) => englishLabels[label] ?? label;
