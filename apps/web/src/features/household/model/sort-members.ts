import type { HouseholdMember } from '@i-finances/contracts';

/** Owners first, then in the order they joined, then by name (the board lists the owner on top). */
export function sortMembers(members: HouseholdMember[]): HouseholdMember[] {
	return [...members].sort((left, right) => {
		if (left.role !== right.role) {
			return left.role === 'owner' ? -1 : 1;
		}

		return left.joinedAt.localeCompare(right.joinedAt) || left.displayName.localeCompare(right.displayName, 'ru');
	});
}
