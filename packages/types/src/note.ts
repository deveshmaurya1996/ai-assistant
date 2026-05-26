export interface UserNote {
  id: string;
  title: string;
  content: string;
  sourceMessageId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateNoteBody {
  content: string;
  title?: string;
  sourceMessageId?: string;
}
