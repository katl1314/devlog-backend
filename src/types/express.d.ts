export interface PostSyncEvent {
  postId: string;
  operation: 'index' | 'update' | 'remove';
  payload?: {
    title?: string;
    summary?: string;
    tags?: string[];
    thumbnail?: string;
    visibility?: boolean;
    status?: string;
    userId?: string;
    path?: string;
    createdAt?: Date;
    updatedAt?: Date;
  };
}

declare namespace Express {
  interface Request {
    pendingSearchEvents: PostSyncEvent[];
  }
}
