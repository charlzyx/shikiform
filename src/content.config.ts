// Required by Starlight 0.34+ (content layer): without this file Astro
// treats src/content/docs as an unknown folder and builds 0 pages.
// In Starlight 0.42 the loaders live in '@astrojs/starlight/loaders' and
// the schemas live in '@astrojs/starlight/schema' (NOT in loaders).
// The schema matters: it defaults `draft` to false, and Starlight's
// production routing only keeps entries with draft === false.
import { defineCollection } from 'astro:content';
import { docsLoader, i18nLoader } from '@astrojs/starlight/loaders';
import { docsSchema, i18nSchema } from '@astrojs/starlight/schema';

export const collections = {
  docs: defineCollection({ loader: docsLoader(), schema: docsSchema() }),
  i18n: defineCollection({ loader: i18nLoader(), schema: i18nSchema() }),
};
