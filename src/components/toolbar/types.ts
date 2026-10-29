import { ObjectChanges } from '../../types';

export type UpdateObject = (id: string, changes: ObjectChanges, options?: { coalesce?: boolean }) => void;
