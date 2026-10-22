/**
 * Puts `text` on the clipboard. Returns false when the browser refuses (no permission, an insecure page, an old
 * browser); the caller then tells the person to copy by hand. Never throws and never reports the text.
 */
export async function copyText(text: string): Promise<boolean> {
	try {
		await navigator.clipboard.writeText(text);
		return true;
	}
	catch {
		return false;
	}
}
