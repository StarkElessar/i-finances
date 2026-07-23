export type {
    ChangeContactArchiveStateInput,
    ContactCommandErrorCode,
    ContactCommandResult,
    ContactListInput,
    ContactListStatus,
    CreateContactInput,
    UpdateContactInput
} from './contact.contract';
export {
    changeContactArchiveStateInputSchema,
    CONTACT_LIST_STATUSES,
    contactListInputSchema,
    createContactInputSchema,
    EDITABLE_CONTACT_TYPES,
    updateContactInputSchema
} from './contact.contract';
export {
    archiveContact,
    createContact,
    getContacts,
    restoreContact,
    updateContact
} from './contact.server';
