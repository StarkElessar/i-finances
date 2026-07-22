export type PayeeType = 'company' | 'person' | 'unknown';

export type Payee = {
    id: string;
    isArchived: boolean;
    name: string;
    type: PayeeType;
};
