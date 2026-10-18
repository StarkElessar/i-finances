// Same entry stylesheet as the app (main.tsx): IBM Plex Sans, tokens, resets.
import '../src/styles/global.scss';

import type { Decorator, Preview } from 'storybook-solidjs-vite';

// Widths of the mockup boards (390 phone, 768 tablet, 1024 and 1280 desktop).
const VIEWPORTS = {
	phone: { name: '390 · телефон', styles: { width: '390px', height: '844px' }, type: 'mobile' },
	tablet: { name: '768 · планшет', styles: { width: '768px', height: '1024px' }, type: 'tablet' },
	laptop: { name: '1024 · малый десктоп', styles: { width: '1024px', height: '768px' }, type: 'desktop' },
	desktop: { name: '1280 · десктоп', styles: { width: '1280px', height: '800px' }, type: 'desktop' }
} as const;

// The app themes through `[data-theme]` on an ancestor (see shared/styles/tokens.scss), so the
// decorator sets the same attribute on <html> of the preview iframe.
const withTheme: Decorator = (Story, context) => {
	document.documentElement.dataset.theme = context.globals.theme === 'dark' ? 'dark' : 'light';

	return <Story/>;
};

const preview: Preview = {
	decorators: [withTheme],
	globalTypes: {
		theme: {
			description: 'Тема интерфейса',
			toolbar: {
				title: 'Тема',
				icon: 'circlehollow',
				dynamicTitle: true,
				items: [
					{ value: 'light', title: 'Светлая', icon: 'sun' },
					{ value: 'dark', title: 'Тёмная', icon: 'moon' }
				]
			}
		}
	},
	initialGlobals: {
		theme: 'light'
	},
	parameters: {
		// The page background comes from the `--color-canvas` token, not from the addon.
		backgrounds: { disabled: true },
		layout: 'padded',
		viewport: { options: VIEWPORTS },
		controls: { expanded: true }
	}
};

export default preview;
