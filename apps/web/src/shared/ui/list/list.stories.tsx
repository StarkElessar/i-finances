import { Avatar } from '@/shared/ui/avatar';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { IconTile } from '@/shared/ui/icon-tile';

import { Link, Trash, X } from 'lucide-solid';
import type { Meta, StoryObj } from 'storybook-solidjs-vite';

import { List } from './list';
import { ListRow } from './list-row';

const meta = {
	title: 'Kit/List',
	component: List,
	args: {
		'aria-label': 'Участники окружения',
		children: null
	}
} satisfies Meta<typeof List>;

export default meta;

type Story = StoryObj<typeof meta>;

/** Participants, as on `M-Household`: avatar, name with a login and a date, a role badge and a delete button. */
export const Participants: Story = {
	render: (args) => (
		<List {...args}>
			<ListRow
				comfortable
				leading={<Avatar initials='АЛ'/>}
				meta='@alexey · с 3 марта 2026'
				title='Алексей (вы)'
				trailing={<Badge tone='info'>Владелец</Badge>}
			/>
			<ListRow
				comfortable
				leading={<Avatar initials='АН'/>}
				meta='@anna · с 18 октября 2026'
				title='Анна'
				trailing={(
					<>
						<Badge>Участник</Badge>
						<Button aria-label='Удалить Анну' iconOnly size='sm' variant='ghost'><Trash/></Button>
					</>
				)}
			/>
		</List>
	)
};

/** Invitations and dead-link reasons: an icon tile and two lines of text. */
export const WithTiles: Story = {
	render: (args) => (
		<List {...args} aria-label='Приглашения'>
			<ListRow
				comfortable
				leading={<IconTile><Link/></IconTile>}
				meta='Осталось 6 д 23 ч'
				title='Действует до 25 октября, 21:04'
				trailing={<Button size='sm' variant='ghost'>Отозвать</Button>}
			/>
			<ListRow
				leading={<IconTile tone='neutral'><X/></IconTile>}
				meta='Владелец отозвал это приглашение.'
				title='Приглашение отозвано'
			/>
		</List>
	)
};
