import { MotiPressable } from 'moti/interactions';
import type { ComponentProps } from 'react';

type Props = ComponentProps<typeof MotiPressable>;

export function PressableScale({ children, ...props }: Props) {
  return (
    <MotiPressable
      animate={({ pressed }) => ({
        scale: pressed ? 0.96 : 1,
      })}
      transition={{ type: 'timing', duration: 120 }}
      {...props}>
      {children}
    </MotiPressable>
  );
}
