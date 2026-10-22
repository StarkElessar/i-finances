import css from './household-panel.module.scss';

import { formatDeadline, formatTimeLeft } from '@/shared/lib';
import { Badge, Banner, Button, IconTile, List, ListRow, Typography } from '@/shared/ui';

import { type ActiveHouseholdInvitation, type CreatedHouseholdInvitation, MAX_ACTIVE_HOUSEHOLD_INVITATIONS } from '@i-finances/contracts';
import { CircleAlert, Link, Plus } from 'lucide-solid';
import { For, Show } from 'solid-js';

import { CreatedInvitation } from './created-invitation';

export type HouseholdInvitationsProps = {
	/** The active invitations; `undefined` until they are loaded. */
	invitations: ActiveHouseholdInvitation[] | undefined;
	/** The list could not be loaded. */
	listError?: string;
	/** The invitation created a moment ago, with its one-time link. */
	created?: CreatedHouseholdInvitation;
	/** Why creating or revoking failed. */
	error?: string;
	/** Current time in ms, for «Осталось 6 д 23 ч». */
	now: number;
	isCreating?: boolean;
	/** The id of the invitation being revoked. */
	revokingId?: string;
	/** Another request runs: nothing else can be started. */
	isDisabled?: boolean;
	onCreate: () => void;
	onDismissCreated: () => void;
	onRetryList: () => void;
	onRevoke: (id: string) => void;
};

/**
 * The owner's invitations (boards `M-Household`, `D-Household`): «Приглашения» with the count «2 из 3», the active ones
 * with «Отозвать», «Пригласить» and, right after creating one, its link once. At three active invitations the create
 * button is disabled and the board's explanation stands under the list.
 */
export function HouseholdInvitations(props: HouseholdInvitationsProps) {
	const count = () => props.invitations?.length ?? 0;
	const isFull = () => count() >= MAX_ACTIVE_HOUSEHOLD_INVITATIONS;

	return (
		<section class={css.section}>
			<div class={css.sectionHeader}>
				<Typography as='h3' variant='body-lg' weight='semibold'>Приглашения</Typography>
				<Show when={props.invitations}>
					<Badge>{count()} из {MAX_ACTIVE_HOUSEHOLD_INVITATIONS}</Badge>
				</Show>
			</div>
			<Show when={props.created}>
				{(created) => <CreatedInvitation invitation={created()} now={props.now} onDone={() => props.onDismissCreated()}/>}
			</Show>
			<Show when={props.listError}>
				{(message) => (
					<Banner icon={<CircleAlert/>} role='alert' tone='danger'>
						{message()}{' '}
						<Button onClick={() => props.onRetryList()} size='sm' variant='ghost'>Повторить</Button>
					</Banner>
				)}
			</Show>
			<Show when={props.invitations && props.invitations.length > 0}>
				<List aria-label='Активные приглашения'>
					<For each={props.invitations}>
						{(invitation) => (
							<ListRow
								comfortable
								leading={<IconTile><Link/></IconTile>}
								meta={(() => {
									const left = formatTimeLeft(invitation.expiresAt, props.now);

									return left === undefined ? undefined : `Осталось ${left}`;
								})()}
								title={`Действует до ${formatDeadline(invitation.expiresAt) ?? '…'}`}
								trailing={(
									<Button
										disabled={props.isDisabled || props.revokingId === invitation.id}
										loading={props.revokingId === invitation.id}
										onClick={() => props.onRevoke(invitation.id)}
										size='sm'
										variant='ghost'
									>
										Отозвать
									</Button>
								)}
							/>
						)}
					</For>
				</List>
			</Show>
			<Show when={isFull()}>
				<Banner icon={<CircleAlert/>} tone='info'>
					Активных приглашений уже {MAX_ACTIVE_HOUSEHOLD_INVITATIONS}. Отзовите лишнее, чтобы создать новое.
				</Banner>
			</Show>
			<Show when={props.error}>
				{(message) => <Banner icon={<CircleAlert/>} role='alert' tone='danger'>{message()}</Banner>}
			</Show>
			<Button
				class={css.createInvitation}
				disabled={isFull() || props.isDisabled || props.invitations === undefined}
				loading={props.isCreating}
				onClick={() => props.onCreate()}
				startIcon={<Plus/>}
				variant='secondary'
			>
				Пригласить
			</Button>
		</section>
	);
}
