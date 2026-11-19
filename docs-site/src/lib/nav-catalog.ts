import { config } from "virtual:nimbus/config";
import { withBase } from "@cloudflare/nimbus-docs/runtime";

export interface NavItem {
  label: string;
  path: string;
  href: string;
  groupKey: string;
  groupLabel: string;
}

export interface NavGroup {
  key: string;
  label: string;
  items: NavItem[];
}

interface SidebarLeaf {
  label: string;
  link: string;
}

interface SidebarGroup {
  label: string;
  items: Array<string | SidebarLeaf | SidebarGroup>;
}

type SidebarEntry = string | SidebarLeaf | SidebarGroup;

export function getNavCatalog(baseUrl: string): {
  groups: NavGroup[];
  items: NavItem[];
} {
  const raw = (config.sidebar?.items ?? []) as SidebarEntry[];
  const groups: NavGroup[] = [];
  const items: NavItem[] = [];
  const miscItems: NavItem[] = [];

  for (const entry of raw) {
    if (typeof entry === "string") {
      if (entry === "index") {
        miscItems.push({
          label: "首页",
          path: "/",
          href: withBase("/", baseUrl),
          groupKey: "other",
          groupLabel: "其他",
        });
      }
      continue;
    }

    if ("link" in entry) {
      miscItems.push({
        label: entry.label,
        path: entry.link,
        href: withBase(entry.link, baseUrl),
        groupKey: "other",
        groupLabel: "其他",
      });
      continue;
    }

    if ("items" in entry && Array.isArray(entry.items)) {
      const groupKey = entry.label;
      const groupItems: NavItem[] = [];
      for (const child of entry.items) {
        if (typeof child === "object" && child !== null && "link" in child) {
          const item: NavItem = {
            label: child.label,
            path: child.link,
            href: withBase(child.link, baseUrl),
            groupKey,
            groupLabel: entry.label,
          };
          groupItems.push(item);
          items.push(item);
        }
      }
      if (groupItems.length > 0) {
        groups.push({ key: groupKey, label: entry.label, items: groupItems });
      }
    }
  }

  if (miscItems.length > 0) {
    // Attach standalone links (e.g. Agent 指南) into the last group or a clean "更多" group
    const extra = miscItems.filter((m) => m.path !== "/");
    if (extra.length > 0) {
      const target = groups.find((g) => g.label === "API 参考") ?? groups[groups.length - 1];
      if (target) {
        for (const m of extra) {
          const item = { ...m, groupKey: target.key, groupLabel: target.label };
          target.items.push(item);
          items.push(item);
        }
      }
    }
  }

  return { groups, items };
}
