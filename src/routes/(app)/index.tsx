import type { RouteDefinition } from '@solidjs/router';

import { getAccounts } from '~/entities/account/api';
import { HomePage } from '~/views/home/page';

export const route = {
    preload: () => getAccounts()
} satisfies RouteDefinition;

export default function Home() {
    return <HomePage/>;
}
