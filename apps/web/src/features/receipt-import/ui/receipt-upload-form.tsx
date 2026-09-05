import { createSignal } from 'solid-js';

export type ReceiptUploadFormProps = {
	onUpload: (image: File) => Promise<void>;
};

export function ReceiptUploadForm(props: ReceiptUploadFormProps) {
	const [isSubmitting, setIsSubmitting] = createSignal(false);

	const handleSubmit = async (event: SubmitEvent & { currentTarget: HTMLFormElement }) => {
		event.preventDefault();
		const input = event.currentTarget.elements.namedItem('image');

		if (!(input instanceof HTMLInputElement) || input.files?.[0] === undefined) {
			return;
		}

		setIsSubmitting(true);

		try {
			await props.onUpload(input.files[0]);
			event.currentTarget.reset();
		}
		finally {
			setIsSubmitting(false);
		}
	};

	return (
		<form class='receipt-upload-form' onSubmit={handleSubmit}>
			<label>
				<span>Фотография чека</span>
				<input accept='image/jpeg,image/png,image/heic' name='image' required type='file'/>
			</label>
			<button disabled={isSubmitting()} type='submit'>
				{isSubmitting() ? 'Загружаем…' : 'Загрузить чек'}
			</button>
		</form>
	);
}
