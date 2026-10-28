// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import { createRoot, createSignal, Show } from 'solid-js';
import { render } from 'solid-js/web';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createToaster, type Toaster } from './create-toaster';
import { ToastContainer } from './toast-container';

let dispose = () => undefined as void;

function mountToaster(): Toaster {
	const host = document.createElement('div');
	let toaster: Toaster | undefined;
	document.body.append(host);
	dispose = render(() => {
		toaster = createToaster();
		return <ToastContainer toaster={toaster}/>;
	}, host);

	if (!toaster) {
		throw new Error('Toaster was not mounted');
	}

	return toaster;
}

beforeEach(() => vi.useFakeTimers());

afterEach(() => {
	dispose();
	document.body.replaceChildren();
	// jsdom schedules selectionchange when the external focus target is removed.
	vi.runOnlyPendingTimers();
	expect(vi.getTimerCount()).toBe(0);
	vi.useRealTimers();
});

describe('Toast', () => {
	it('announces info/success/warning as status and errors as alert without moving focus', () => {
		const toaster = mountToaster();
		const button = document.createElement('button');
		document.body.append(button);
		button.focus();

		for (const tone of ['info', 'success', 'warning', 'error'] as const) {
			toaster.show({ message: `Сообщение: ${tone}`, tone });
			const messages = document.querySelectorAll('[role="status"], [role="alert"]');
			const message = messages[messages.length - 1];
			expect(message).toHaveRole(tone === 'error' ? 'alert' : 'status');
			expect(message).toHaveAttribute('aria-atomic', 'true');
			expect(button).toHaveFocus();
		}
		expect(document.querySelector('[role="region"]')).toHaveAccessibleName('Уведомления');
	});

	it('uses 4 seconds for ordinary feedback, 8 with actions and persistent errors', () => {
		const toaster = mountToaster();
		toaster.show({ message: 'Сведения' });
		toaster.show({ message: 'Операция добавлена', tone: 'success', action: { label: 'Отменить', onClick: vi.fn() } });
		toaster.show({ message: 'Ошибка', tone: 'error' });
		vi.advanceTimersByTime(3999);
		expect(toaster.toasts()).toHaveLength(3);
		vi.advanceTimersByTime(1);
		expect(toaster.toasts().map((toast) => toast.message)).toEqual(['Операция добавлена', 'Ошибка']);
		vi.advanceTimersByTime(4000);
		expect(document.querySelector('[role="status"]')).toBeNull();
		vi.advanceTimersByTime(60000);
		expect(document.querySelector('[role="alert"]')).toHaveTextContent('Ошибка');
	});

	it('keeps only three, newest below, and cancels the evicted timer', () => {
		const toaster = mountToaster();
		for (const message of ['Первый', 'Второй', 'Третий', 'Четвёртый']) {
			toaster.show({ message });
		}
		expect([...document.querySelectorAll('[role="status"]')].map((toast) => toast.textContent)).toEqual([
			'Второй', 'Третий', 'Четвёртый'
		]);
		expect(vi.getTimerCount()).toBe(3);
	});

	it('closes through the button and runs an action only while the toast is visible', () => {
		const toaster = mountToaster();
		const retry = vi.fn();
		toaster.show({ message: 'Не удалось сохранить', tone: 'error', action: { label: 'Повторить', onClick: retry } });
		const action = document.querySelector('button') as HTMLButtonElement;
		action.click();
		expect(retry).toHaveBeenCalledOnce();
		expect(toaster.toasts()).toHaveLength(0);
		expect(document.querySelector('[role="alert"]')).toBeNull();
		toaster.show({ message: 'Ошибка', tone: 'error' });
		const close = document.querySelector('button') as HTMLButtonElement;
		expect(close).toHaveAccessibleName('Закрыть уведомление');
		close.click();
		expect(toaster.toasts()).toHaveLength(0);
	});

	it('pauses on hover and focus independently, retaining the remaining duration', () => {
		const toaster = mountToaster();
		toaster.show({ message: 'Сообщение' });
		const toast = document.querySelector('[role="status"]') as HTMLDivElement;
		const close = toast.querySelector('button') as HTMLButtonElement;
		vi.advanceTimersByTime(1500);
		toast.dispatchEvent(Object.assign(new Event('pointerenter'), { pointerType: 'mouse' }));
		close.focus();
		vi.advanceTimersByTime(10000);
		toast.dispatchEvent(Object.assign(new Event('pointerleave'), { pointerType: 'mouse' }));
		vi.advanceTimersByTime(10000);
		expect(toaster.toasts()).toHaveLength(1);
		close.blur();
		vi.advanceTimersByTime(2499);
		expect(toaster.toasts()).toHaveLength(1);
		vi.advanceTimersByTime(1);
		expect(toaster.toasts()).toHaveLength(0);
	});

	it('does not treat touch contact as hover', () => {
		const toaster = mountToaster();
		toaster.show({ message: 'Сообщение' });
		const toast = document.querySelector('[role="status"]') as HTMLDivElement;
		toast.dispatchEvent(Object.assign(new Event('pointerenter'), { pointerType: 'touch' }));
		vi.advanceTimersByTime(4000);
		expect(toaster.toasts()).toHaveLength(0);
	});

	it('keeps the timer paused when focus moves between controls in the same toast', () => {
		const toaster = mountToaster();
		toaster.show({ message: 'Операция добавлена', action: { label: 'Отменить', onClick: vi.fn() } });
		const buttons = document.querySelectorAll<HTMLButtonElement>('[role="status"] button');
		vi.advanceTimersByTime(1000);
		buttons[0].focus();
		buttons[1].focus();
		vi.advanceTimersByTime(10000);
		expect(toaster.toasts()).toHaveLength(1);
		buttons[1].blur();
		vi.advanceTimersByTime(7000);
		expect(toaster.toasts()).toHaveLength(0);
	});

	it('gives retries 8 seconds, supports persistent overrides and clears all timers on owner disposal', () => {
		const toaster = mountToaster();
		toaster.show({ message: 'Ошибка', tone: 'error', action: { label: 'Повторить', onClick: vi.fn() } });
		toaster.show({ message: 'Постоянное', duration: 0 });
		vi.advanceTimersByTime(8000);
		expect(toaster.toasts().map((toast) => toast.message)).toEqual(['Постоянное']);
		toaster.show({ message: 'Сведения' });
		dispose();
		expect(vi.getTimerCount()).toBe(0);
		expect(toaster.toasts()).toHaveLength(0);
		toaster.show({ message: 'Поздний ответ' });
		expect(vi.getTimerCount()).toBe(0);
		expect(toaster.toasts()).toHaveLength(0);
	});

	it('resumes a paused toast if its container unmounts while the owner stays alive', () => {
		const host = document.createElement('div');
		const [visible, setVisible] = createSignal(true);
		let toaster: Toaster | undefined;
		document.body.append(host);
		dispose = render(() => {
			toaster = createToaster();
			return <Show when={visible()}><ToastContainer toaster={toaster}/></Show>;
		}, host);

		if (!toaster) {
			throw new Error('Toaster was not mounted');
		}

		toaster.show({ message: 'Сообщение' });
		const toast = document.querySelector('[role="status"]') as HTMLDivElement;
		toast.dispatchEvent(Object.assign(new Event('pointerenter'), { pointerType: 'mouse' }));
		vi.advanceTimersByTime(10000);
		setVisible(false);
		vi.advanceTimersByTime(4000);
		expect(toaster.toasts()).toHaveLength(0);
	});

	it('isolates instances and cancels timers when cleared', () => {
		createRoot((cleanup) => {
			dispose = cleanup;
			const first = createToaster();
			const second = createToaster();
			first.show({ message: 'Первый' });
			second.show({ message: 'Второй' });
			first.clear();
			expect(first.toasts()).toEqual([]);
			expect(second.toasts()).toHaveLength(1);
			expect(vi.getTimerCount()).toBe(1);
		});
	});
});
