import { householdInvitationErrorMessageByCode } from '@i-finances/contracts';

import type { InvitationUnavailableCause } from './invitation-state';

export type InvitationUnavailableIcon = 'check' | 'clock' | 'search' | 'x';

export type InvitationUnavailableView = {
	description: string;
	icon: InvitationUnavailableIcon;
	title: string;
};

const NEW_LINK_REQUEST = 'Попросите того, кто вас пригласил, прислать новую ссылку.';

/**
 * The texts of the dead-link card by cause (board `Flow-Invite`, card 2, «четыре причины», decision of 2026-10-19 in
 * Р5). `unknown` is a well-formed token no invitation has, or one whose household was deleted: it must not say that the
 * link was mistyped, so it only asks for a new one. `malformed` is a link cut by the messenger and has the board's
 * «скопировали ссылку целиком». `unspecified` is an answer with no reason (an older API) and keeps the general text of
 * the contract. `used-for-registration` follows identity rejection after app registration: ask for a new link without
 * claiming somebody else used this one.
 */
export function describeUnavailable(cause: InvitationUnavailableCause): InvitationUnavailableView {
	switch (cause) {
		case 'expired':
			return { description: NEW_LINK_REQUEST, icon: 'clock', title: 'Срок действия закончился' };

		case 'used':
			return {
				description: 'По ней уже зарегистрировался или присоединился другой человек. Нужна новая.',
				icon: 'check',
				title: 'Ссылка уже использована'
			};

		case 'used-for-registration':
			return { description: NEW_LINK_REQUEST, icon: 'check', title: 'Ссылка уже использована' };

		case 'revoked':
			return {
				description: 'Приглашение отозвано. Попросите того, кто вас пригласил, прислать новое.',
				icon: 'x',
				title: 'Приглашение отозвано'
			};

		case 'unknown':
			return { description: NEW_LINK_REQUEST, icon: 'search', title: 'Ссылка не найдена' };

		case 'malformed':
			return {
				description: 'Проверьте, что скопировали ссылку целиком. Если не получается, попросите новую.',
				icon: 'search',
				title: 'Ссылка повреждена'
			};

		case 'unspecified':
			return {
				description: householdInvitationErrorMessageByCode['invitation-unavailable'],
				icon: 'search',
				title: 'Ссылка недействительна'
			};
	}
}
