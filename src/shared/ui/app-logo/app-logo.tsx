import css from './app-logo.module.scss';

import { cn } from '~/shared/lib';

type Props = {
    class?: string;
};

export function AppLogo(props: Props) {
    return <div class={cn(css.root, props.class)}>iF</div>;
}
