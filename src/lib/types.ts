export type ItemType = "text" | "url" | "code" | "image" | "file" | "color";

export interface Category {
  id: number;
  name: string;
  isDefault: boolean;
  sortOrder: number;
  itemCount: number;
}

export interface ClipboardItem {
  id: string;
  content: string;
  preview: string;
  itemType: ItemType;
  sourceApp?: string;
  categoryId: number;
  categoryName: string;
  isFavorite: boolean;
  isPinned: boolean;
  pinShortcut?: number | null;
  fileName?: string;
  mimeType?: string;
  thumbnail?: string;
  contentSize: number;
  createdAt: string;
  tags: string[];
}

export interface SearchParams {
  query?: string;
  categoryId?: number;
  sourceApp?: string;
  itemType?: ItemType;
  favoritesOnly?: boolean;
  pinnedOnly?: boolean;
  limit?: number;
  offset?: number;
}

export interface PaginatedItems {
  items: ClipboardItem[];
  total: number;
  hasMore: boolean;
}

export interface SourceApp {
  name: string;
  count: number;
}
