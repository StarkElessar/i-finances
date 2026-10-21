import { Badge, List, ListRow } from '@/shared/ui';

import { Check, Send } from 'lucide-solid';

export type TelegramLinkedRowProps = {
	/** The Telegram name without `@`, `null` when the account has none. */
	username: string | null;
};

/** «@alexey · Привязан» (mockup `M-Security`, `D-Security`). There is no unlinking in v1, so the row has no action. */
export function TelegramLinkedRow(props: TelegramLinkedRowProps) {
	return (
		<List aria-label='Telegram'>
			<ListRow
				icon={<Send/>}
				meta={props.username === null ? 'Без имени пользователя' : `@${props.username}`}
				title='Telegram'
				trailing={<Badge icon={<Check/>} tone='success'>Привязан</Badge>}
			/>
		</List>
	);
}
