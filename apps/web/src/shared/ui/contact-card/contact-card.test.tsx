// @vitest-environment jsdom
import { formatMinorUnitsCurrency } from '@/shared/lib';

import { fireEvent, screen } from '@testing-library/dom';
import { describe, expect, it, vi } from 'vitest';

import { renderUi } from '../../../../tests/render-ui';

import { ContactCard } from './contact-card';

describe('ContactCard', () => {
	it('shows a company and the monthly spending without a phone placeholder', () => {
		renderUi(() => <ContactCard name='Маркет Север' kind='company' spentMinor={18420} currency='BYN'/>);

		expect(screen.getByText('Компания')).toBeInTheDocument();
		expect(screen.getByText('Потрачено в этом месяце')).toBeInTheDocument();
		expect(screen.getByText(formatMinorUnitsCurrency(18420, 'BYN'), { normalizer: (text) => text })).toBeInTheDocument();
		expect(screen.queryByRole('button')).not.toBeInTheDocument();
		expect(screen.queryByRole('img')).not.toBeInTheDocument();
	});

	it('shows a person, phone and zero, with an accessible edit action', () => {
		const onEdit = vi.fn();

		renderUi(() => (
			<ContactCard name='Алексей' kind='person' phone='+375 29 000-00-00' spentMinor={0} currency='BYN' onEdit={onEdit}/>
		));

		expect(screen.getByText('Человек · +375 29 000-00-00')).toBeInTheDocument();
		expect(screen.getByText(formatMinorUnitsCurrency(0, 'BYN'), { normalizer: (text) => text })).toBeInTheDocument();

		const edit = screen.getByRole('button', { name: 'Редактировать контакт Алексей' });

		edit.focus();
		expect(edit).toHaveFocus();
		fireEvent.click(edit);
		expect(onEdit).toHaveBeenCalledTimes(1);
	});
});
