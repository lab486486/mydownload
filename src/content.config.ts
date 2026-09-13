import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const software = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/software' }),
  schema: z.object({
    title: z.string(),
    name: z.string(),
    category: z.enum([
      'utility',
      'office',
      'media',
      'security',
      'internet',
      'graphics',
    ]),
    os: z.array(z.string()).default([]),
    developer: z.string().optional(),
    license: z.string().optional(),
    rating: z.number().optional(),
    downloads: z
      .array(
        z.object({
          os: z.string(),
          label: z.string(),
          url: z.string(),
        }),
      )
      .default([]),
    icon: z.string().optional(),
    excerpt: z.string().optional(),
    featured: z.boolean().default(false),
    date: z.coerce.date(),
    updated: z.coerce.date().optional(),
    tags: z.array(z.string()).default([]),
    entrySlug: z.string(),
    legacyPath: z.string(),
    canonical: z.string().optional(),
    hiddenFromList: z.boolean().default(false),
    softwareKey: z.string().optional(),
    legacyId: z.number().optional(),
  }),
});

export const collections = { software };
