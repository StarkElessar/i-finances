import type { StorybookConfig } from 'storybook-solidjs-vite';

const config: StorybookConfig = {
	framework: 'storybook-solidjs-vite',
	stories: ['../src/**/*.stories.tsx'],
	addons: ['storybook-addon-pseudo-states']
};

export default config;
