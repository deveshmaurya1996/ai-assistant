import { useNavigation } from 'expo-router';
import { DrawerActions } from 'expo-router/react-navigation';

export function useDrawerNavigation() {
  const navigation = useNavigation();

  const openDrawer = () => {
    navigation.dispatch(DrawerActions.openDrawer());
  };

  const closeDrawer = () => {
    navigation.dispatch(DrawerActions.closeDrawer());
  };

  return { openDrawer, closeDrawer };
}
