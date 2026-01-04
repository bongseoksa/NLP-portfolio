import { css } from '../../../styled-system/css';

interface ProgressBarProps {
    label: string;
    time: number;
    percentage: number;
    color: string;
}

export default function ProgressBar({ label, time, percentage, color }: ProgressBarProps) {
    // 색상 매핑 (Panda CSS 토큰을 실제 색상 값으로 변환)
    const colorMap: Record<string, string> = {
        'blue.500': '#3b82f6',
        'green.500': '#22c55e',
        'orange.500': '#f97316',
        'purple.500': '#a855f7',
    };

    const fillColor = colorMap[color] || color;

    return (
        <div className={css({ mb: 3 })}>
            <div className={css({
                display: 'flex',
                justifyContent: 'space-between',
                mb: 1,
                fontSize: 'sm'
            })}>
                <span className={css({ fontWeight: '500' })}>{label}</span>
                <span className={css({ fontWeight: 'bold' })} style={{ color: fillColor }}>
                    {time}ms ({percentage.toFixed(1)}%)
                </span>
            </div>
            <div className={css({
                w: '100%',
                h: '20px',
                bg: 'gray.200',
                borderRadius: 'md',
                overflow: 'hidden',
                position: 'relative'
            })}>
                <div
                    style={{
                        width: `${percentage}%`,
                        height: '100%',
                        backgroundColor: fillColor,
                        transition: 'width 0.5s ease-in-out'
                    }}
                />
            </div>
        </div>
    );
}
