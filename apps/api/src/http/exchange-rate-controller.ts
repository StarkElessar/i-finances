import type { AuthenticatedSession } from '@/modules/auth';
import type { ExchangeRateService } from '@/modules/exchange-rate';
import { formatBelarusLocalDateKey } from '@/modules/exchange-rate';
import type { HouseholdResolver } from '@/modules/household';

import { currencyCodeSchema } from '@i-finances/contracts';
import type { Context } from 'hono';

import type { RequestSessionResolver } from './session-resolver';
import type { ApiEnvironment } from './types';

export class ExchangeRateHttpController {
	public constructor(
		private readonly exchangeRateService: ExchangeRateService,
		private readonly householdResolver: HouseholdResolver,
		private readonly sessionResolver: RequestSessionResolver,
		private readonly now: () => Date = () => new Date()
	) {}

	public current() {
		return async (context: Context<ApiEnvironment>): Promise<Response> => {
			const session = await this.requireSession(context);

			if (session === undefined) {
				return this.unauthenticated(context);
			}

			const household = await this.householdResolver.requireForUser(session.user.id);

			return context.json(
				await this.exchangeRateService.getCurrent({
					baseCurrency: household.baseCurrency,
					currencies: currencyCodeSchema.options,
					requestedOn: formatBelarusLocalDateKey(this.now())
				}),
				200
			);
		};
	}

	private async requireSession(
		context: Context<ApiEnvironment>
	): Promise<AuthenticatedSession | undefined> {
		return await this.sessionResolver.resolve(context.req.raw) ?? undefined;
	}

	private unauthenticated(context: Context<ApiEnvironment>): Response {
		return context.json({
			errorCode: 'unauthenticated',
			message: 'Требуется войти в приложение.',
			ok: false
		}, 401);
	}
}
