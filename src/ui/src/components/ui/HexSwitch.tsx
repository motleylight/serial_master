import { SegmentedSwitch } from './SegmentedSwitch';
// unused import removed

interface HexSwitchProps {
    checked: boolean;
    onChange: (checked: boolean) => void;
    size?: 'sm' | 'md';
    className?: string;
}

export function HexSwitch({ checked, onChange, size = 'sm', className }: HexSwitchProps) {
    return (
        <SegmentedSwitch
            value={checked ? 'HEX' : 'ASCII'}
            onChange={(val) => onChange(val === 'HEX')}
            size={size}
            className={className}
        />
    );
}
