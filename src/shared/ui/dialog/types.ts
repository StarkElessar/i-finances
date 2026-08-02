import type { ButtonProps } from '~/shared/ui/button';

import type { Accessor, JSX } from 'solid-js';

export type DialogContentElement = 'section' | 'form' | 'div';
export type DialogActionIntent = 'cancel' | 'confirm' | 'danger' | 'default';
export type DialogState = 'open' | 'closing';

export type DialogRenderProps = {
	close: () => void;
	isOpen: Accessor<boolean>;
	isPresent: Accessor<boolean>;
	open: () => void;
	setOpen: (open: boolean) => void;
};

export type DialogContextValue = DialogRenderProps & {
	contentId: string;
	descriptionId: Accessor<string | undefined>;
	setContentElement: (element: HTMLElement) => void;
	setDescriptionId: (id: string | undefined) => void;
	setTitleId: (id: string | undefined) => void;
	state: Accessor<DialogState>;
	titleId: Accessor<string | undefined>;
};

export type DialogRootProps = {
	children: JSX.Element | ((dialog: DialogRenderProps) => JSX.Element);
	class?: string;
	closeOnBackdropClick?: boolean;
	closeOnEscape?: boolean;
	defaultOpen?: boolean;
	mount?: Node;
	onOpenChange?: (open: boolean) => void;
	open?: boolean;
};

type DialogContentNativeProps = Omit<JSX.HTMLAttributes<HTMLElement>, 'children' | 'class' | 'onSubmit'>;

export type DialogContentProps = DialogContentNativeProps &
	Pick<JSX.FormHTMLAttributes<HTMLFormElement>, 'action' | 'method' | 'noValidate' | 'onSubmit'> & {
		as?: DialogContentElement;
		children: JSX.Element;
		class?: string;
	};

export type DialogHeaderProps = {
	children: JSX.Element;
	class?: string;
	closeLabel?: string;
	hideCloseButton?: boolean;
};

export type DialogKickerProps = {
	children: JSX.Element;
	class?: string;
};

export type DialogTitleProps = {
	children: JSX.Element;
	class?: string;
	id?: string;
};

export type DialogDescriptionProps = {
	children: JSX.Element;
	class?: string;
	id?: string;
};

export type DialogBodyProps = {
	children: JSX.Element;
	class?: string;
};

export type DialogFooterProps = {
	children: JSX.Element | ((dialog: DialogRenderProps) => JSX.Element);
	class?: string;
};

export type DialogActionProps = ButtonProps & {
	closeOnClick?: boolean;
	intent?: DialogActionIntent;
};

export type DialogCloseProps = Omit<ButtonProps, 'children'> & {
	children?: JSX.Element;
	label?: string;
};
