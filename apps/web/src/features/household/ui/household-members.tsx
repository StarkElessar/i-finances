import { formatDayWithYear, getInitials } from '@/shared/lib';
import { Avatar, Badge, Button, List, ListRow } from '@/shared/ui';

import type { HouseholdMember } from '@i-finances/contracts';
import { Trash } from 'lucide-solid';
import { For, Show } from 'solid-js';

export type HouseholdMembersProps = {
	members: HouseholdMember[];
	/** The id of the person looking: their row says «(вы)» and has no delete button. */
	viewerId: string;
	/** An owner sees a delete button on the rows of the others. */
	canRemove: boolean;
	/** The row whose removal is running or asked about; its button is disabled. */
	busyUserId?: string;
	isDisabled?: boolean;
	onRemove: (member: HouseholdMember) => void;
};

function describeMember(member: HouseholdMember): string {
	const since = formatDayWithYear(member.joinedAt);
	const login = member.telegramUsername === null ? undefined : `@${member.telegramUsername}`;

	return [login, since === undefined ? undefined : `с ${since}`].filter(Boolean).join(' · ');
}

/**
 * The participants (boards `M-Household`, `D-Household`): avatar, name with «(вы)», the Telegram login when there is one
 * and the day they joined, the role as a badge, and for an owner a delete button on the others.
 */
export function HouseholdMembers(props: HouseholdMembersProps) {
	return (
		<List aria-label='Участники окружения'>
			<For each={props.members}>
				{(member) => (
					<ListRow
						comfortable
						leading={<Avatar initials={getInitials(member.displayName)}/>}
						meta={describeMember(member)}
						title={member.userId === props.viewerId ? `${member.displayName} (вы)` : member.displayName}
						trailing={(
							<>
								<Badge tone={member.role === 'owner' ? 'info' : 'neutral'}>
									{member.role === 'owner' ? 'Владелец' : 'Участник'}
								</Badge>
								<Show when={props.canRemove && member.userId !== props.viewerId}>
									<Button
										aria-label={`Удалить участника ${member.displayName}`}
										disabled={props.isDisabled || props.busyUserId === member.userId}
										iconOnly
										onClick={() => props.onRemove(member)}
										size='sm'
										variant='danger-ghost'
									>
										<Trash/>
									</Button>
								</Show>
							</>
						)}
					/>
				)}
			</For>
		</List>
	);
}
