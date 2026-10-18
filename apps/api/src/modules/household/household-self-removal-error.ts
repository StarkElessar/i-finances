/**
 * Signals that an owner tried to remove themselves: removal is for other members only, a person leaves with
 * `POST /api/household/leave` (Р6).
 */
export class HouseholdSelfRemovalError extends Error {
	public constructor() {
		super('An owner cannot remove themselves.');
		this.name = 'HouseholdSelfRemovalError';
	}
}
