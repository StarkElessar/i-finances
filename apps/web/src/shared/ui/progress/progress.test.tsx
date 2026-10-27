// @vitest-environment jsdom
import { screen } from '@testing-library/dom';
import { createSignal } from 'solid-js';
import { describe, expect, it } from 'vitest';

import { renderUi } from '../../../../tests/render-ui';

import { Progress } from './progress';

describe('Progress', () => {
	it('names the track and exposes bounded values while explaining an overrun', () => {
		const [value, setValue] = createSignal(62);

		renderUi(() => <Progress aria-label='Бюджет' aria-valuetext={`${value()}%`} value={value()}/>);

		const track = screen.getByRole('progressbar', { name: 'Бюджет' });

		expect(track).toHaveAttribute('aria-valuemin', '0');
		expect(track).toHaveAttribute('aria-valuemax', '100');
		expect(track).toHaveAttribute('aria-valuenow', '62');
		setValue(117);
		expect(track).toHaveAttribute('aria-valuenow', '100');
		expect(track).toHaveAttribute('aria-valuetext', '117%');
		expect(track.firstElementChild).toHaveStyle({ width: '100%' });
	});

	it.each([-10, NaN, Infinity])('keeps invalid or negative input %s within the accessible range', (value) => {
		renderUi(() => <Progress aria-label='Бюджет' value={value}/>);

		expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
	});
});
