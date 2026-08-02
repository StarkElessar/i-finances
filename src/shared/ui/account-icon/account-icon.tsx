import css from './account-icon.module.scss';

import { AccountType, type AccountTypeValue, cn } from '~/shared/lib';

import type { JSX } from 'solid-js';

const iconClassByAccountType: Record<AccountTypeValue, () => JSX.Element> = {
	[AccountType.CARD]: () => (
		<svg width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2'>
			<rect x='2' y='5' width='20' height='14' rx='2'/>
			<path d='M2 10h20'/>
		</svg>
	),
	[AccountType.CASH]: () => (
		<svg width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2'>
			<rect x='3' y='6' width='18' height='12' rx='2'/>
			<circle cx='12' cy='12' r='2.5'/>
		</svg>
	),
	[AccountType.OTHER]: () => (
		<svg width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2'>
			<circle cx='12' cy='12' r='9'/>
			<path d='M8 12h8M12 8v8'/>
		</svg>
	),
	[AccountType.SAVINGS]: () => (
		<svg width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2'>
			<path d='M12 3v18M7 8c0-2 2.2-3.5 5-3.5s5 1.5 5 3.5-2.2 3.5-5 3.5S7 13 7 15s2.2 3.5 5 3.5 5-1.5 5-3.5'/>
		</svg>
	)
};

type Props = {
	accountType: AccountTypeValue;
	class?: string;
	style?: JSX.CSSProperties;
};

export function AccountIcon(props: Props) {
	return (
		<span
			aria-hidden='true'
			class={cn(css.root, props.class)}
			style={props.style}
		>
			{iconClassByAccountType[props.accountType]()}
		</span>
	);
}
