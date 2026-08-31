import css from './category-icon.module.scss';

import { cn } from '~/shared/lib';

import { resolveCategoryIconId, type CategoryIconId } from '../model/icons';

import type { LucideIcon } from 'lucide-solid';
import {
	ArrowLeftRight,
	Baby,
	Banknote,
	Bike,
	BookOpen,
	Bookmark,
	Briefcase,
	Building2,
	Bus,
	Candy,
	Car,
	Circle,
	Coffee,
	Droplets,
	Dumbbell,
	Ellipsis,
	FileText,
	Flame,
	Fuel,
	Gamepad2,
	Gift,
	GraduationCap,
	Hammer,
	HandCoins,
	Heart,
	Home,
	KeyRound,
	Landmark,
	Monitor,
	PartyPopper,
	PawPrint,
	Phone,
	PiggyBank,
	Pill,
	Plane,
	Receipt,
	Sandwich,
	Scale,
	ScanFace,
	Shapes,
	Shield,
	Shirt,
	ShoppingCart,
	Sparkles,
	Star,
	Stethoscope,
	Tag,
	TrainFront,
	Tv,
	Utensils,
	Wallet,
	Wifi,
	Wine,
	Wrench,
	Zap
} from 'lucide-solid';
import type { JSX } from 'solid-js';
import { Dynamic } from 'solid-js/web';

const CATEGORY_ICON_COMPONENTS = {
	'tag': Tag,
	'shapes': Shapes,
	'circle': Circle,
	'star': Star,
	'heart': Heart,
	'bookmark': Bookmark,
	'utensils': Utensils,
	'shopping-cart': ShoppingCart,
	'sandwich': Sandwich,
	'candy': Candy,
	'coffee': Coffee,
	'wine': Wine,
	'bus': Bus,
	'car': Car,
	'fuel': Fuel,
	'bike': Bike,
	'plane': Plane,
	'train-front': TrainFront,
	'home': Home,
	'building-2': Building2,
	'key-round': KeyRound,
	'wrench': Wrench,
	'hammer': Hammer,
	'zap': Zap,
	'flame': Flame,
	'droplets': Droplets,
	'wifi': Wifi,
	'phone': Phone,
	'monitor': Monitor,
	'tv': Tv,
	'shirt': Shirt,
	'sparkles': Sparkles,
	'scan-face': ScanFace,
	'stethoscope': Stethoscope,
	'pill': Pill,
	'dumbbell': Dumbbell,
	'baby': Baby,
	'gamepad-2': Gamepad2,
	'party-popper': PartyPopper,
	'gift': Gift,
	'paw-print': PawPrint,
	'graduation-cap': GraduationCap,
	'book-open': BookOpen,
	'briefcase': Briefcase,
	'wallet': Wallet,
	'piggy-bank': PiggyBank,
	'banknote': Banknote,
	'receipt': Receipt,
	'landmark': Landmark,
	'scale': Scale,
	'hand-coins': HandCoins,
	'arrow-left-right': ArrowLeftRight,
	'shield': Shield,
	'file-text': FileText,
	'ellipsis': Ellipsis
} as const satisfies Record<CategoryIconId, LucideIcon>;

/**
 * Props for rendering a category Lucide icon by whitelist id.
 */
export type CategoryIconProps = {
	icon: string;
	class?: string;
	size?: number;
	style?: JSX.CSSProperties;
};

/**
 * Renders the Lucide icon for a category icon id.
 */
export function CategoryIcon(props: CategoryIconProps) {
	return (
		<span aria-hidden='true' class={cn(css.root, props.class)} style={props.style}>
			<Dynamic
				component={CATEGORY_ICON_COMPONENTS[resolveCategoryIconId(props.icon)]}
				size={props.size ?? 18}
				strokeWidth={2.2}
			/>
		</span>
	);
}
