import { useNavigation } from 'expo-router';
import { DrawerActions } from 'expo-router/react-navigation';

type Nav = {
  getState: () => { type: string };
  getParent: () => Nav | undefined;
  dispatch: (action: { readonly type: string }) => void;
};

function getDrawerNavigation(navigation: ReturnType<typeof useNavigation>): Nav {
  let current: Nav | undefined = navigation as Nav;
  while (current) {
    if (current.getState().type === 'drawer') {
      return current;
    }
    current = current.getParent();
  }
  return navigation as Nav;
}

export function useDrawerNavigation() {
  const navigation = useNavigation();
  const drawer = getDrawerNavigation(navigation);

  const openDrawer = () => {
    drawer.dispatch(DrawerActions.openDrawer());
  };

  const closeDrawer = () => {
    drawer.dispatch(DrawerActions.closeDrawer());
  };

  return { openDrawer, closeDrawer };
}
