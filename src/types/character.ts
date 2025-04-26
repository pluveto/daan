import { NamespacedModelId } from './misc';

export interface CustomCharacter {
  id: string;
  sort: number;
  name: string;
  description?: string;
  icon: string;
  prompt: string;
  model: NamespacedModelId;
  maxHistory: number | null;
  createdAt: number;
  updatedAt: number;
}

export type PartialCharacter = Partial<CustomCharacter>;
