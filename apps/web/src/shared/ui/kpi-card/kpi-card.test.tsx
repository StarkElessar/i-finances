// @vitest-environment jsdom
import { formatMinorUnitsCurrency } from '@/shared/lib';

import { screen } from '@testing-library/dom';
import { describe, expect, it } from 'vitest';

import { renderUi } from '../../../../tests/render-ui';

import { KpiCard } from './kpi-card';

describe('KpiCard', () => {
	it('associates a term with a value and formats whole currency units through the shared formatter', () => {
		renderUi(() => <KpiCard label='За период' amountMinor={1048700} currency='BYN' description='10 мес'/>);

		expect(screen.getByRole('term')).toHaveTextContent('За период');
		expect(screen.getAllByRole('definition')[0].textContent).toBe(
			formatMinorUnitsCurrency(1048700, 'BYN', { maximumFractionDigits: 0 })
		);
		expect(screen.getByText('10 мес')).toBeInTheDocument();
		expect(screen.queryByRole('button')).not.toBeInTheDocument();
	});

	it('keeps the sign and comparison text of the successful decrease', () => {
		renderUi(() => <KpiCard label='Последний закрытый' value='−43%' tone='success' description='сентябрь против августа'/>);

		expect(screen.getByText('−43%')).toBeInTheDocument();
		expect(screen.getByText('сентябрь против августа')).toBeInTheDocument();
	});
});
