import css from './operation-details-panel.module.scss';

import { CalendarDays, Plus, Tag, WalletCards, X } from 'lucide-solid';
import { Show } from 'solid-js';
import { Portal } from 'solid-js/web';

import type { Account } from '~/entities/account';
import type { OperationWithBalance } from '~/entities/operation';
import { cn, formatDate, formatMinorUnitsCurrency } from '~/shared/lib';
import { Button } from '~/shared/ui/button';

type OperationDetailsPanelProps = {
    account: Account;
    mobile: boolean;
    mode: 'create' | 'view';
    operation?: OperationWithBalance;
    onClose: () => void;
};

export function OperationDetailsPanel(props: OperationDetailsPanelProps) {
    const panel = () => (
        <aside
            aria-label={props.mode === 'create' ? 'Новая операция' : 'Детали операции'}
            class={cn(css.panel, props.mobile ? css.panelMobile : css.panelDesktop)}
        >
            <header class={css.header}>
                <div>
                    <div class={css.kicker}>{props.mode === 'create' ? 'Создание' : 'Операция'}</div>
                    <h2 class={css.title}>
                        {props.mode === 'create' ? 'Новая операция' : props.operation?.title}
                    </h2>
                </div>
                <Button
                    aria-label='Закрыть панель'
                    iconOnly
                    size='sm'
                    variant='ghost'
                    onClick={props.onClose}
                >
                    <X size={18}/>
                </Button>
            </header>

            <Show
                fallback={(
                    <div class={css.createPlaceholder}>
                        <span class={css.placeholderIcon}><Plus size={22}/></span>
                        <strong>Новая операция</strong>
                        <span>{props.account.name}</span>
                    </div>
                )}
                when={props.mode === 'view' && props.operation}
            >
                {(operation) => (
                    <div class={css.content}>
                        <div
                            class={cn(
                                css.amount,
                                operation().type === 'income' ? css.amountPositive : css.amountNegative
                            )}
                        >
                            {formatMinorUnitsCurrency(
                                operation().signedAmountMinor,
                                operation().currency
                            )}
                        </div>
                        <dl class={css.details}>
                            <div>
                                <dt><CalendarDays size={15}/>Дата</dt>
                                <dd>{formatDate(`${operation().happenedOn}T12:00:00`)}</dd>
                            </div>
                            <div>
                                <dt><WalletCards size={15}/>Счёт</dt>
                                <dd>{props.account.name}</dd>
                            </div>
                            <div>
                                <dt><Tag size={15}/>Категория</dt>
                                <dd>{operation().categoryName ?? 'Без категории'}</dd>
                            </div>
                            <div>
                                <dt>Контакт</dt>
                                <dd>{operation().contactName ?? 'Не указан'}</dd>
                            </div>
                            <div>
                                <dt>Баланс после операции</dt>
                                <dd>{formatMinorUnitsCurrency(
                                    operation().balanceAfterMinor,
                                    operation().currency
                                )}</dd>
                            </div>
                            <Show when={operation().comment}>
                                <div>
                                    <dt>Комментарий</dt>
                                    <dd>{operation().comment}</dd>
                                </div>
                            </Show>
                        </dl>
                    </div>
                )}
            </Show>
        </aside>
    );

    return (
        <Show fallback={panel()} when={props.mobile}>
            <Portal>
                <button
                    aria-label='Закрыть панель операции'
                    class={css.backdrop}
                    type='button'
                    onClick={props.onClose}
                />
                {panel()}
            </Portal>
        </Show>
    );
}
