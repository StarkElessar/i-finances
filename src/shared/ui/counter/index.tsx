import css from './counter.module.scss';

import { createSignal } from 'solid-js';

export function Counter() {
    const [count, setCount] = createSignal(0);
    return (
        <button class={css.increment} onClick={() => setCount(count() + 1)} type='button'>
            Clicks: {count()}
        </button>
    );
}
