import { Fragment, useMemo } from 'react';
import Svg, { Circle, Line } from 'react-native-svg';

const VIEWBOX = 100;
const CENTER = VIEWBOX / 2;
const INNER_R = 11;
const OUTER_R = 6.5;
const ORBIT_R = 30;
const STROKE = 3.4;
const SPOKES = 8;

type Props = {
  size: number;
  color?: string;
};

export function AssistantLogoMark({ size, color = '#FFFFFF' }: Props) {
  const spokes = useMemo(
    () =>
      Array.from({ length: SPOKES }, (_, index) => {
        const angle = (index * Math.PI * 2) / SPOKES - Math.PI / 2;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);

        return {
          line: {
            x1: CENTER + INNER_R * cos,
            y1: CENTER + INNER_R * sin,
            x2: CENTER + (ORBIT_R - OUTER_R) * cos,
            y2: CENTER + (ORBIT_R - OUTER_R) * sin,
          },
          outer: {
            cx: CENTER + ORBIT_R * cos,
            cy: CENTER + ORBIT_R * sin,
          },
        };
      }),
    []
  );

  return (
    <Svg
      width={size}
      height={size}
      viewBox={`0 0 ${VIEWBOX} ${VIEWBOX}`}
      accessibilityLabel="AI Assistant">
      <Circle
        cx={CENTER}
        cy={CENTER}
        r={INNER_R}
        stroke={color}
        strokeWidth={STROKE}
        fill="none"
      />
      {spokes.map((spoke, index) => (
        <Fragment key={index}>
          <Line
            x1={spoke.line.x1}
            y1={spoke.line.y1}
            x2={spoke.line.x2}
            y2={spoke.line.y2}
            stroke={color}
            strokeWidth={STROKE}
            strokeLinecap="round"
          />
          <Circle
            cx={spoke.outer.cx}
            cy={spoke.outer.cy}
            r={OUTER_R}
            stroke={color}
            strokeWidth={STROKE}
            fill="none"
          />
        </Fragment>
      ))}
    </Svg>
  );
}
