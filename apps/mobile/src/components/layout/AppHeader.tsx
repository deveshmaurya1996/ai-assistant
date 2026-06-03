import { ScreenHeader } from '@/components/layout/ScreenHeader';

type Props = {
  title: string;
  leading?: 'menu' | 'back';
};

export function AppHeader({ title, leading = 'menu' }: Props) {
  return (
    <ScreenHeader
      title={title}
      variant="page"
      leading={leading}
      trailing={null}
      titleAlign="left"
    />
  );
}
