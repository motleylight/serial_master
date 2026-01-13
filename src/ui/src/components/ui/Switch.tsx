// import * as React from 'react';
import { cn } from '../../lib/utils';

interface SwitchProps {
    checked: boolean;
    onCheckedChange: (checked: boolean) => void;
    className?: string;
    size?: 'sm' | 'md';
}

export function Switch({ checked, onCheckedChange, className, size = 'sm' }: SwitchProps) {
    return (
        <button
            type="button"
            role="switch"
            aria-checked={checked}
            onClick={() => onCheckedChange(!checked)}
            className={cn(
                "group relative inline-flex shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50",
                checked ? "bg-primary" : "bg-input",
                size === 'sm' ? "h-5 w-9" : "h-6 w-11",
                className
            )}
        >
            <span
                className={cn(
                    "pointer-events-none block rounded-full bg-background shadow-lg ring-0 transition-transform data-[state=checked]:translate-x-full data-[state=unchecked]:translate-x-0",
                    size === 'sm' ? "h-4 w-4 data-[state=checked]:translate-x-4" : "h-5 w-5 data-[state=checked]:translate-x-5"
                )}
                data-state={checked ? "checked" : "unchecked"}
            />
        </button>
    );
}
