import { cn } from '../../lib/utils';

interface SegmentedSwitchProps {
    value: 'ASCII' | 'HEX';
    onChange: (value: 'ASCII' | 'HEX') => void;
    className?: string;
    size?: 'sm' | 'md';
}

export function SegmentedSwitch({ value, onChange, className, size = 'sm' }: SegmentedSwitchProps) {
    return (
        <div
            className={cn(
                "inline-flex bg-muted p-0.5 rounded-lg select-none border border-border/50",
                size === 'sm' ? "h-6 text-[10px]" : "h-8 text-xs",
                className
            )}
        >
            <button
                type="button"
                onClick={() => onChange('ASCII')}
                className={cn(
                    "flex items-center justify-center rounded-md font-medium transition-all focus:outline-none px-2",
                    value === 'ASCII'
                        ? "bg-white text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                )}
            >
                ASCII
            </button>
            <button
                type="button"
                onClick={() => onChange('HEX')}
                className={cn(
                    "flex items-center justify-center rounded-md font-medium transition-all focus:outline-none px-2",
                    value === 'HEX'
                        ? "bg-white text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                )}
            >
                HEX
            </button>
        </div>
    );
}
