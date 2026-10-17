const DARK_TEXT = '#172033';
const LIGHT_TEXT = '#ffffff';
// Relative luminance of #172033 (+0.05 offset) and of white (+0.05 offset).
const DARK_TEXT_LUMINANCE_OFFSET = 0.0645;
const LIGHT_TEXT_LUMINANCE_OFFSET = 1.05;

function toLinearChannel(hexPair: string): number {
	const channel = Number.parseInt(hexPair, 16) / 255;

	return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}

/**
 * Picks white or dark text for a `#rrggbb` background by WCAG contrast.
 * Accounts allow any custom colour, so text over it cannot be assumed white.
 */
export function getReadableTextColor(hexColor: string): string {
	const match = /^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(hexColor);

	if (match === null) {
		return LIGHT_TEXT;
	}

	const luminance = 0.2126 * toLinearChannel(match[1])
		+ 0.7152 * toLinearChannel(match[2])
		+ 0.0722 * toLinearChannel(match[3]);
	const contrastWithWhite = LIGHT_TEXT_LUMINANCE_OFFSET / (luminance + 0.05);
	const contrastWithDark = (luminance + 0.05) / DARK_TEXT_LUMINANCE_OFFSET;

	return contrastWithWhite >= contrastWithDark ? LIGHT_TEXT : DARK_TEXT;
}
