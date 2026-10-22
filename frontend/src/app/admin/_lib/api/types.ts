export interface ApiResponse<T> {
  status: boolean;
  message?: string;
  data: T;
}

export interface PaginationMeta {
  page: number;
  per_page: number;
  total: number;
  total_pages: number;
}

export interface Paginated<T> {
  items: T[];
  meta: PaginationMeta;
}

export interface ListParams {
  page?: number;
  per_page?: number;
  search?: string;
  [key: string]: string | number | boolean | undefined | null;
}

export type Status = "active" | "inactive";
export type PublishStatus = "draft" | "published";
export type BulkAction = "activate" | "deactivate" | "delete";

export interface IdName {
  id: number;
  name: string;
}
