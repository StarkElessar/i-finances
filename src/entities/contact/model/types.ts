export type ContactType = 'company' | 'person' | 'unknown';

export type Contact = {
    color: string;
    createdAt: string;
    id: string;
    isArchived: boolean;
    legalName: string | null;
    name: string;
    type: ContactType;
    updatedAt: string;
};
