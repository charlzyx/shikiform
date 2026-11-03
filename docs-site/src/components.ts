/**
 * MDX globals registry — components available inside MDX without `import`.
 * Wired via `<Content components={components} />` in `[...slug].astro`.
 * Add new components here as you build (or install) them.
 */

import { Aside } from "./components/ui/aside";
import Render from "./components/Render.astro";
import Demo from "./components/DemoIsland.astro";
import TutorialPlay from "./components/TutorialIsland.astro";
import { Card } from "./components/ui/card";
import { CardGrid } from "./components/ui/card-grid";
import { CodeGroup } from "./components/ui/code-group";
import { Accordion, AccordionTrigger, AccordionContent } from "./components/ui/accordion";
import { FileTree } from "./components/ui/file-tree";
import { LinkCard } from "./components/ui/link-card";
import { PackageManagers } from "./components/ui/package-managers";
import { Step, Steps } from "./components/ui/steps";
import { Tabs, TabItem } from "./components/ui/tabs";

export const components = {
  Aside,
  Demo,
  TutorialPlay,
  Card,
  CardGrid,
  Accordion,
  AccordionTrigger,
  AccordionContent,
  CodeGroup,
  FileTree,
  LinkCard,
  PackageManagers,
  Render,
  Step,
  Steps,
  TabItem,
  Tabs,
};
