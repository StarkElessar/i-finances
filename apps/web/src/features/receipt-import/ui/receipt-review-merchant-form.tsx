import type { ReceiptWorkerResult } from '@i-finances/contracts';

export type ReceiptReviewMerchantFormProps = {
	result: ReceiptWorkerResult;
};

export function ReceiptReviewMerchantForm(props: ReceiptReviewMerchantFormProps) {
	return (
		<div class='receipt-review-merchant'>
			<label>
				<span>Дата</span>
				<input name='happenedOn' required type='date' value={props.result.receipt.happenedOn}/>
			</label>
			<label>
				<span>Название продавца</span>
				<input name='merchant-display-name' value={props.result.receipt.merchant.displayName ?? ''}/>
			</label>
			<label>
				<span>Юридическое название</span>
				<input name='merchant-legal-name' value={props.result.receipt.merchant.legalName ?? ''}/>
			</label>
			<label>
				<span>Адрес</span>
				<input name='merchant-address' value={props.result.receipt.merchant.address ?? ''}/>
			</label>
			<label>
				<span>УНП</span>
				<input name='merchant-unp' value={props.result.receipt.merchant.unp ?? ''}/>
			</label>
			<label>
				<span>Итог чека</span>
				<input
					inputmode='decimal'
					name='total-amount'
					required
					value={(props.result.receipt.totalAmountMinor / 100).toFixed(2)}
				/>
			</label>
		</div>
	);
}
