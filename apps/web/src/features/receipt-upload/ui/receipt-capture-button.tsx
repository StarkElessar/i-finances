import css from './receipt-capture-button.module.scss';

import { Fab } from '@/shared/ui/fab';

import { Camera } from 'lucide-solid';
import type { JSX } from 'solid-js';

import { RECEIPT_IMAGE_ACCEPT } from '../lib/receipt-file-rules';
import { useReceiptUpload } from '../model/receipt-upload-context';

/**
 * Phone shortcut «добавить из чека»: one tap opens the system sheet of the phone (take a photo, photo library,
 * files), the chosen photos go straight to the server. No `capture` attribute: it would send the phone to the camera
 * and hide the library.
 */
export function ReceiptCaptureButton() {
	const { upload } = useReceiptUpload();
	let input: HTMLInputElement | undefined;

	const handleChange: JSX.EventHandler<HTMLInputElement, Event> = (event) => {
		const files = [...event.currentTarget.files ?? []];

		// Clear the field so that picking the same photo again fires `change` again.
		event.currentTarget.value = '';
		upload(files);
	};

	return (
		<>
			<Fab aria-label='Добавить из чека' variant='secondary' onClick={() => input?.click()}>
				<Camera size={22}/>
			</Fab>
			<input
				ref={input}
				aria-hidden='true'
				accept={RECEIPT_IMAGE_ACCEPT}
				class={css.input}
				multiple
				tabIndex={-1}
				type='file'
				onChange={handleChange}
			/>
		</>
	);
}
