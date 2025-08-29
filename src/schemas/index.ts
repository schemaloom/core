import EventListSchema from './eventSchema.js';
import { z } from 'zod';

// Product schema for e-commerce applications
export const ProductSchema = z.object({
  name: z.string(),
  price: z.number(),
  category: z.string(),
  description: z.string().optional(),
  brand: z.string().optional(),
  sku: z.string().optional()
});

export const ProductListSchema = z.array(ProductSchema);

// Article schema for content extraction
export const ArticleSchema = z.object({
  title: z.string(),
  author: z.string().optional(),
  publishDate: z.string().optional(),
  content: z.string().optional(),
  tags: z.array(z.string()).optional(),
  summary: z.string().optional()
});

export const ArticleListSchema = z.array(ArticleSchema);

// Contact schema for business applications
export const ContactSchema = z.object({
  name: z.string(),
  email: z.string().optional(),
  phone: z.string().optional(),
  company: z.string().optional(),
  position: z.string().optional(),
  address: z.string().optional()
});

export const ContactListSchema = z.array(ContactSchema);

// Invoice schema for financial documents
export const InvoiceSchema = z.object({
  invoiceNumber: z.string(),
  date: z.string(),
  dueDate: z.string().optional(),
  customer: z.string(),
  items: z.array(z.object({
    description: z.string(),
    quantity: z.number(),
    unitPrice: z.number(),
    total: z.number()
  })),
  subtotal: z.number(),
  tax: z.number().optional(),
  total: z.number()
});

export const InvoiceListSchema = z.array(InvoiceSchema);

// Export all schemas
export {
  EventListSchema,
  EventListSchema as default
};

// Schema registry for easy access
export const SchemaRegistry = {
  event: EventListSchema,
  product: ProductListSchema,
  article: ArticleListSchema,
  contact: ContactListSchema,
  invoice: InvoiceListSchema
} as const;

export type SchemaName = keyof typeof SchemaRegistry;
export type AvailableSchemas = typeof SchemaRegistry;
